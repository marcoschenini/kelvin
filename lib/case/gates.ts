import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DB } from "@/lib/db/client";
import { auditEvents, cases, decisions, drafts } from "@/lib/db/schema";
import { ROLE_CAN, type Persona } from "@/lib/domain/personas";
import type { QaAssessment } from "@/lib/rules/types";
import { getRecord, patchRecord } from "./record";
import { transition } from "./status-machine";

/**
 * The two human gates. Each is a real action with a name and a timestamp in the
 * audit log, and each checks the actor's role: QA decides disposition, a
 * manager approves anything that leaves the building.
 */

export class GateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GateError";
  }
}

export async function recordQaDecision(
  db: DB,
  caseId: string,
  args: { decision: "released" | "rejected"; note?: string; actor: Persona },
) {
  if (!ROLE_CAN[args.actor.role].qaGate) throw new GateError(`${args.actor.name} (${args.actor.title}) cannot make the QA decision.`);
  const [row] = await db.select({ status: cases.status }).from(cases).where(eq(cases.id, caseId));
  if (!row) throw new GateError("Case not found");
  if (row.status !== "awaiting_qa") throw new GateError(`QA decision is only possible while awaiting QA (case is ${row.status}).`);
  const existing = await db.select({ id: decisions.id }).from(decisions).where(and(eq(decisions.caseId, caseId), eq(decisions.gate, "qa")));
  if (existing.length) throw new GateError("QA has already decided on this case.");

  const id = `dec-${nanoid(8)}`;
  const at = new Date();
  await db.insert(decisions).values({ id, caseId, gate: "qa", decision: args.decision, note: args.note, actorName: args.actor.name, actorRole: args.actor.title, at });
  await db.insert(auditEvents).values({
    caseId,
    at,
    actorType: "human",
    actorName: args.actor.name,
    actorRole: args.actor.title,
    eventType: "qa_decision",
    input: { decision: args.decision, note: args.note ?? null },
    output: { decisionId: id },
  });
  const record = await getRecord(db, caseId);
  await patchRecord(db, caseId, { qa: { ...(record.qa ?? {}), status: args.decision, by: `${args.actor.name} (${args.actor.title})`, at: at.toISOString(), note: args.note } });
  if (args.decision === "released") {
    await transition(db, caseId, "no_claim", { type: "human", name: args.actor.name, role: args.actor.title }, { reason: "QA released the product" });
  }
  return { id, at };
}

export const QUALITY_AGENT = { type: "agent" as const, name: "Quality agent", role: "Quality agent" };

/**
 * The quality agent decides clear cases against the stability allowance; unclear
 * ones go to a human QA. Always logs the reasoning (audit event + record).
 *  usable  → no claim, case closed with the reasoning
 *  damaged → qa "rejected" by the Quality agent, claim path (claim_prepared)
 *  unsure  → awaiting_qa; never auto-closed
 */
