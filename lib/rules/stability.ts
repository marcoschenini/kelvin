import type { RulesConfig } from "./config";
import type { QaAssessment, StabilityAllowance } from "./types";

const EPS = 1e-9;

/**
 * Quality agent rule: compare the measured excursion with the product's
 * stability allowance.
 *  - no allowance on file                      → damaged (claim path), basis no_stability_data
 *  - any measure beyond limit + margin         → damaged
 *  - any measure within ± margin of its limit  → unsure (a human QA decides)
 *  - both clearly below their limits           → usable
 */
export function assessStability(
  input: { peakC: number | null; minutesOutOfRange: number; allowance: StabilityAllowance | null; belowRange?: boolean },
  cfg: RulesConfig,
): QaAssessment {
  const { peakC, minutesOutOfRange: minutes, allowance } = input;
  const base = { peakC, minutesOutOfRange: minutes, allowance };
  if (input.belowRange) {
    return {
      ...base,
      verdict: "damaged",
      basis: "no_stability_data",
      reasons: ["The logger shows readings below 2 °C. The stability allowance on file only covers warm excursions, so freezing cannot be shown to be harmless."],
    };
  }
  if (!allowance) {
    return {
      ...base,
      verdict: "damaged",
      basis: "no_stability_data",
      reasons: ["No stability data is on file for this product, so the excursion cannot be shown to be harmless."],
    };
  }
  const m = cfg.qaUncertaintyMarginPct / 100;
  const peakText = peakC == null ? "no temperature peak" : `a peak of ${peakC} °C`;
  const measured = `The logger shows ${peakText} and ${minutes} min outside 2–8 °C`;
  const limits = `the stability allowance of up to ${allowance.maxTempC} °C for a cumulative ${allowance.maxMinutesOutOfRange} min`;

  const peakBeyond = peakC != null && peakC > allowance.maxTempC * (1 + m) + EPS;
  const minBeyond = minutes > allowance.maxMinutesOutOfRange * (1 + m) + EPS;
  const peakNear = peakC != null && peakC >= allowance.maxTempC * (1 - m) - EPS && !peakBeyond;
  const minNear = minutes >= allowance.maxMinutesOutOfRange * (1 - m) - EPS && !minBeyond;

  if (peakBeyond || minBeyond) {
    const which = [
      peakBeyond ? `the peak of ${peakC} °C is above the ${allowance.maxTempC} °C limit` : null,
      minBeyond ? `the ${minutes} min outside range exceed the ${allowance.maxMinutesOutOfRange} min limit` : null,
    ].filter(Boolean);
    return {
      ...base,
      verdict: "damaged",
      basis: "beyond_allowance",
      reasons: [`${measured}, beyond ${limits}: ${which.join(" and ")}.`, "The product can no longer be shown to be within its stability data, so the claim path applies."],
    };
  }
  if (peakNear || minNear) {
    return {
      ...base,
      verdict: "unsure",
      basis: "near_limit",
      reasons: [
        `${measured}, within ${cfg.qaUncertaintyMarginPct}% of ${limits}.`,
        "The result is too close to the limit for the quality agent to decide, so a human QA must make the disposition.",
      ],
    };
  }
  return {
    ...base,
    verdict: "usable",
    basis: "within_allowance",
    reasons: [`${measured}, clearly within ${limits}.`, "The product stays within its stability data, so there is no damage and nothing to claim."],
  };
}
