import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { cases, decisions, documents, drafts, outboxMessages } from "@/lib/db/schema";
import { formatEUR } from "@/lib/format";
import { getRecord, patchRecord } from "@/lib/case/record";
import { transition } from "@/lib/case/status-machine";
import { buildEvidencePack } from "@/lib/pdf/evidence-pack";
import { putFile, readFile } from "@/lib/storage";
import { canAppeal, remindersDue } from "@/lib/rules/followup";
import type { RecoveryRoute } from "@/lib/domain/parties";
import type { Citation } from "@/lib/domain/citation";
import type { CaseRow, DraftRow, OutboxRow } from "@/lib/db/schema";
import { registerCitations } from "@/lib/case/record";
import { getCaseRow, qaCitation, qaStatus } from "../assess";
import type { AgentContext } from "../tool";
import { docText, findDocument } from "../docs";
import { defineTool, ToolGuardError } from "../tool";

const AGENT = { type: "agent" as const, name: "Kelvin agent" };

/* ======================================================= build_evidence_pack */

export const buildEvidencePackTool = defineTool({
  name: "build_evidence_pack",
  description:
    "Bundle the timeline chart, logger extract, citation index, cited source pages and the claim letter into one exportable PDF. Run after draft_claim_letter.",
  input: z.object({}),
  async run(_input, ctx) {
    const [row, record] = await Promise.all([getCaseRow(ctx.db, ctx.caseId), getRecord(ctx.db, ctx.caseId)]);
    if (!record.claim) throw new ToolGuardError("Draft the claim letter first.");
    const [letter] = await ctx.db.select().from(drafts).where(eq(drafts.id, record.claim.draftId));
    const loggerDoc = await findDocument(ctx.db, ctx.caseId, "logger");
    if (!loggerDoc) throw new ToolGuardError("No logger file.");
    const readings = (await docText(loggerDoc))
      .split(/\r?\n/)
      .filter((l) => /^\d+,/.test(l))
      .map((l) => {
        const [r, ts, t] = l.split(",");
        return { row: Number(r), at: new Date(ts), t: Number(t) };
      });
    const citations = (letter?.citations ?? []) as import("@/lib/domain/citation").Citation[];
    const pagesByDoc = new Map<string, Set<number>>();
    for (const c of citations) if (c.documentId && c.page) (pagesByDoc.get(c.documentId) ?? pagesByDoc.set(c.documentId, new Set()).get(c.documentId)!).add(c.page);
    const srcDocs = pagesByDoc.size
      ? await ctx.db.select().from(documents).where(inArray(documents.id, [...pagesByDoc.keys()]))
      : [];
    const sources = [];
    for (const d of srcDocs.filter((x) => x.mime === "application/pdf")) {
      sources.push({ documentId: d.id, title: d.title, bytes: new Uint8Array(await readFile(d.storagePath)), pages: [...pagesByDoc.get(d.id)!].sort((a, b) => a - b) });
    }
    const pack = await buildEvidencePack({
      caseRef: row.shipmentRef,
      title: row.title,
      record,
      readings,
      letter: letter ? { subject: letter.subject, body: letter.body, recipient: letter.recipientName, amountEur: letter.amountEur } : null,
      citations: citations.filter((c) => c.kind !== "assumption"),
      sources,
      generatedAt: ctx.now,
    });
    const id = `${ctx.caseId}-evidence-pack`;
    const filename = `Evidence-pack-${row.shipmentRef}.pdf`;
    const storagePath = `cases/${ctx.caseId}/${filename}`;
    await putFile(storagePath, pack.bytes);
    await ctx.db.delete(documents).where(eq(documents.id, id));
    await ctx.db.insert(documents).values({
      id,
      caseId: ctx.caseId,
      kind: "evidence_pack",
      title: `Evidence pack ${row.shipmentRef}`,
      filename,
      mime: "application/pdf",
      storagePath,
      sizeBytes: pack.bytes.byteLength,
      pages: pack.pages,
    });
    if (letter) {
      const annexes = letter.annexes.includes(filename) ? letter.annexes : [...letter.annexes.filter((a) => !a.startsWith("Evidence pack")), `Evidence pack (${filename})`];
      await ctx.db.update(drafts).set({ annexes }).where(eq(drafts.id, letter.id));
    }
    await patchRecord(ctx.db, ctx.caseId, { claim: { ...record.claim, evidencePackId: id } });
    return {
      output: { documentId: id, pages: pack.pages, appendedSourcePages: sources.reduce((n, s) => n + s.pages.length, 0) },
      summary: `Evidence pack built: ${pack.pages} pages incl. timeline chart, logger extract, citation index and ${sources.reduce((n, s) => n + s.pages.length, 0)} cited source pages.`,
    };
  },
});