export async function recordAgentQaDecision(
  db: DB,
  caseId: string,
  a: QaAssessment,
  opts: { citationId?: string; runId?: string } = {},
): Promise<void> {
  const [row] = await db.select({ status: cases.status }).from(cases).where(eq(cases.id, caseId));
  if (!row) throw new GateError("Case not found");
  if (row.status !== "investigating") throw new GateError(`The quality agent can only decide while investigating (case is ${row.status}).`);
  const at = new Date();
  const reasoning = a.reasons.join(" ");
  await db.insert(auditEvents).values({
    caseId,
    at,
    actorType: QUALITY_AGENT.type,
    actorName: QUALITY_AGENT.name,
    actorRole: QUALITY_AGENT.role,
    eventType: "qa_assessment",
    input: { peakC: a.peakC, minutesOutOfRange: a.minutesOutOfRange, allowance: a.allowance },
    output: { verdict: a.verdict, basis: a.basis, reasons: a.reasons },
    runId: opts.runId,
  });
  const record = await getRecord(db, caseId);
  const qaAssessment = { ...a, by: "quality_agent" as const, at: at.toISOString(), ...(opts.citationId ? { citationId: opts.citationId } : {}) };
  const qaStatus = a.verdict === "usable" ? "released" : a.verdict === "damaged" ? "rejected" : "pending";
  await patchRecord(db, caseId, {
    qaAssessment,
    qa:
      a.verdict === "unsure"
        ? (record.qa ?? { status: "pending" })
        : { ...(record.qa ?? {}), status: qaStatus, by: QUALITY_AGENT.name, at: at.toISOString(), note: reasoning, ...(opts.citationId ? { citationId: opts.citationId } : {}) },
  });
  const actor = { type: QUALITY_AGENT.type, name: QUALITY_AGENT.name, role: QUALITY_AGENT.role };
  if (a.verdict === "usable") {
    await transition(db, caseId, "no_claim", actor, { reason: `Quality agent: product usable. ${reasoning}`, runId: opts.runId });
    await transition(db, caseId, "closed_no_claim", actor, {
      reason: reasoning,
      runId: opts.runId,
      patch: { closedReason: `Product within its stability allowance: no damage, no claim. ${reasoning}` },
    });
  } else if (a.verdict === "damaged") {
    await transition(db, caseId, "claim_prepared", actor, { reason: `Quality agent: product damaged. ${reasoning}`, runId: opts.runId });
  } else {
    await transition(db, caseId, "awaiting_qa", actor, { reason: `Quality agent unsure, human QA must decide. ${reasoning}`, runId: opts.runId });
  }
}

export async function recordApproval(
  db: DB,
  caseId: string,
  args: {
    draftId: string;
    decision: "approved" | "approved_with_edits" | "rejected";
    reason?: string;
    editedSubject?: string;
    editedBody?: string;
    actor: Persona;
  },
) {
  if (!ROLE_CAN[args.actor.role].approvalGate) throw new GateError(`${args.actor.name} (${args.actor.title}) cannot approve outgoing messages.`);
  const [draft] = await db.select().from(drafts).where(and(eq(drafts.id, args.draftId), eq(drafts.caseId, caseId)));
  if (!draft) throw new GateError("Draft not found");
  if (draft.status !== "awaiting_approval") throw new GateError(`Draft is ${draft.status}, not awaiting approval.`);
  if (args.decision === "rejected" && !args.reason?.trim()) throw new GateError("A reason is required to reject.");
  if (args.decision === "approved_with_edits" && !args.editedBody?.trim()) throw new GateError("Edited text is required.");

  const id = `dec-${nanoid(8)}`;
  const at = new Date();
  await db.insert(decisions).values({
    id,
    caseId,
    gate: "approval",
    decision: args.decision,
    note: args.reason,
    draftId: draft.id,
    actorName: args.actor.name,
    actorRole: args.actor.title,
    at,
  });
  await db
    .update(drafts)
    .set({
      status: args.decision === "rejected" ? "rejected" : "approved",
      ...(args.decision === "approved_with_edits" ? { body: args.editedBody, subject: args.editedSubject ?? draft.subject, version: draft.version + 1 } : {}),
      updatedAt: at,
    })
    .where(eq(drafts.id, draft.id));
  await db.insert(auditEvents).values({
    caseId,
    at,
    actorType: "human",
    actorName: args.actor.name,
    actorRole: args.actor.title,
    eventType: "approval_decision",
    input: { draftId: draft.id, kind: draft.kind, decision: args.decision, reason: args.reason ?? null, edited: args.decision === "approved_with_edits" },
    output: { decisionId: id },
  });
  const [caseRow] = await db.select({ status: cases.status }).from(cases).where(eq(cases.id, caseId));
  // Only the primary claim letter closes the case; rejecting a secondary claim (claim plan) rejects that letter only.
  const primaryDraftId = (await getRecord(db, caseId)).claim?.draftId;
  const isPrimary = !primaryDraftId || primaryDraftId === draft.id;
  if (draft.kind === "claim_letter" && args.decision === "rejected" && isPrimary && caseRow?.status === "awaiting_approval") {
    // A rejected claim letter closes the case; the reason stays in the audit log and in record.outcome.
    const reason = `Claim not approved by ${args.actor.name} (${args.actor.title}): ${args.reason}`;
    await transition(db, caseId, "closed_not_approved", { type: "human", name: args.actor.name, role: args.actor.title }, { reason, patch: { closedReason: reason } });
    // The case is closed: withdraw every other draft still waiting, so nothing on it can be approved or sent later.
    const pending = await db
      .select({ id: drafts.id })
      .from(drafts)
      .where(and(eq(drafts.caseId, caseId), inArray(drafts.status, ["draft", "awaiting_approval"])));
    if (pending.length) {
      await db.update(drafts).set({ status: "rejected", updatedAt: new Date() }).where(inArray(drafts.id, pending.map((p) => p.id)));
      await db.insert(auditEvents).values({
        caseId,
        actorType: "system",
        actorName: "Kelvin",
        eventType: "drafts_withdrawn",
        input: { draftIds: pending.map((p) => p.id) },
        output: { reason: "Case closed as not approved" },
      });
    }
  }
  return { id, at, draftKind: draft.kind };
}

