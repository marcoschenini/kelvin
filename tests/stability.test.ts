import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, mergeRules } from "@/lib/rules/config";
import { assessStability } from "@/lib/rules/stability";

const cfg = DEFAULT_RULES;
const B = { maxTempC: 10, maxMinutesOutOfRange: 30 };

describe("assessStability", () => {
  it("case A: 9.2 °C for 25 min against 25 °C / 1,440 min is usable", () => {
    const a = assessStability({ peakC: 9.2, minutesOutOfRange: 25, allowance: { maxTempC: 25, maxMinutesOutOfRange: 1440 } }, cfg);
    expect(a.verdict).toBe("usable");
    expect(a.basis).toBe("within_allowance");
    expect(a.reasons.length).toBeGreaterThan(0);
  });
  it("case B: 13 °C for 90 min against 10 °C / 30 min is damaged", () => {
    const a = assessStability({ peakC: 13, minutesOutOfRange: 90, allowance: B }, cfg);
    expect(a.verdict).toBe("damaged");
    expect(a.basis).toBe("beyond_allowance");
  });
  it("case C: 15 °C for 225 min against 10 °C / 60 min is damaged", () => {
    expect(assessStability({ peakC: 15, minutesOutOfRange: 225, allowance: { maxTempC: 10, maxMinutesOutOfRange: 60 } }, cfg).verdict).toBe("damaged");
  });
  it("a freezing excursion is outside a heat-only allowance: damaged", () => {
    const a = assessStability({ peakC: null, minutesOutOfRange: 10, allowance: B, belowRange: true }, cfg);
    expect(a.verdict).toBe("damaged");
    expect(a.basis).toBe("no_stability_data");
  });
  it("no stability data is damaged (claim path)", () => {
    const a = assessStability({ peakC: 9, minutesOutOfRange: 10, allowance: null }, cfg);
    expect(a.verdict).toBe("damaged");
    expect(a.basis).toBe("no_stability_data");
  });
  it("within 10% below a limit is unsure", () => {
    const a = assessStability({ peakC: 9.5, minutesOutOfRange: 10, allowance: B }, cfg);
    expect(a.verdict).toBe("unsure");
    expect(a.basis).toBe("near_limit");
    expect(assessStability({ peakC: 9, minutesOutOfRange: 28, allowance: B }, cfg).verdict).toBe("unsure");
  });
  it("within 10% above a limit is unsure", () => {
    expect(assessStability({ peakC: 10.9, minutesOutOfRange: 10, allowance: B }, cfg).verdict).toBe("unsure");
    expect(assessStability({ peakC: 9, minutesOutOfRange: 33, allowance: B }, cfg).verdict).toBe("unsure");
  });
  it("the margin edges are inclusive, just outside is decided", () => {
    expect(assessStability({ peakC: 11, minutesOutOfRange: 10, allowance: B }, cfg).verdict).toBe("unsure");
    expect(assessStability({ peakC: 11.1, minutesOutOfRange: 10, allowance: B }, cfg).verdict).toBe("damaged");
    expect(assessStability({ peakC: 8.9, minutesOutOfRange: 26, allowance: B }, cfg).verdict).toBe("usable");
  });
  it("a clear breach of one limit is damaged even if the other is near", () => {
    expect(assessStability({ peakC: 9.8, minutesOutOfRange: 60, allowance: B }, cfg).verdict).toBe("damaged");
  });
  it("no excursion at all is usable", () => {
    expect(assessStability({ peakC: null, minutesOutOfRange: 0, allowance: B }, cfg).verdict).toBe("usable");
  });
  it("the margin is configurable", () => {
    const wide = mergeRules({ qaUncertaintyMarginPct: 30 });
    expect(assessStability({ peakC: 12, minutesOutOfRange: 10, allowance: B }, wide).verdict).toBe("unsure");
    const none = mergeRules({ qaUncertaintyMarginPct: 0 });
    expect(assessStability({ peakC: 10.5, minutesOutOfRange: 10, allowance: B }, none).verdict).toBe("damaged");
  });
  it("reasons are full sentences", () => {
    for (const r of assessStability({ peakC: 13, minutesOutOfRange: 90, allowance: B }, cfg).reasons) expect(r).toMatch(/\.$/);
  });
});
