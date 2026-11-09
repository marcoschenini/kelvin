import { formatEUR } from "@/lib/format";
import type { RecoveryRoute } from "@/lib/domain/parties";
import type { RulesConfig } from "./config";
import type { Deadline, LiabilityInput, RankedRoute, RouteLiability } from "./types";

function probabilityFor(r: RouteLiability, input: LiabilityInput, cfg: RulesConfig): { p: number; why: string } {
  const P = cfg.probability;
  if (input.qa === "released") return { p: 0, why: "Product released by QA" };
  switch (r.route) {
    case "carrier":
      return input.custodyAtExcursion === "airline"
        ? { p: P.carrierInCustody, why: "Excursion occurred in the airline's custody" }
        : { p: P.carrierNotInCustody, why: "Airline did not hold the cargo during the excursion" };
    case "forwarder":
      if (input.custodyAtExcursion === "forwarder") {
        return input.contract.coldRoomDuty && input.excursionInUncontrolledSegment
          ? { p: P.forwarderInCustodyDutyBreached, why: "Excursion in forwarder custody, in breach of its cold-room duty" }
          : { p: P.forwarderInCustody, why: "Excursion in forwarder custody" };
      }
      if (input.custodyAtExcursion === "airline" && input.contract.airLegPassThrough)
        return { p: P.forwarderPassThrough, why: "Forwarder only passes through the carrier's liability" };
      return { p: P.forwarderNotInCustody, why: "Forwarder did not hold the cargo during the excursion" };
    case "insurer":
      return r.recoverableEur > 0 ? { p: P.insurerCovered, why: "Temperature deviation is covered by the policy" } : { p: 0, why: "Not covered" };
  }
}

/**
 * Ranks routes by expected recovery = recoverable € × probability.
 * A route whose notice deadline has lapsed is blocked (probability 0).
 */
export function rankRoutes(
  liabilities: RouteLiability[],
  deadlines: Deadline[],
  input: LiabilityInput,
  cfg: RulesConfig,
): RankedRoute[] {
  const noticeFor = (route: RecoveryRoute) => deadlines.find((d) => d.route === route && d.kind === "notice") ?? null;
  const ranked = liabilities.map((r) => {
    const notice = noticeFor(r.route);
    const base = probabilityFor(r, input, cfg);
    let p = base.p;
    const why = base.why;
    const reasons = [why];
    const blockers = [...r.blockers];
    if (notice && notice.status === "overdue") {
      p = 0;
      blockers.push(`Notice period lapsed (${-notice.daysLeft} days ago): ${notice.basis}.`);
      reasons.push("Notice deadline has passed");
    }
    const expectedEur = Math.round(r.recoverableEur * p);
    if (r.recoverableEur > 0) reasons.push(`Recoverable ${formatEUR(r.recoverableEur)} if successful`);
    return { ...r, blockers, probability: p, expectedEur, reasons, noticeDeadline: notice, rank: 0, recommended: false };
  });
  ranked.sort((a, b) => b.expectedEur - a.expectedEur || b.recoverableEur - a.recoverableEur);
  ranked.forEach((r, i) => {
    r.rank = i + 1;
    r.recommended = i === 0 && r.expectedEur > 0;
  });
  return ranked;
}
