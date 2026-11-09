import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { cases, decisions, documents, drafts, outboxMessages } from "@/lib/db/schema";
import { formatEUR } from "@/lib/format";
import { getRecord, patchRecord } from "@/lib/case/record";
import { transition } from "@/lib/case/status-machine";
import { buildEvidencePack } from "@/lib/pdf/evidence-pack";
import { putFile, readFile } from "@/lib/storage";
import { getCaseRow } from "../assess";
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
      at: ctx.now,
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
    "Read a counterparty reply from the Outbox thread, classify it (information request, acceptance, partial offer, payment, rejection) and propose the next action. Moves the case into negotiation or closes it when payment is confirmed.",
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
    const { kind, amountEur } = classifyReply(`${msg.subject}\n${msg.body}`, row.claimAmountEur);
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
          route: (row.recommendedRoute ?? undefined) as never,
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
      case "accepted_partial":
        proposal = `Offer of ${formatEUR(amountEur!)} against a claim of ${formatEUR(row.claimAmountEur ?? 0)}. Manager to decide: accept and settle, or counter. If the offer reflects a liability limit, check whether another route (e.g. the insurer) covers the balance.`;
        next = "in_negotiation";
        break;
      case "payment_confirmed":
        proposal = `Payment of ${amountEur ? formatEUR(amountEur) : "the claim"} confirmed. Close the case.`;
        patch.recoveredEur = amountEur ?? row.claimAmountEur;
        next = amountEur != null && row.claimAmountEur != null && amountEur < row.claimAmountEur * 0.999 ? "closed_settled" : "closed_recovered";
        patch.closedReason = proposal;
        break;
      case "rejected_time_bar":
        proposal = "Rejected as out of time. Check the notice evidence (sent date vs deadline) and, if the rejection stands, pursue the next-ranked route.";
        next = "in_negotiation";
        break;
      case "rejected_other":
        proposal = "Claim rejected. Review the stated grounds against the cited clauses; consider escalation or the next-ranked route.";
        next = "in_negotiation";
        break;
      default:
        proposal = "Acknowledgement received. No action needed; follow up if no answer within 14 days.";
    }
    if (next && next !== row.status) {
      const tr = await transition(ctx.db, ctx.caseId, next, AGENT, { reason: proposal, runId: ctx.runId, patch });
      ctx.emit({ type: "status", from: tr.from, to: tr.to, reason: proposal });
    }
    const rec = await getRecord(ctx.db, ctx.caseId);
    await patchRecord(ctx.db, ctx.caseId, { handledMessageIds: [...new Set([...(rec.handledMessageIds ?? []), msg.id])] });
    const thread = await ctx.db.select().from(outboxMessages).where(eq(outboxMessages.caseId, ctx.caseId)).orderBy(asc(outboxMessages.at));
    return {
      output: { messageId: msg.id, from: msg.fromAddress, classification: kind, amountEur, proposal, threadLength: thread.length },
      summary: `Reply from ${msg.counterparty}: ${kind.replace(/_/g, " ")}. ${proposal}`,
      citations: [{ kind: "email", label: `Reply ${msg.at.toISOString().slice(0, 10)}`, title: msg.subject, quote: msg.body.slice(0, 200) }],
    };
  },
});
