import type { CaseStatus } from "@/lib/domain/case-status";
import type { RecoveryRoute } from "@/lib/domain/parties";
import type { CaseOutcome } from "./types";

/** TEMPORARY stand-in (backend owns this file). */
export function computeOutcome(input: { status: CaseStatus; claimAmountEur: number | null; recoveredEur: number | null; payer: RecoveryRoute | null; openedAt: Date; closedAt: Date }): CaseOutcome {
  const result = ({ closed_no_claim: "no_claim", closed_recovered: "recovered", closed_settled: "settled", closed_rejected: "rejected", closed_not_approved: "not_approved" } as Record<string, CaseOutcome["result"]>)[input.status] ?? "no_claim";
  return {
    result,
    claimedEur: input.claimAmountEur,
    recoveredEur: input.recoveredEur,
    recoveryPct: input.claimAmountEur && input.recoveredEur != null ? Math.round((input.recoveredEur / input.claimAmountEur) * 1000) / 10 : null,
    payer: input.payer,
    daysToClose: Math.round((input.closedAt.getTime() - input.openedAt.getTime()) / 86_400_000),
    closedAt: input.closedAt.toISOString(),
  };
}
