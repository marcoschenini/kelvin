import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DB } from "@/lib/db/client";
import { auditEvents, cases, drafts, outboxMessages, type DraftRow, type OutboxRow } from "@/lib/db/schema";
import type { RecoveryRoute } from "@/lib/domain/parties";
import { formatEUR } from "@/lib/format";
import { getRecord } from "@/lib/case/record";

/**
 * Simulated counterparties. Nothing ever leaves Kelvin: when the Outbox holds a
 * message that has not been answered yet, the counterparty "replies" with a
 * realistic, scripted answer that depends on who they are, what we sent and
 * how far the conversation has gone. Replies are plain incoming Outbox rows,
 * read by the agent's handle_reply tool like any real email would be.
 */

interface ReplyContext {
  route: RecoveryRoute | null;
  kind: DraftRow["kind"];
  /** Replies this counterparty already sent after our claim letter */
  stage: number;
  claimEur: number | null;
  shipmentRef: string;
  noticeLapsed: boolean;
  counterparty: string;
}

const sign = (name: string) => `Kind regards,\nClaims Department\n${name}`;

function scriptedReply(c: ReplyContext): string {
  if (c.kind === "protective_notice") {
    return c.route === "carrier"
      ? `Dear Sir or Madam,\n\nwe acknowledge receipt of your notice of damage for shipment ${c.shipmentRef}. We have opened file BX-CL-${c.shipmentRef.slice(-4)} and asked our ground handler for the ramp records.\n\nPlease note that any liability of the carrier is subject to the limits of the Montreal Convention, Article 22(3), unless a special declaration of value was made.\n\n${sign(c.counterparty)}`
      : `Dear Sir or Madam,\n\nwe acknowledge receipt of your notice for shipment ${c.shipmentRef} and have started an internal investigation at our hub. We will revert once your quality assessment is available.\n\n${sign(c.counterparty)}`;
  }
  if (c.kind === "info_request") {
    return `Hello,\n\nplease find the requested information attached.\n\n${sign(c.counterparty)}`;
  }
  // Claim letter or our follow-up reply in the claim thread
  if (c.noticeLapsed && c.stage === 0) {
    return `Dear Sir or Madam,\n\nwe have reviewed your claim for shipment ${c.shipmentRef}. We regret that the claim is rejected: notice was received out of time under the applicable notice provisions. We reserve all rights.\n\n${sign(c.counterparty)}`;
  }
  const claim = c.claimEur ?? 0;
  switch (c.route) {
    case "insurer":
      return c.stage === 0
        ? `Dear Sir or Madam,\n\nthank you for your claim notification for shipment ${c.shipmentRef}. To complete our assessment, please send the commercial invoice evidencing the insured value and confirm the Quality Assurance disposition.\n\n${sign(c.counterparty)}`
        : `Dear Sir or Madam,\n\nthank you for the documents. Cover under the temperature deviation extension is confirmed and we accept your claim. Payment of ${formatEUR(claim)} has been remitted to your account today. We will pursue our subrogated rights against the carrier.\n\n${sign(c.counterparty)}`;
    case "forwarder": {
      if (c.stage === 0) {
        const offer = Math.round((claim * 0.9) / 5000) * 5000;
        return `Dear Sir or Madam,\n\nwe have completed our investigation of shipment ${c.shipmentRef} and accept liability in principle. Taking into account the peak-volume circumstances at our hub, we offer ${formatEUR(offer)} in full and final settlement of your claim.\n\n${sign(c.counterparty)}`;
      }
      if (c.stage === 1) {
        const offer = Math.round((claim * 0.95) / 2500) * 2500;
        return `Dear Sir or Madam,\n\nthank you for the additional evidence on shipment ${c.shipmentRef}. We have reviewed it, continue to accept liability in principle and increase our offer to ${formatEUR(offer)} in full and final settlement of your claim.\n\n${sign(c.counterparty)}`;
      }
      return `Dear Sir or Madam,\n\nhaving reviewed clause 6.2 of our agreement, we accept your claim in full. Payment of ${formatEUR(claim)} has been transferred to your account today.\n\n${sign(c.counterparty)}`;
    }
    case "carrier":
      return `Dear Sir or Madam,\n\nwe accept liability for the damage to shipment ${c.shipmentRef} within the limits of Article 22(3) of the Montreal Convention. Payment of ${formatEUR(claim)} has been remitted to your account.\n\n${sign(c.counterparty)}`;
    default:
      return `Dear Sir or Madam,\n\nwe acknowledge receipt of your message regarding shipment ${c.shipmentRef}.\n\n${sign(c.counterparty)}`;
  }
}

