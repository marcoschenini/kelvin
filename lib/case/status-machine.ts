import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { auditEvents, cases, type ActorType } from "@/lib/db/schema";
import { isClosed, type CaseStatus } from "@/lib/domain/case-status";
import type { RecoveryRoute } from "@/lib/domain/parties";
import { computeOutcome } from "@/lib/rules/outcome";
import { getRecord, patchRecord } from "./record";

/**
 * Case status machine, enforced in code (not only in the prompt):
 *
 *   new → investigating → awaiting_qa ─┬→ no_claim → closed_no_claim
 *                     └→ no_claim      └→ claim_prepared → awaiting_approval → sent → in_negotiation
 *                                                      ↑__________________|            → closed_recovered | closed_settled | closed_rejected
 *
 * The quality agent decides clear cases (usable → no_claim, damaged → claim_prepared)
 * straight from investigating; unsure cases go to awaiting_qa for a human QA.
 * A manager rejecting the claim letter closes the case (awaiting_approval → closed_not_approved).
 *
 * The protective notice is a side branch that never changes the main status;
 * it is only allowed while investigating or awaiting QA.
 */
export const TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  new: ["investigating"],
  // investigating → claim_prepared only when the quality agent decides "damaged" (recordAgentQaDecision)
  investigating: ["awaiting_qa", "no_claim", "claim_prepared"],
  awaiting_qa: ["no_claim", "claim_prepared"],
  no_claim: ["closed_no_claim"],
  claim_prepared: ["awaiting_approval"],
  awaiting_approval: ["sent", "claim_prepared", "closed_not_approved"],
  sent: ["in_negotiation", "closed_recovered", "closed_settled", "closed_rejected"],
  in_negotiation: ["sent", "closed_recovered", "closed_settled", "closed_rejected"],
  closed_no_claim: [],
  closed_recovered: [],
  closed_settled: [],
  closed_rejected: [],
  closed_not_approved: [],
};

export const PROTECTIVE_NOTICE_ALLOWED: readonly CaseStatus[] = ["investigating", "awaiting_qa"];

export class TransitionError extends Error {
  constructor(
    public from: CaseStatus,
    public to: CaseStatus,
  ) {
    super(`Illegal status transition ${from} → ${to}`);
    this.name = "TransitionError";
  }
}

export function canTransition(from: CaseStatus, to: CaseStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: CaseStatus, to: CaseStatus): void {
  if (!canTransition(from, to)) throw new TransitionError(from, to);
}

export interface Actor {
  type: ActorType;
  name: string;
  role?: string;
}

/** Moves a case to `to`, rejecting illegal transitions, and writes an audit event. */
export async function transition(
  db: DB,
  caseId: string,
  to: CaseStatus,
  actor: Actor,
  extra: { reason?: string; runId?: string; patch?: Partial<typeof cases.$inferInsert> } = {},
): Promise<{ from: CaseStatus; to: CaseStatus }> {
  const [row] = await db.select().from(cases).where(eq(cases.id, caseId));
  if (!row) throw new Error(`Case ${caseId} not found`);
  const from = row.status;
  if (from === to) return { from, to };
  assertTransition(from, to);
  await db
    .update(cases)
    .set({ ...(extra.patch ?? {}), status: to, updatedAt: new Date() })
    .where(eq(cases.id, caseId));
  if (isClosed(to)) {
    // Every closing transition records the result: claimed vs recovered, recovery %, days to close, payer.
    const record = await getRecord(db, caseId);
    const closedAt = new Date();
    // With a claim plan (primary + secondary), "claimed" is the whole plan, so recovery % compares like with like.
    const planTotal = record.claimPlan?.length ? record.claimPlan.reduce((sum, p) => sum + p.amountEur, 0) : null;
    const claimed = planTotal ?? extra.patch?.claimAmountEur ?? row.claimAmountEur ?? record.claim?.amountEur ?? null;
    let recovered = extra.patch?.recoveredEur ?? row.recoveredEur ?? null;
    if (to === "closed_recovered" && recovered == null) recovered = claimed;
    const payer = (record.claim?.route ?? row.recommendedRoute ?? null) as RecoveryRoute | null;
    const outcome = computeOutcome({
      status: to,
      claimAmountEur: to === "closed_no_claim" ? null : claimed,
      recoveredEur: recovered,
      payer: to === "closed_no_claim" || to === "closed_not_approved" ? null : payer,
      openedAt: row.discoveredAt ?? row.createdAt,
      closedAt,
    });
    await patchRecord(db, caseId, { outcome });
  }
  await db.insert(auditEvents).values({
    caseId,
    actorType: actor.type,
    actorName: actor.name,
    actorRole: actor.role,
    eventType: "status_changed",
    input: { from, to },
    output: extra.reason ? { reason: extra.reason } : null,
    runId: extra.runId,
  });
  return { from, to };
}
