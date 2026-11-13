import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, TRANSITIONS, TransitionError } from "@/lib/case/status-machine";
import { CASE_STATUSES } from "@/lib/domain/case-status";

describe("status machine", () => {
  it("covers every status", () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...CASE_STATUSES].sort());
  });
  it("follows the brief's happy paths", () => {
    const claim = ["new", "investigating", "awaiting_qa", "claim_prepared", "awaiting_approval", "sent", "in_negotiation", "closed_settled"] as const;
    for (let i = 1; i < claim.length; i++) expect(canTransition(claim[i - 1], claim[i])).toBe(true);
    const noClaim = ["new", "investigating", "awaiting_qa", "no_claim", "closed_no_claim"] as const;
    for (let i = 1; i < noClaim.length; i++) expect(canTransition(noClaim[i - 1], noClaim[i])).toBe(true);
  });
  it("cannot skip the human gates", () => {
    // investigating -> claim_prepared exists only for the quality agent's "damaged" decision (see gates)
    expect(canTransition("investigating", "claim_prepared")).toBe(true);
    expect(canTransition("investigating", "awaiting_approval")).toBe(false);
    expect(canTransition("investigating", "sent")).toBe(false);
    expect(canTransition("claim_prepared", "sent")).toBe(false);
    expect(canTransition("awaiting_qa", "sent")).toBe(false);
    expect(() => assertTransition("claim_prepared", "sent")).toThrow(TransitionError);
  });
  it("treats closed states as terminal", () => {
    for (const s of CASE_STATUSES.filter((x) => x.startsWith("closed_"))) expect(TRANSITIONS[s]).toHaveLength(0);
  });
  it("lets a manager send a claim back for redrafting", () => {
    expect(canTransition("awaiting_approval", "claim_prepared")).toBe(true);
  });
  it("closes the case when the manager does not approve the claim", () => {
    expect(canTransition("awaiting_approval", "closed_not_approved")).toBe(true);
    for (const from of ["new", "investigating", "awaiting_qa", "claim_prepared", "sent", "in_negotiation"] as const) expect(canTransition(from, "closed_not_approved")).toBe(false);
  });
});
