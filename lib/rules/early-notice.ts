import type { RecoveryRoute } from "@/lib/domain/parties";
import type { RulesConfig } from "./config";
import type { QaStatus, RankedRoute } from "./types";

export interface ProtectiveNoticeNeed {
  route: RecoveryRoute;
  deadlineId: string;
  daysLeft: number;
  reason: string;
}

/**
 * A protective notice reserves the right to claim before quality has decided.
 * Needed for every live route (some chance of recovery) whose notice deadline
 * is open and within the threshold, while QA is still pending. Also needed for
 * the carrier when the policy obliges the insured to preserve rights against
 * carriers, even if the carrier is not the best route.
 */
export function protectiveNoticesNeeded(ranked: RankedRoute[], qa: QaStatus, cfg: RulesConfig): ProtectiveNoticeNeed[] {
  if (qa !== "pending") return [];
  const out: ProtectiveNoticeNeed[] = [];
  for (const r of ranked) {
    const d = r.noticeDeadline;
    if (!d || d.daysLeft < 0 || d.daysLeft > cfg.earlyNoticeThresholdDays) continue;
    if (r.probability <= 0 || r.recoverableEur <= 0) continue;
    if (r.route === "insurer") continue; // insurer notification is a claim notice, not a protective notice
    out.push({
      route: r.route,
      deadlineId: d.id,
      daysLeft: d.daysLeft,
      reason: `${d.basis}: ${d.daysLeft} day(s) left and QA has not decided yet.`,
    });
  }
  return out;
}
