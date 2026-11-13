import type { CustodyParty, RecoveryRoute } from "@/lib/domain/parties";
import { formatEUR } from "@/lib/format";
import type { ClaimPlanItem, RankedRoute } from "./types";

const ROUTE_OF_CUSTODY: Partial<Record<CustodyParty, RecoveryRoute>> = { airline: "carrier", forwarder: "forwarder" };

/**
 * Claim plan: the recommended route is claimed first. When that route is the
 * insurer and the party in custody at the excursion has a positive capped
 * recovery, a secondary claim against that party covers the uninsured part
 * (deductible + uninsured %), never more than that party's own capped amount.
 */
export function buildClaimPlan(
  ranked: RankedRoute[],
  input: { custodyAtExcursion: CustodyParty | null; lossEur: number },
): ClaimPlanItem[] {
  const primary = ranked.find((r) => r.recommended);
  if (!primary || primary.recoverableEur <= 0) return [];
  const plan: ClaimPlanItem[] = [
    { route: primary.route, role: "primary", amountEur: primary.recoverableEur, reason: `Recommended route: ${primary.reasons[0] ?? "highest expected recovery"}.`, order: 1 },
  ];
  if (primary.route === "insurer" && input.custodyAtExcursion) {
    const secRoute = ROUTE_OF_CUSTODY[input.custodyAtExcursion];
    const sec = secRoute ? ranked.find((r) => r.route === secRoute) : undefined;
    const uninsured = Math.max(0, input.lossEur - primary.recoverableEur);
    if (sec && sec.recoverableEur > 0 && uninsured > 0) {
      const amount = Math.min(sec.recoverableEur, uninsured);
      plan.push({
        route: sec.route,
        role: "secondary",
        amountEur: Math.round(amount * 100) / 100,
        reason: `Party in custody at the excursion: claim towards the uninsured part (${formatEUR(uninsured)} of deductible and uninsured share), limited to its own cap of ${formatEUR(sec.recoverableEur)}.`,
        order: 2,
      });
    }
  }
  return plan;
}
