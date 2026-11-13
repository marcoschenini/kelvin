import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, mergeRules } from "@/lib/rules/config";
import { computeDeadlines, endOfDayPlus } from "@/lib/rules/deadlines";
import { protectiveNoticesNeeded } from "@/lib/rules/early-notice";
import { computeLiability } from "@/lib/rules/liability";
import { montrealLimit } from "@/lib/rules/montreal";
import { rankRoutes } from "@/lib/rules/ranking";
import type { ContractTermsParsed, LiabilityInput, PolicyTermsParsed, QaStatus } from "@/lib/rules/types";

const cfg = DEFAULT_RULES;
const R = cfg.sdr.eurPerSdr;

const nordstar: ContractTermsParsed = {
  found: true,
  coldRoomDuty: true,
  ambientLimitMinutes: 30,
  liabilityCap: { kind: "sdr_per_kg", sdrPerKg: 8.33 },
  airLegPassThrough: true,
  noticeDays: 7,
  timeBarYears: 1,
};
const polder: ContractTermsParsed = { ...nordstar, liabilityCap: { kind: "invoice_value" } };
const meridian: PolicyTermsParsed = {
  found: true,
  temperatureCover: true,
  deductibleEur: 10_000,
  insuredPercentOfInvoice: 100,
  minDeviationMinutes: 60,
  noticeDays: 30,
  preservationDuty: true,
};
const lowlands: PolicyTermsParsed = { ...meridian, deductibleEur: 25_000, minDeviationMinutes: 0 };

const NOW = new Date("2026-11-09T10:00:00Z");
const days = (n: number) => new Date(Date.UTC(2026, 10, 9, 14) - n * 86_400_000);

function scenario(kind: "A" | "B" | "C", qa: QaStatus) {
  const input: LiabilityInput =
    kind === "A"
      ? { lossEur: 86_400, weightKg: 64, declaredValueEur: null, custodyAtExcursion: "forwarder", excursionInUncontrolledSegment: true, excursionMinutes: 25, qa, contract: nordstar, policy: meridian }
      : kind === "B"
        ? { lossEur: 200_000, weightKg: 120, declaredValueEur: null, custodyAtExcursion: "airline", excursionInUncontrolledSegment: true, excursionMinutes: 90, qa, contract: nordstar, policy: meridian }
        : { lossEur: 350_000, weightKg: 180, declaredValueEur: null, custodyAtExcursion: "forwarder", excursionInUncontrolledSegment: true, excursionMinutes: 225, qa, contract: polder, policy: lowlands };
  const delivered = kind === "A" ? days(1) : kind === "B" ? days(10) : days(2);
  const discovered = kind === "B" ? new Date(Date.UTC(2026, 10, 8, 9)) : new Date(delivered.getTime() + 3_600_000);
  const deadlines = computeDeadlines({ deliveredAt: delivered, discoveredAt: discovered, contract: input.contract, policy: input.policy, now: NOW }, cfg);
  const liab = computeLiability(input, cfg);
  const ranked = rankRoutes(liab, deadlines, input, cfg);
  return { input, deadlines, liab, ranked, notices: protectiveNoticesNeeded(ranked, qa, cfg) };
}

describe("Montreal limit", () => {
  it("applies 26 SDR/kg without a declared value", () => {
    const m = montrealLimit({ weightKg: 120, declaredValueEur: null, lossEur: 200_000 }, cfg);
    expect(m.sdr).toBe(3120);
    expect(m.capEur).toBeCloseTo(3120 * R, 6);
    expect(m.recoverableEur).toBeCloseTo(3120 * R, 6);
  });
  it("uses the declared value when one was made", () => {
    const m = montrealLimit({ weightKg: 120, declaredValueEur: 150_000, lossEur: 200_000 }, cfg);
    expect(m.recoverableEur).toBe(150_000);
  });
  it("never pays more than the loss", () => {
    expect(montrealLimit({ weightKg: 1000, declaredValueEur: null, lossEur: 5_000 }, cfg).recoverableEur).toBe(5_000);
  });
  it("reads the SDR rate from config", () => {
    const m = montrealLimit({ weightKg: 100, declaredValueEur: null, lossEur: 1e9 }, mergeRules({ sdr: { eurPerSdr: 1 } }));
    expect(m.capEur).toBe(2600);
  });
});

describe("deadlines", () => {
  it("counts 14 calendar days from receipt to the end of the day", () => {
    expect(endOfDayPlus(new Date("2026-10-30T14:00:00Z"), 14).toISOString()).toBe("2026-11-13T23:59:59.000Z");
  });
  it("case B: Montreal notice 4 days left, forwarder notice lapsed, insurer 29 days", () => {
    const { deadlines } = scenario("B", "pending");
    const by = Object.fromEntries(deadlines.map((d) => [d.id, d]));
    expect(by.montreal_notice.daysLeft).toBe(4);
    expect(by.contract_notice.status).toBe("overdue");
    expect(by.policy_notice.daysLeft).toBe(29);
    expect(by.montreal_time_bar.dueAt.startsWith("2028-10-30")).toBe(true);
  });
  it("case C: contract notice 5 days left", () => {
    const by = Object.fromEntries(scenario("C", "pending").deadlines.map((d) => [d.id, d]));
    expect(by.contract_notice.daysLeft).toBe(5);
    expect(by.montreal_notice.daysLeft).toBe(12);
  });
  it("flags under 3 days as at risk", () => {
    const d = computeDeadlines(
      { deliveredAt: days(12), discoveredAt: days(12), contract: { found: false, noticeDays: null, timeBarYears: null }, policy: { found: false, noticeDays: null }, now: NOW },
      cfg,
    );
    expect(d.find((x) => x.id === "montreal_notice")!.status).toBe("at_risk");
  });
});

