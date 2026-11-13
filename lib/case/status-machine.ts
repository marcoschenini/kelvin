import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { auditEvents, cases, type ActorType } from "@/lib/db/schema";
import type { CaseStatus } from "@/lib/domain/case-status";

/**
 * Case status machine, enforced in code (not only in the prompt):
 *
 *   new → investigating → awaiting_qa ─┬→ no_claim → closed_no_claim
 *                     └→ no_claim      └→ claim_prepared → awaiting_approval → sent → in_negotiation
 *                                                      ↑__________________|            → closed_recovered | closed_settled | closed_rejected
 *
 * The protective notice is a side branch that never changes the main status;
 * it is only allowed while investigating or awaiting QA.
 */
export const TRANSITIONS: Record<CaseStatus, readonly CaseStatus[]> = {
  new: ["investigating"],
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
  const [row] = await db.select({ status: cases.status }).from(cases).where(eq(cases.id, caseId));
  if (!row) throw new Error(`Case ${caseId} not found`);
  const from = row.status;
  if (from === to) return { from, to };
  assertTransition(from, to);
  await db
    .update(cases)
    .set({ ...(extra.patch ?? {}), status: to, updatedAt: new Date() })
    .where(eq(cases.id, caseId));
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