/**
 * Third human decision: a counterparty offered less than the claim. The manager
 * either accepts (case closes as settled for the offer) or insists on the full
 * amount (the agent's counter-letter goes to approval like any outgoing message).
 */
export async function recordSettlement(db: DB, caseId: string, args: { decision: "accept" | "counter"; note?: string; actor: Persona }) {
  if (!ROLE_CAN[args.actor.role].approvalGate) throw new GateError(`${args.actor.name} (${args.actor.title}) cannot decide on settlements.`);
  const record = await getRecord(db, caseId);
  const n = record.negotiation;
  if (!n) throw new GateError("There is no open offer on this case.");
  const [row] = await db.select({ status: cases.status }).from(cases).where(eq(cases.id, caseId));
  if (row?.status !== "in_negotiation") throw new GateError(`Settlement decisions are only possible in negotiation (case is ${row?.status}).`);

  const id = `dec-${nanoid(8)}`;
  const at = new Date();
  await db.insert(decisions).values({
    id,
    caseId,
    gate: "settlement",
    decision: args.decision === "accept" ? "accepted_offer" : "countered",
    note: args.note,
    draftId: args.decision === "counter" ? n.counterDraftId : null,
    actorName: args.actor.name,
    actorRole: args.actor.title,
    at,
  });
  await db.insert(auditEvents).values({
    caseId,
    at,
    actorType: "human",
    actorName: args.actor.name,
    actorRole: args.actor.title,
    eventType: "settlement_decision",
    input: { decision: args.decision, offerEur: n.offerEur, claimEur: n.claimEur, note: args.note ?? null },
    output: { decisionId: id },
  });
  const actor = { type: "human" as const, name: args.actor.name, role: args.actor.title };
  if (args.decision === "accept") {
    const reason = `Offer of EUR ${n.offerEur.toLocaleString("en-GB")} from ${n.counterparty} accepted in settlement (claim EUR ${n.claimEur.toLocaleString("en-GB")}).`;
    await db.update(drafts).set({ status: "rejected" }).where(eq(drafts.id, n.counterDraftId));
    await patchRecord(db, caseId, { negotiation: null });
    await transition(db, caseId, "closed_settled", actor, { reason, patch: { recoveredEur: n.offerEur, closedReason: reason } });
  } else {
    await db.update(drafts).set({ status: "awaiting_approval", updatedAt: at }).where(eq(drafts.id, n.counterDraftId));
    await patchRecord(db, caseId, { negotiation: null });
  }
  return { id, at };
}
