import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "@/lib/rules/config";
import { canAppeal, remindersDue } from "@/lib/rules/followup";
import { computeOutcome } from "@/lib/rules/outcome";

const cfg = DEFAULT_RULES;
const sentAt = "2026-11-01T10:00:00Z";
const at = (d: number) => new Date(Date.parse(sentAt) + d * 86_400_000);

describe("remindersDue", () => {
  const base = { sentAt, lastReplyAt: null, remindersSent: [] as number[] };
  it("nothing before day 14", () => expect(remindersDue({ ...base, now: at(13) }, cfg)).toEqual([]));
  it("day 14 is due", () => expect(remindersDue({ ...base, now: at(14) }, cfg)).toEqual([14]));
  it("day 30 is due after day 14 was sent", () => {
    expect(remindersDue({ ...base, remindersSent: [14], now: at(30) }, cfg)).toEqual([30]);
    expect(remindersDue({ ...base, remindersSent: [14], now: at(20) }, cfg)).toEqual([]);
  });
  it("both marks are due when nothing was sent by day 31", () => expect(remindersDue({ ...base, now: at(31) }, cfg)).toEqual([14, 30]));
  it("none once the counterparty replied", () => {
    expect(remindersDue({ ...base, lastReplyAt: at(5).toISOString(), now: at(40) }, cfg)).toEqual([]);
  });
  it("a reply before sending does not count", () => {
    expect(remindersDue({ ...base, lastReplyAt: "2026-10-25T00:00:00Z", now: at(15) }, cfg)).toEqual([14]);
  });
  it("uses the configured marks", () => {
    expect(remindersDue({ ...base, now: at(8) }, { ...cfg, reminderDays: [7] })).toEqual([7]);
  });
});

describe("canAppeal", () => {
  it("allows exactly one appeal by default", () => {
    expect(canAppeal(0, cfg)).toBe(true);
    expect(canAppeal(1, cfg)).toBe(false);
  });
  it("follows maxAppeals", () => expect(canAppeal(1, { ...cfg, maxAppeals: 2 })).toBe(true));
});

describe("computeOutcome", () => {
  const openedAt = new Date("2026-11-01T00:00:00Z");
  const closedAt = new Date("2026-11-11T00:00:00Z");
  it("recovered in part: recovery % and days", () => {
    const o = computeOutcome({ status: "closed_settled", claimAmountEur: 190_000, recoveredEur: 95_000, payer: "insurer", openedAt, closedAt });
    expect(o).toMatchObject({ result: "settled", claimedEur: 190_000, recoveredEur: 95_000, recoveryPct: 50, payer: "insurer", daysToClose: 10 });
  });
  it("rejected recovers nothing", () => {
    const o = computeOutcome({ status: "closed_rejected", claimAmountEur: 1000, recoveredEur: null, payer: "carrier", openedAt, closedAt });
    expect(o).toMatchObject({ result: "rejected", recoveredEur: 0, recoveryPct: 0 });
  });
  it("no claim has no amounts", () => {
    const o = computeOutcome({ status: "closed_no_claim", claimAmountEur: 5, recoveredEur: null, payer: null, openedAt, closedAt });
    expect(o).toMatchObject({ result: "no_claim", claimedEur: null, recoveredEur: null, recoveryPct: null });
  });
  it("not approved keeps the intended claim but recovers nothing", () => {
    const o = computeOutcome({ status: "closed_not_approved", claimAmountEur: 190_000, recoveredEur: null, payer: null, openedAt, closedAt });
    expect(o).toMatchObject({ result: "not_approved", claimedEur: 190_000, recoveredEur: null, recoveryPct: null });
  });
  it("refuses open statuses", () => {
    expect(() => computeOutcome({ status: "sent", claimAmountEur: 1, recoveredEur: null, payer: null, openedAt, closedAt })).toThrow();
  });
});