/* ============================================================ send_via_outbox */

export const sendViaOutbox = defineTool({
  name: "send_via_outbox",
  description:
    "Put an approved draft in the simulated Outbox (nothing leaves the app). Refuses unless a manager approval decision exists for that draft.",
  input: z.object({ draftId: z.string() }),
  async run({ draftId }, ctx) {
    const [draft] = await ctx.db
      .select()
      .from(drafts)
      .where(and(eq(drafts.id, draftId), eq(drafts.caseId, ctx.caseId)));
    if (!draft) throw new ToolGuardError(`Draft ${draftId} not found on this case.`);
    if (draft.status === "sent") throw new ToolGuardError("This draft has already been sent.");
    const [approval] = await ctx.db
      .select()
      .from(decisions)
      .where(and(eq(decisions.caseId, ctx.caseId), eq(decisions.gate, "approval"), eq(decisions.draftId, draftId)))
      .orderBy(desc(decisions.at))
      .limit(1);
    if (!approval || !approval.decision.startsWith("approved")) {
      throw new ToolGuardError("Not approved: a manager must approve this draft before anything is sent.");
    }
    const row = await getCaseRow(ctx.db, ctx.caseId);
    const id = `msg-${nanoid(8)}`;
    // Keep the thread in order even when the case clock is fixed (evaluation, tests).
    const thread = await ctx.db.select({ at: outboxMessages.at }).from(outboxMessages).where(eq(outboxMessages.caseId, ctx.caseId));
    const sentAt = new Date(Math.max(ctx.now.getTime(), ...thread.map((t) => t.at.getTime() + 1000)));
    await ctx.db.insert(outboxMessages).values({
      id,
      caseId: ctx.caseId,
      direction: "out",
      draftId,
      approvalDecisionId: approval.id, // also enforced by a CHECK constraint
      counterparty: draft.route ?? draft.recipientName,
      fromAddress: "claims@rheinfeld-bio.example",
      toAddress: draft.recipientEmail,
      subject: draft.subject,
      body: draft.body,
      attachments: draft.annexes,
      at: sentAt,
    });
    await ctx.db.update(drafts).set({ status: "sent", updatedAt: new Date() }).where(eq(drafts.id, draftId));
    if (draft.kind === "claim_letter" && row.status === "awaiting_approval") {
      const tr = await transition(ctx.db, ctx.caseId, "sent", AGENT, { reason: `Claim sent to ${draft.recipientName}`, runId: ctx.runId });
      ctx.emit({ type: "status", from: tr.from, to: tr.to, reason: "Claim sent" });
    }
    return {
      output: { messageId: id, to: draft.recipientEmail, subject: draft.subject, approvedBy: approval.actorName, simulated: true },
      summary: `Sent to ${draft.recipientName} <${draft.recipientEmail}> via the simulated Outbox (approved by ${approval.actorName}).`,
    };
  },
});

/* ================================================================== appeals */

const SIGN_OFF = "Yours faithfully,\nTom Becker\nClaims Manager";

/** Which claim an incoming message answers: the route and the draft we sent to that address. */
async function answeredClaim(ctx: AgentContext, msg: OutboxRow): Promise<{ route: RecoveryRoute | null; draft: DraftRow | null }> {
  const out = (await ctx.db.select().from(outboxMessages).where(and(eq(outboxMessages.caseId, ctx.caseId), eq(outboxMessages.direction, "out"), eq(outboxMessages.toAddress, msg.fromAddress)))).filter(
    (m) => m.at.getTime() <= msg.at.getTime(),
  );
  const claimMsg = out.filter((m) => m.draftId).sort((a, b) => b.at.getTime() - a.at.getTime())[0];
  const [draft] = claimMsg?.draftId ? await ctx.db.select().from(drafts).where(eq(drafts.id, claimMsg.draftId)) : [];
  return { route: (draft?.route as RecoveryRoute | null) ?? null, draft: draft ?? null };
}

/**
 * The one appeal: a reply letter with extra evidence (logger data, custody, QA
 * assessment), recorded in record.followUp.appeals. A second one is refused.
 */
