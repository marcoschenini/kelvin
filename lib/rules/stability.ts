import type { RulesConfig } from "./config";
import type { QaAssessment, StabilityAllowance } from "./types";

/** TEMPORARY stand-in (backend owns this file). */
export function assessStability(
  input: { peakC: number | null; minutesOutOfRange: number; allowance: StabilityAllowance | null },
  cfg: RulesConfig,
): QaAssessment {
  const { peakC, minutesOutOfRange, allowance } = input;
  const base = { peakC, minutesOutOfRange, allowance };
  if (!allowance) {
    return { ...base, verdict: "damaged", basis: "no_stability_data", reasons: ["No stability data is on file, so the excursion cannot be shown to be harmless."] };
  }
  const m = cfg.qaUncertaintyMarginPct / 100;
  const t = peakC ?? 8;
  const within = t <= allowance.maxTempC && minutesOutOfRange <= allowance.maxMinutesOutOfRange;
  const beyond = t > allowance.maxTempC * (1 + m) || minutesOutOfRange > allowance.maxMinutesOutOfRange * (1 + m);
  const near = !within || t >= allowance.maxTempC * (1 - m) || minutesOutOfRange >= allowance.maxMinutesOutOfRange * (1 - m);
  if (beyond) return { ...base, verdict: "damaged", basis: "beyond_allowance", reasons: [`The excursion (${t} °C, ${minutesOutOfRange} min) is beyond the stability allowance (${allowance.maxTempC} °C, ${allowance.maxMinutesOutOfRange} min).`] };
  if (near) return { ...base, verdict: "unsure", basis: "near_limit", reasons: [`The excursion (${t} °C, ${minutesOutOfRange} min) is within ${cfg.qaUncertaintyMarginPct}% of the stability allowance (${allowance.maxTempC} °C, ${allowance.maxMinutesOutOfRange} min).`] };
  return { ...base, verdict: "usable", basis: "within_allowance", reasons: [`The excursion (${t} °C, ${minutesOutOfRange} min) is within the stability allowance (${allowance.maxTempC} °C, ${allowance.maxMinutesOutOfRange} min).`] };
}
