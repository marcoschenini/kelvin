import type { CaseStatus } from "@/lib/domain/case-status";
import type { RecoveryRoute } from "@/lib/domain/parties";
import type { CaseOutcome } from "./types";

const DAY_MS = 86_400_000;

const RESULT: Partial<Record<CaseStatus, CaseOutcome["result"]>> = {
  closed_no_claim: "no_claim",
  closed_recovered: "recovered",
  closed_settled: "settled",
  closed_rejected: "rejected",
  closed_not_approved: "not_approved",
};

/** Result record written on every closing transition. */
export function computeOutcome(input: {
  status: CaseStatus;
  claimAmountEur: number | null;
  recoveredEur: number | null;
  payer: RecoveryRoute | null;
  openedAt: Date;
  closedAt: Date;
}): CaseOutcome {
  const result = RESULT[input.status];
  if (!result) throw new Error(`computeOutcome: ${input.status} is not a closed status`);
  const claimed = result === "no_claim" ? null : input.claimAmountEur;
  const recovered = result === "no_claim" || result === "not_approved" ? null : (input.recoveredEur ?? (result === "rejected" ? 0 : null));
  const pct = claimed && claimed > 0 && recovered != null ? Math.round((recovered / claimed) * 1000) / 10 : null;
  const days = Math.max(0, Math.round((input.closedAt.getTime() - input.openedAt.getTime()) / DAY_MS));
  return {
    result,
    claimedEur: claimed ?? null,
    recoveredEur: recovered,
    recoveryPct: pct,
    payer: input.payer,
    daysToClose: days,
    closedAt: input.closedAt.toISOString(),
  };
}