export async function createAppeal(
  ctx: AgentContext,
  a: { row: CaseRow; msg: OutboxRow; route: RecoveryRoute; claimEur: number; offerEur: number | null; status: "draft" | "awaiting_approval" },
): Promise<{ draftId: string; recipient: string }> {
  const rec = await getRecord(ctx.db, ctx.caseId);
  const used = rec.followUp?.appeals.length ?? 0;
  if (!canAppeal(used, ctx.rules)) {
    throw new ToolGuardError(`The appeal has already been used on this case (${used} of ${ctx.rules.maxAppeals}). Further steps are the manager's decision: accept the offer or escalate.`);
  }
  const qa = await qaStatus(ctx.db, ctx.caseId);
  const [qaCit] = qa.status === "rejected" ? await registerCitations(ctx.db, ctx.caseId, [qaCitation(qa)]) : [];
  const fresh = await getRecord(ctx.db, ctx.caseId);
  const c = fresh.contract?.clauses ?? {};
  const p = fresh.policy?.clauses ?? {};
  const t = (id?: string) => (id ? ` [${id}]` : "");
  const route = a.route;
  const basisCite = route === "forwarder" ? c.liability_cap?.citationId : route === "insurer" ? p.settlement?.citationId : fresh.shipment?.citations?.awb;
  const invoiceCite = fresh.shipment?.citations?.invoice;
  const basisText =
    route === "forwarder" && c.liability_cap
      ? `Under clause ${c.liability_cap.clause} of our agreement your liability for a breach of the temperature obligations extends to the value of the affected goods`
      : route === "insurer"
        ? "Under the policy the insured value less the deductible is payable"
        : "The amount claimed is within the applicable liability limit";
  const ex = fresh.excursions?.find((e) => e.direction === "high") ?? fresh.excursions?.[0];
  const attr = fresh.custody?.attribution;
  const evidence: string[] = [];
  if (ex) evidence.push(`the logger record, which shows ${ex.minutes} minutes above 8 °C with a peak of ${ex.peakC.toFixed(1)} °C${t(ex.citationId)}`);
  if (attr) evidence.push(`the custody timeline, which shows the cargo was held by ${attr.custodian} at ${attr.location} at that time${attr.citationIds.map((id) => t(id)).join("")}`);
  if (qaCit) evidence.push(`the quality disposition, which rejects the batch${t(qaCit.id)}`);
  const lead = a.offerEur != null
    ? `We cannot accept your offer of ${formatEUR(a.offerEur)}. ${basisText}${t(basisCite)}, which is ${formatEUR(a.claimEur)}${t(invoiceCite)}.`
    : `We do not accept the rejection of our claim. ${basisText}${t(basisCite)}, which is ${formatEUR(a.claimEur)}${t(invoiceCite)}.`;
  const body = [
    "Dear Sir or Madam,",
    `thank you for your reply on shipment ${a.row.shipmentRef}.`,
    lead,
    evidence.length ? `In support we enclose additional evidence: ${evidence.join("; ")}.` : null,
    `We therefore maintain our claim for ${formatEUR(a.claimEur)} and ask you to reconsider and confirm payment within 14 days. This is our appeal; all our rights remain reserved.`,
    SIGN_OFF,
  ]
    .filter(Boolean)
    .join("\n\n");
  const cites = [basisCite, invoiceCite, ex?.citationId, ...(attr?.citationIds ?? []), qaCit?.id].filter((id): id is string => !!id).map((id) => fresh.citations?.[id]).filter(Boolean) as Citation[];
  const id = `dr-${nanoid(8)}`;
  await ctx.db.insert(drafts).values({
    id,
    caseId: ctx.caseId,
    kind: "reply",
    route,
    recipientName: a.msg.counterparty,
    recipientEmail: a.msg.fromAddress,
    subject: `Appeal – ${a.msg.subject.replace(/^Re:\s*/i, "")}`,
    body,
    amountEur: a.claimEur,
    citations: cites,
    annexes: ["Data logger extract", "Custody timeline", "Quality disposition"],
    status: a.status,
  });
  await patchRecord(ctx.db, ctx.caseId, {
    followUp: { remindersSent: fresh.followUp?.remindersSent ?? [], lastReplyAt: a.msg.at.toISOString(), appeals: [...(fresh.followUp?.appeals ?? []), { draftId: id, at: ctx.now.toISOString() }] },
  });
  return { draftId: id, recipient: a.msg.counterparty };
}

