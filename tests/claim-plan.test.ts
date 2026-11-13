import { describe, expect, it } from "vitest";
import { buildClaimPlan } from "@/lib/rules/claim-plan";
import { DEFAULT_RULES } from "@/lib/rules/config";
import { computeDeadlines } from "@/lib/rules/deadlines";
import { computeLiability } from "@/lib/rules/liability";
import { rankRoutes } from "@/lib/rules/ranking";
import type { ContractTermsParsed, LiabilityInput, PolicyTermsParsed } from "@/lib/rules/types";

const cfg = DEFAULT_RULES;
const nordstar: ContractTermsParsed = { found: true, coldRoomDuty: true, ambientLimitMinutes: 30, liabilityCap: { kind: "sdr_per_kg", sdrPerKg: 8.33 }, airLegPassThrough: true, noticeDays: 7, timeBarYears: 1 };
const polder: ContractTermsParsed = { ...nordstar, liabilityCap: { kind: "invoice_value" } };
const meridian: PolicyTermsParsed = { found: true, temperatureCover: true, deductibleEur: 10_000, insuredPercentOfInvoice: 100, minDeviationMinutes: 60, noticeDays: 30, preservationDuty: true };
const lowlands: PolicyTermsParsed = { ...meridian, deductibleEur: 25_000, minDeviationMinutes: 0 };
const NOW = new Date("2026-11-09T10:00:00Z");

function ranked(input: LiabilityInput, deliveredDaysAgo: number) {
  const delivered = new Date(Date.UTC(2026, 10, 9, 14) - deliveredDaysAgo * 86_400_000);
  const deadlines = computeDeadlines({ deliveredAt: delivered, discoveredAt: new Date(delivered.getTime() + 3_600_000), contract: input.contract, policy: input.policy, now: NOW }, cfg);
  return rankRoutes(computeLiability(input, cfg), deadlines, input, cfg);
}

const B: LiabilityInput = { lossEur: 200_000, weightKg: 120, declaredValueEur: null, custodyAtExcursion: "airline", excursionInUncontrolledSegment: true, excursionMinutes: 90, qa: "rejected", contract: nordstar, policy: meridian };
const C: LiabilityInput = { lossEur: 350_000, weightKg: 180, declaredValueEur: null, custodyAtExcursion: "forwarder", excursionInUncontrolledSegment: true, excursionMinutes: 225, qa: "rejected", contract: polder, policy: lowlands };

describe("claim plan", () => {
  it("case B: insurer primary 190,000 + airline secondary 3,771", () => {
    const plan = buildClaimPlan(ranked(B, 10), { custodyAtExcursion: "airline", lossEur: 200_000 });
    expect(plan.map((p) => [p.route, p.role, Math.round(p.amountEur), p.order])).toEqual([
      ["insurer", "primary", 190_000, 1],
      ["carrier", "secondary", 3_771, 2],
    ]);
    expect(plan[1].reason).toMatch(/uninsured/);
  });
  it("case C: forwarder 350,000 only", () => {
    const plan = buildClaimPlan(ranked(C, 2), { custodyAtExcursion: "forwarder", lossEur: 350_000 });
    expect(plan.map((p) => [p.route, p.role, p.amountEur])).toEqual([["forwarder", "primary", 350_000]]);
  });
  it("secondary never exceeds the uninsured part", () => {
    const input: LiabilityInput = { ...B, declaredValueEur: 150_000, policy: { ...meridian, deductibleEur: 2_000 } };
    const plan = buildClaimPlan(ranked(input, 10), { custodyAtExcursion: "airline", lossEur: 200_000 });
    expect(plan[0].route).toBe("insurer");
    expect(plan[1].amountEur).toBe(2_000);
  });
  it("nothing recoverable gives an empty plan", () => {
    expect(buildClaimPlan(ranked({ ...B, qa: "released" }, 10), { custodyAtExcursion: "airline", lossEur: 200_000 })).toEqual([]);
  });
  it("no secondary when custody is held by the shipper or consignee", () => {
    const plan = buildClaimPlan(ranked(B, 10), { custodyAtExcursion: "consignee", lossEur: 200_000 });
    expect(plan).toHaveLength(1);
  });
});