/** Outgoing messages that have not been answered yet (by counterparty thread). */
export async function unansweredMessages(db: DB, caseId: string): Promise<OutboxRow[]> {
  const all = await db.select().from(outboxMessages).where(eq(outboxMessages.caseId, caseId)).orderBy(asc(outboxMessages.at));
  return all.filter((m) => m.direction === "out" && !all.some((r) => r.direction === "in" && r.fromAddress === m.toAddress && r.at >= m.at));
}

/** Generates the replies that are due now and stores them as incoming Outbox messages. */
export async function deliverDueReplies(db: DB, caseId: string, now = new Date()): Promise<OutboxRow[]> {
  const pending = await unansweredMessages(db, caseId);
  if (!pending.length) return [];
  const record = await getRecord(db, caseId);
  const [row] = await db.select().from(cases).where(eq(cases.id, caseId));
  const all = await db.select().from(outboxMessages).where(eq(outboxMessages.caseId, caseId));
  const out: OutboxRow[] = [];
  let tick = 0;

  for (const m of pending) {
    const [draft] = m.draftId ? await db.select().from(drafts).where(eq(drafts.id, m.draftId)) : [];
    const kind = draft?.kind ?? "reply";
    const route = (draft?.route as RecoveryRoute | null) ?? (row?.recommendedRoute as RecoveryRoute | null) ?? null;
    // Where is this counterparty in the claim conversation?
    const claimSent = all.find((x) => x.direction === "out" && x.toAddress === m.toAddress && x.subject.startsWith("Claim for"));
    const stage = claimSent ? all.filter((x) => x.direction === "in" && x.fromAddress === m.toAddress && x.at >= claimSent.at).length : 0;
    const ranked = record.ranking?.find((r) => r.route === route);
    const notice = all.find((x) => x.direction === "out" && x.toAddress === m.toAddress && x !== claimSent && /^Notice/.test(x.subject));
    const noticeLapsed = kind === "claim_letter" && !!ranked?.noticeDeadline && ranked.noticeDeadline.daysLeft < 0 && !notice;

    const body = scriptedReply({
      route,
      kind,
      stage,
      claimEur: draft?.amountEur ?? row?.claimAmountEur ?? null,
      shipmentRef: row?.shipmentRef ?? caseId,
      noticeLapsed,
      counterparty: m.counterparty === "carrier" || m.counterparty === "forwarder" || m.counterparty === "insurer" ? (draft?.recipientName ?? m.counterparty) : m.counterparty,
    });
    const [reply] = await db
      .insert(outboxMessages)
      .values({
        id: `msg-${nanoid(8)}`,
        caseId,
        direction: "in",
        counterparty: draft?.recipientName ?? m.counterparty,
        fromAddress: m.toAddress,
        toAddress: m.fromAddress,
        subject: m.subject.startsWith("Re:") ? m.subject : `Re: ${m.subject}`,
        body,
        at: new Date(now.getTime() + tick++ * 1000),
      })
      .returning();
    await db.insert(auditEvents).values({
      caseId,
      actorType: "counterparty",
      actorName: reply.counterparty,
      eventType: "reply_received",
      input: { inReplyTo: m.id },
      output: { messageId: reply.id, subject: reply.subject, simulated: true },
    });
    out.push(reply);
  }
  return out;
}

/** Who we are waiting for (for the "awaiting reply" indicator). */
export async function awaitingReplyFrom(db: DB, caseId: string): Promise<string | null> {
  const pending = await unansweredMessages(db, caseId);
  if (!pending.length) return null;
  const [d] = pending[0].draftId ? await db.select().from(drafts).where(and(eq(drafts.id, pending[0].draftId))) : [];
  return d?.recipientName ?? pending[0].counterparty;
}