export const draftAppealTool = defineTool({
  name: "draft_appeal",
  description:
    "Draft the one appeal against a rejection or part-payment, with extra evidence (logger data, custody, quality disposition). It is a reply draft that needs manager approval. Only one appeal is allowed per case: a second call is refused.",
  input: z.object({ messageId: z.string().optional().describe("The counterparty reply to appeal against; defaults to the latest reply") }),
  async run({ messageId }, ctx) {
    const [msg] = messageId
      ? await ctx.db.select().from(outboxMessages).where(and(eq(outboxMessages.id, messageId), eq(outboxMessages.caseId, ctx.caseId)))
      : await ctx.db.select().from(outboxMessages).where(and(eq(outboxMessages.caseId, ctx.caseId), eq(outboxMessages.direction, "in"))).orderBy(desc(outboxMessages.at)).limit(1);
    if (!msg || msg.direction !== "in") throw new ToolGuardError("No incoming reply to appeal against.");
    const row = await getCaseRow(ctx.db, ctx.caseId);
    if (!["sent", "in_negotiation"].includes(row.status)) throw new ToolGuardError(`An appeal is only possible after the claim was sent (case is ${row.status}).`);
    const { route, draft } = await answeredClaim(ctx, msg);
    const claimEur = draft?.amountEur ?? row.claimAmountEur ?? 0;
    const { kind, amountEur } = classifyReply(msg.body, claimEur);
    if (!["accepted_partial", "rejected_time_bar", "rejected_other"].includes(kind)) throw new ToolGuardError(`This reply is ${kind.replace(/_/g, " ")}: an appeal only answers a rejection or a part-payment offer.`);
    const r = (route ?? row.recommendedRoute ?? "forwarder") as RecoveryRoute;
    const res = await createAppeal(ctx, { row, msg, route: r, claimEur, offerEur: kind === "accepted_partial" ? amountEur : null, status: "awaiting_approval" });
    const rec = await getRecord(ctx.db, ctx.caseId);
    await patchRecord(ctx.db, ctx.caseId, { handledMessageIds: [...new Set([...(rec.handledMessageIds ?? []), msg.id])] });
    return { output: { draftId: res.draftId, to: res.recipient, status: "awaiting_approval" }, summary: `Appeal to ${res.recipient} drafted with extra evidence. Waiting for manager approval.` };
  },
});

/* ================================================================ reminders */

/** When the claim was sent, when the counterparty last answered, and which reminder marks are due now. */
export async function reminderState(ctx: AgentContext) {
  const rec = await getRecord(ctx.db, ctx.caseId);
  if (!rec.claim) return null;
  const msgs = await ctx.db.select().from(outboxMessages).where(eq(outboxMessages.caseId, ctx.caseId)).orderBy(asc(outboxMessages.at));
  const sent = msgs.find((m) => m.direction === "out" && m.draftId === rec.claim!.draftId);
  if (!sent) return null;
  const replies = msgs.filter((m) => m.direction === "in" && m.fromAddress === sent.toAddress && m.at >= sent.at);
  const lastReplyAt = replies.length ? replies[replies.length - 1].at.toISOString() : null;
  const sentAt = sent.at.toISOString();
  const remindersSent = rec.followUp?.remindersSent ?? [];
  const due = remindersDue({ sentAt, lastReplyAt, remindersSent, now: ctx.now }, ctx.rules);
  return { sent, sentAt, lastReplyAt, remindersSent, due, record: rec };
}

