import { describe, expect, it } from "vitest";
import type { CaseRecord, CustodySegmentRecord } from "@/lib/case/record";
import { buildJourney } from "@/lib/geo/journey";
import { MAP_HEIGHT, MAP_WIDTH, project } from "@/lib/geo/projection";
import { buildCase } from "@/seed/build";
import { CASE_B, CASE_C } from "@/seed/cases/demo";
import type { CaseSpec } from "@/seed/spec";

const NOW = new Date("2026-11-09T10:00:00Z");

async function recordFor(spec: CaseSpec, excursionSeq: number): Promise<CaseRecord> {
  const g = await buildCase(spec, NOW);
  const json = JSON.parse(new TextDecoder().decode(g.files.find((f) => f.kind === "handling_events")!.bytes));
  const segments: CustodySegmentRecord[] = json.events.map((e: Record<string, unknown>) => ({
    seq: e.seq,
    role: e.custodian_role,
    custodian: e.custodian,
    location: e.location,
    activity: e.activity,
    from: e.from_utc,
    to: e.to_utc,
    controlled: e.temperature_controlled,
    reference: e.reference,
  }));
  const seg = segments.find((s) => s.seq === excursionSeq)!;
  return {
    excursions: [{ index: 0, direction: "high", start: seg.from, end: seg.to, minutes: 90, peakC: 13, peakAt: seg.from, rowStart: 1, rowEnd: 2, citationId: "S1" }],
    custody: {
      segments,
      attribution: { excursionIndex: 0, role: seg.role, custodian: seg.custodian, segmentSeq: seg.seq, location: seg.location, activity: seg.activity, controlled: seg.controlled, spansMultipleParties: false, citationIds: [] },
    },
  };
}

describe("journey map", () => {
  it("projects inside the map", () => {
    for (const [lat, lon] of [[50.03, 8.56], [42.36, -71.01], [40.64, -73.78], [52.31, 4.76]]) {
      const [x, y] = project(lat, lon);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(MAP_WIDTH);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(MAP_HEIGHT);
    }
  });

  it("case B: places every step, draws one transatlantic flight and pins the excursion at FRA", async () => {
    const ramp = CASE_B.custody.findIndex((c) => c.location.includes("V114")) + 1;
    const j = buildJourney(await recordFor(CASE_B, ramp))!;
    expect(j.unplaced).toBe(0);
    expect(j.chain).toHaveLength(CASE_B.custody.length);
    expect(j.legs.filter((l) => l.mode === "air")).toHaveLength(1);
    expect(j.chain.filter((s) => s.excursion).map((s) => s.label)).toEqual(["FRA"]);
    const [fx, fy] = project(50.03, 8.56);
    expect(Math.hypot(j.excursion!.x - fx, j.excursion!.y - fy)).toBeLessThan(1);
    expect(j.excursion!.role).toBe("airline");
  });

  it("case C: excursion at the Schiphol hub, held by the forwarder", async () => {
    const floor = CASE_C.custody.findIndex((c) => c.location.includes("F3")) + 1;
    const j = buildJourney(await recordFor(CASE_C, floor))!;
    expect(j.excursion?.role).toBe("forwarder");
    expect(j.chain.find((s) => s.excursion)?.label).toBe("AMS");
    expect(j.stops.map((s) => s.side)).toContain("destination");
  });
});
