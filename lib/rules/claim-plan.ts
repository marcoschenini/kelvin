import type { CustodyParty } from "@/lib/domain/parties";
import type { ClaimPlanItem, RankedRoute } from "./types";

/** TEMPORARY stand-in (backend owns this file). */
export function buildClaimPlan(ranked: RankedRoute[], input: { custodyAtExcursion: CustodyParty | null; lossEur: number }): ClaimPlanItem[] {
  const top = ranked.find((r) => r.recommended);
  if (!top) return [];
  const plan: ClaimPlanItem[] = [{ route: top.route, role: "primary", amountEur: top.recoverableEur, reason: top.reasons[0] ?? "Best expected recovery", order: 1 }];
  if (top.route === "insurer") {
    const custodyRoute = input.custodyAtExcursion === "airline" ? "carrier" : input.custodyAtExcursion === "forwarder" ? "forwarder" : null;
    const sec = ranked.find((r) => r.route === custodyRoute);
    if (sec && sec.recoverableEur > 0) {
      const uninsured = Math.max(0, input.lossEur - top.recoverableEur);
      const amountEur = Math.min(sec.recoverableEur, uninsured);
      if (amountEur > 0) plan.push({ route: sec.route, role: "secondary", amountEur, reason: "Party in custody at the excursion, for the uninsured part (deductible and uninsured share)", order: 2 });
    }
  }
  return plan;
}