export const draftReminderTool = defineTool({
  name: "draft_reminder",
  description:
    "Draft a reminder to the counterparty that has not answered the claim (due at the configured day marks after sending, 14 and 30 by default, only when no reply arrived). It is a reply draft that needs manager approval before sending.",
  input: z.object({}),
  async run(_input, ctx) {
    const row = await getCaseRow(ctx.db, ctx.caseId);
    if (!["sent", "in_negotiation"].includes(row.status)) throw new ToolGuardError(`Reminders only apply to a sent claim (case is ${row.status}).`);
    const st = await reminderState(ctx);
    if (!st) throw new ToolGuardError("The claim letter has not been sent yet.");
    if (!st.due.length) throw new ToolGuardError(`No reminder is due: ${st.lastReplyAt ? "the counterparty has replied" : "the reminder day marks have not been reached or were already used"}.`);
    const mark = Math.max(...st.due);
    const rec = st.record;
    const [claim] = await ctx.db.select().from(drafts).where(eq(drafts.id, rec.claim!.draftId));
    const awb = rec.shipment?.citations?.awb;
    const t = (id?: string) => (id ? ` [${id}]` : "");
    const days = Math.round((ctx.now.getTime() - new Date(st.sentAt).getTime()) / 86_400_000);
    const body = [
      "Dear Sir or Madam,",
      `we refer to our claim of ${formatEUR(rec.claim!.amountEur)} for shipment ${row.shipmentRef}${awb ? ` (air waybill)${t(awb)}` : ""}, sent ${days} days ago.`,
      `We have not yet received a reply. Please confirm the status of the claim and the expected date of payment within 7 days. All our rights remain reserved.`,
      SIGN_OFF,
    ].join("\n\n");
    const id = `dr-${nanoid(8)}`;
    await ctx.db.insert(drafts).values({
      id,
      caseId: ctx.caseId,
      kind: "reply",
      route: (claim?.route ?? undefined) as never,
      recipientName: claim?.recipientName ?? st.sent.counterparty,
      recipientEmail: st.sent.toAddress,
      subject: `Reminder – ${claim?.subject ?? `claim for shipment ${row.shipmentRef}`}`,
      body,
      amountEur: rec.claim!.amountEur,
      citations: awb && rec.citations?.[awb] ? [rec.citations[awb]] : [],
      status: "awaiting_approval",
    });
    await patchRecord(ctx.db, ctx.caseId, {
      followUp: { appeals: rec.followUp?.appeals ?? [], lastReplyAt: st.lastReplyAt, remindersSent: [...new Set([...st.remindersSent, ...st.due])].sort((x, y) => x - y) },
    });
    return {
      output: { draftId: id, dayMark: mark, daysSinceSent: days, status: "awaiting_approval" },
      summary: `Reminder after ${mark} days without a reply drafted for ${claim?.recipientName ?? st.sent.counterparty}. Waiting for manager approval.`,
    };
  },
});

/* =============================================================== handle_reply */

type ReplyClass = "request_info" | "accepted_full" | "accepted_partial" | "payment_confirmed" | "rejected_time_bar" | "rejected_other" | "acknowledged";