describe("liability and ranking", () => {
  it("case B: insurer recommended at €190k; carrier capped near €3.8k; forwarder blocked", () => {
    const { ranked } = scenario("B", "rejected");
    const by = Object.fromEntries(ranked.map((r) => [r.route, r]));
    expect(ranked[0].route).toBe("insurer");
    expect(by.insurer.recoverableEur).toBe(190_000);
    expect(by.carrier.recoverableEur).toBeCloseTo(3120 * R, 6);
    expect(by.forwarder.probability).toBe(0);
    expect(by.forwarder.blockers.join(" ")).toMatch(/lapsed/);
  });
  it("case C: forwarder recommended for the full invoice value", () => {
    const { ranked } = scenario("C", "rejected");
    expect(ranked[0].route).toBe("forwarder");
    expect(ranked[0].recoverableEur).toBe(350_000);
    expect(ranked.find((r) => r.route === "insurer")!.recoverableEur).toBe(325_000);
    expect(ranked.find((r) => r.route === "carrier")!.recoverableEur).toBe(0);
  });
  it("case A: QA release means nothing is recoverable on any route", () => {
    const { ranked } = scenario("A", "released");
    expect(ranked.every((r) => r.recoverableEur === 0 && r.expectedEur === 0)).toBe(true);
    expect(ranked.some((r) => r.recommended)).toBe(false);
  });
  it("case A: the policy excludes deviations under 60 minutes even before QA decides", () => {
    const { liab } = scenario("A", "pending");
    const insurer = liab.find((r) => r.route === "insurer")!;
    expect(insurer.recoverableEur).toBe(0);
    expect(insurer.blockers.join(" ")).toMatch(/below the policy minimum/);
  });
});

describe("protective notices", () => {
  it("case B: notice to the carrier while QA is pending", () => {
    expect(scenario("B", "pending").notices.map((n) => n.route)).toEqual(["carrier"]);
  });
  it("case C: notice to the forwarder on day 2", () => {
    expect(scenario("C", "pending").notices.map((n) => n.route)).toEqual(["forwarder"]);
  });
  it("case A: no notice (6 days left, above threshold)", () => {
    expect(scenario("A", "pending").notices).toEqual([]);
  });
  it("none once QA has decided", () => {
    expect(scenario("B", "rejected").notices).toEqual([]);
  });
  it("respects the configurable threshold", () => {
    const s = scenario("A", "pending");
    const wider = mergeRules({ earlyNoticeThresholdDays: 7 });
    expect(protectiveNoticesNeeded(s.ranked, "pending", wider).map((n) => n.route)).toEqual(["forwarder"]);
  });
});

describe("protective notices with missing data", () => {
  it("still needed after QA decided when required data is missing", () => {
    const { ranked } = scenario("B", "rejected");
    expect(protectiveNoticesNeeded(ranked, "rejected", cfg, { missingData: true }).map((n) => n.route)).toEqual(["carrier"]);
    expect(protectiveNoticesNeeded(ranked, "rejected", cfg, { missingData: false })).toEqual([]);
  });
  it("never when QA released the product", () => {
    const { ranked } = scenario("B", "pending");
    expect(protectiveNoticesNeeded(ranked, "released", cfg, { missingData: true })).toEqual([]);
  });
});

describe("extra costs", () => {
  it("add to the loss before caps; the Montreal and insurer limits still bite", () => {
    const base = scenario("C", "rejected").input;
    const withExtra: LiabilityInput = { ...base, extraCosts: [{ label: "Disposal", eur: 5_000 }, { label: "Re-shipment", eur: 15_000 }] };
    const liab = computeLiability(withExtra, cfg);
    // forwarder cap = invoice value = loss incl. extra costs
    expect(liab.find((r) => r.route === "forwarder")!.recoverableEur).toBe(370_000);
    // insurer: 100% of loss minus deductible 25,000
    expect(liab.find((r) => r.route === "insurer")!.recoverableEur).toBe(345_000);
  });
  it("the Montreal cap does not grow with extra costs", () => {
    const base = scenario("B", "rejected").input;
    const a = computeLiability(base, cfg).find((r) => r.route === "carrier")!.recoverableEur;
    const b = computeLiability({ ...base, extraCosts: [{ label: "Disposal", eur: 4_000 }] }, cfg).find((r) => r.route === "carrier")!.recoverableEur;
    expect(b).toBe(a);
  });
  it("demo numbers do not move without extra costs", () => {
    const b = computeLiability(scenario("B", "rejected").input, cfg);
    expect(b.find((r) => r.route === "insurer")!.recoverableEur).toBe(190_000);
  });
});

describe("config defaults", () => {
  it("has defaults for the workflow v2 fields and merges overrides", () => {
    expect(cfg.qaUncertaintyMarginPct).toBe(10);
    expect(cfg.reminderDays).toEqual([14, 30]);
    expect(cfg.maxAppeals).toBe(1);
    const m = mergeRules({ maxAppeals: 2 });
    expect(m.maxAppeals).toBe(2);
    expect(m.reminderDays).toEqual([14, 30]);
  });
});