export function classifyReply(text: string, claimEur: number | null): { kind: ReplyClass; amountEur: number | null } {
  const amounts = [...text.matchAll(/(?:€|EUR\s?)([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, "")));
  const amount = amounts.length ? Math.max(...amounts) : null;
  if (/payment of .* (has been|was) (made|remitted|transferred)|we have (paid|remitted|transferred)/i.test(text)) return { kind: "payment_confirmed", amountEur: amount };
  if (/out of time|time[- ]barred|notice (was )?(received )?(too )?late|not notified within/i.test(text)) return { kind: "rejected_time_bar", amountEur: null };
  if (/(please|kindly) (send|provide|forward)|we (need|require)|missing/i.test(text)) return { kind: "request_info", amountEur: null };
  if (/reject|decline|not liable|deny/i.test(text) && !/accept/i.test(text)) return { kind: "rejected_other", amountEur: null };
  if (/accept/i.test(text)) {
    if (amount != null && claimEur != null && amount < claimEur * 0.999) return { kind: "accepted_partial", amountEur: amount };
    return { kind: "accepted_full", amountEur: amount ?? claimEur };
  }
  return { kind: "acknowledged", amountEur: null };
}

export const handleReply = defineTool({
  name: "handle_reply",
  description:
    "Read a counterparty reply from the Outbox thread, classify it (information request, acceptance, partial offer, payment, rejection) and propose the next action. A partial offer or a rejection triggers the one appeal with extra evidence (a reply draft that needs approval). Moves the case into negotiation or closes it when payment is confirmed.",
  input: z.object({ messageId: z.string().optional().describe("Incoming message id; defaults to the latest reply") }),
  async run({ messageId }, ctx) {
    const [msg] = messageId
      ? await ctx.db.select().from(outboxMessages).where(and(eq(outboxMessages.id, messageId), eq(outboxMessages.caseId, ctx.caseId)))
      : await ctx.db
          .select()
          .from(outboxMessages)
          .where(and(eq(outboxMessages.caseId, ctx.caseId), eq(outboxMessages.direction, "in")))
          .orderBy(desc(outboxMessages.at))
          .limit(1);
    if (!msg || msg.direction !== "in") throw new ToolGuardError("No incoming reply to handle.");
    const row = await getCaseRow(ctx.db, ctx.caseId);
    // Amounts come from the body only: the subject often repeats our own claim amount.
    const { route: replyRoute, draft: answered } = await answeredClaim(ctx, msg);
    const claimOfReply = answered?.amountEur ?? row.claimAmountEur;
    const plan = (await getRecord(ctx.db, ctx.caseId)).claimPlan ?? [];
    const isSecondary = !!replyRoute && plan.find((x) => x.route === replyRoute)?.role === "secondary";
    const { kind, amountEur } = classifyReply(msg.body, claimOfReply);
    let proposal = "";
    let next: typeof row.status | null = null;
    const patch: Partial<typeof cases.$inferInsert> = {};
    switch (kind) {
      case "request_info": {
        const wantsInvoice = /invoice/i.test(msg.body);
        proposal = wantsInvoice ? "Send the commercial invoice (already on file) with a short cover note." : "Provide the requested information.";
        const doc = wantsInvoice ? await findDocument(ctx.db, ctx.caseId, "invoice") : null;
        const id = `dr-${nanoid(8)}`;
        await ctx.db.insert(drafts).values({
          id,
          caseId: ctx.caseId,
          kind: "reply",
          route: (replyRoute ?? row.recommendedRoute ?? undefined) as never,
          recipientName: msg.counterparty,
          recipientEmail: msg.fromAddress,
          subject: msg.subject.startsWith("Re:") ? msg.subject : `Re: ${msg.subject}`,
          body: `Dear Sir or Madam,\n\nthank you for your message. ${doc ? `Please find attached the commercial invoice ${doc.filename} evidencing the value of the goods.` : "Please find the requested information attached."}\n\nYours faithfully,\nTom Becker\nClaims Manager`,
          annexes: doc ? [doc.filename] : [],
          status: "awaiting_approval",
        });
        proposal += ` Reply drafted (${id}), waiting for approval.`;
        next = "in_negotiation";
        break;
      }
      case "accepted_full":
        proposal = `Counterparty accepts the claim${amountEur ? ` for ${formatEUR(amountEur)}` : ""}. Await payment confirmation, then close as recovered.`;
        next = "in_negotiation";
        break;
      case "accepted_partial": {
        const claimEur = claimOfReply ?? 0;
        const rec = await getRecord(ctx.db, ctx.caseId);
        const route = (replyRoute ?? row.recommendedRoute ?? "forwarder") as "carrier" | "forwarder" | "insurer";
        if (canAppeal(rec.followUp?.appeals.length ?? 0, ctx.rules)) {
          // Part-payment: one appeal with extra evidence, approved by a manager like any outgoing letter.
          const ap = await createAppeal(ctx, { row, msg, route, claimEur, offerEur: amountEur, status: "awaiting_approval" });
          proposal = `Offer of ${formatEUR(amountEur!)} against a claim of ${formatEUR(claimEur)} (${Math.round((amountEur! / (claimEur || 1)) * 100)}%). One appeal with extra evidence is drafted (${ap.draftId}) and waits for approval.`;
          next = "in_negotiation";
          break;
        }
        const c = rec.contract?.clauses ?? {};
        const p = rec.policy?.clauses ?? {};
        const basisCite = route === "forwarder" ? c.liability_cap?.citationId : route === "insurer" ? p.settlement?.citationId : rec.shipment?.citations?.awb;
        const invoiceCite = rec.shipment?.citations?.invoice;
        const basisText =
          route === "forwarder" && c.liability_cap
            ? `Under clause ${c.liability_cap.clause} of our agreement your liability for a breach of the temperature obligations extends to the invoice value of the affected goods`
            : route === "insurer"
              ? "Under the policy the insured value less the deductible is payable"
              : "The amount claimed is within the applicable liability limit";
        const counterId = `dr-${nanoid(8)}`;
        await ctx.db.insert(drafts).values({
          id: counterId,
          caseId: ctx.caseId,
          kind: "reply",
          route,
          recipientName: msg.counterparty,
          recipientEmail: msg.fromAddress,
          subject: msg.subject.startsWith("Re:") ? msg.subject : `Re: ${msg.subject}`,
          body: `Dear Sir or Madam,

thank you for accepting liability for shipment ${row.shipmentRef}.

We cannot accept your offer of ${formatEUR(amountEur!)}. ${basisText}${basisCite ? ` [${basisCite}]` : ""}, which is ${formatEUR(claimEur)}${invoiceCite ? ` [${invoiceCite}]` : ""}. The circumstances you mention do not limit that liability.

We therefore maintain our claim for ${formatEUR(claimEur)} and ask you to confirm payment within 14 days. All our rights remain reserved.

Yours faithfully,
Tom Becker
Claims Manager`,
          amountEur: claimEur,
          citations: [basisCite, invoiceCite].filter(Boolean).map((id) => rec.citations?.[id!]).filter(Boolean) as never,
          status: "draft",
        });
        await patchRecord(ctx.db, ctx.caseId, {
          negotiation: { route, offerEur: amountEur!, claimEur, messageId: msg.id, counterDraftId: counterId, counterparty: msg.counterparty },
        });
        proposal = `Offer of ${formatEUR(amountEur!)} against a claim of ${formatEUR(claimEur)} (${Math.round((amountEur! / (claimEur || 1)) * 100)}%). Manager to decide: accept and settle, or insist on the full amount (counter-letter drafted).`;
        next = "in_negotiation";
        break;
      }
      case "payment_confirmed":
        if (isSecondary || (replyRoute && plan.length > 1 && replyRoute !== plan.find((x) => x.role === "primary")?.route)) {
          // Secondary claim paid: counts towards the total, the case closes with the primary claim.
          proposal = `Payment of ${amountEur ? formatEUR(amountEur) : "the secondary claim"} from ${msg.counterparty} confirmed towards the secondary claim. The case closes when the primary claim is paid.`;
          await ctx.db.update(cases).set({ recoveredEur: (row.recoveredEur ?? 0) + (amountEur ?? 0) }).where(eq(cases.id, ctx.caseId));
          break;
        }
        proposal = `Payment of ${amountEur ? formatEUR(amountEur) : "the claim"} confirmed. Close the case.`;
        patch.recoveredEur = (row.recoveredEur ?? 0) + (amountEur ?? row.claimAmountEur ?? 0);
        next = amountEur != null && claimOfReply != null && amountEur < claimOfReply * 0.999 ? "closed_settled" : "closed_recovered";
        patch.closedReason = proposal;
        break;
      case "rejected_time_bar":
      case "rejected_other": {
        const rec = await getRecord(ctx.db, ctx.caseId);
        const base = kind === "rejected_time_bar" ? "Rejected as out of time." : "Claim rejected.";
        if (canAppeal(rec.followUp?.appeals.length ?? 0, ctx.rules)) {
          const ap = await createAppeal(ctx, { row, msg, route: (replyRoute ?? row.recommendedRoute ?? "forwarder") as RecoveryRoute, claimEur: claimOfReply ?? 0, offerEur: null, status: "awaiting_approval" });
          proposal = `${base} One appeal with extra evidence is drafted (${ap.draftId}) and waits for approval.`;
        } else {
          proposal = `${base} The one appeal is already used: the manager decides whether to escalate or pursue the next-ranked route.`;
        }
        next = "in_negotiation";
        break;
      }
      default:
        proposal = "Acknowledgement received. No action needed; follow up if no answer within 14 days.";
    }
    if (next && next !== row.status) {
      const tr = await transition(ctx.db, ctx.caseId, next, AGENT, { reason: proposal, runId: ctx.runId, patch });
      ctx.emit({ type: "status", from: tr.from, to: tr.to, reason: proposal });
    }
    const rec = await getRecord(ctx.db, ctx.caseId);
    await patchRecord(ctx.db, ctx.caseId, {
      handledMessageIds: [...new Set([...(rec.handledMessageIds ?? []), msg.id])],
      followUp: { appeals: rec.followUp?.appeals ?? [], remindersSent: rec.followUp?.remindersSent ?? [], lastReplyAt: msg.at.toISOString() },
    });
    const thread = await ctx.db.select().from(outboxMessages).where(eq(outboxMessages.caseId, ctx.caseId)).orderBy(asc(outboxMessages.at));
    return {
      output: { messageId: msg.id, from: msg.fromAddress, classification: kind, amountEur, proposal, threadLength: thread.length },
      summary: `Reply from ${msg.counterparty}: ${kind.replace(/_/g, " ")}. ${proposal}`,
      citations: [{ kind: "email", label: `Reply ${msg.at.toISOString().slice(0, 10)}`, title: msg.subject, quote: msg.body.slice(0, 200) }],
    };
  },
});
