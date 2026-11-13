import { describe, expect, it } from "vitest";
import { WORLD, WORLD_HEIGHT } from "@/lib/geo/world";
import { FLEET, history, routePath, simulate } from "@/lib/live/fleet";

const T0 = Date.parse("2026-11-13T09:00:00Z");
const HOUR = 3_600_000;

describe("live fleet simulation", () => {
  it("is deterministic for a given time", () => {
    const a = FLEET.map((s) => simulate(s, T0));
    const b = FLEET.map((s) => simulate(s, T0));
    expect(a.map((s) => [s.xy, s.tempC, s.status])).toEqual(b.map((s) => [s.xy, s.tempC, s.status]));
  });

  it("always has most of the fleet in transit, with some excursions and near misses", () => {
    for (let h = 0; h < 72; h += 3) {
      const live = FLEET.map((s) => simulate(s, T0 + h * HOUR)).filter((s) => s.inTransit);
      expect(live.length).toBeGreaterThan(FLEET.length * 0.6);
      expect(live.every((s) => s.xy[0] >= 0 && s.xy[0] <= WORLD.width && s.xy[1] >= 0 && s.xy[1] <= WORLD_HEIGHT)).toBe(true);
    }
    let excursions = 0;
    let atRisk = 0;
    for (let h = 0; h < 72; h += 1) {
      const live = FLEET.map((s) => simulate(s, T0 + h * HOUR)).filter((s) => s.inTransit);
      excursions += live.filter((s) => s.status === "excursion").length;
      atRisk += live.filter((s) => s.status === "at_risk").length;
    }
    expect(excursions).toBeGreaterThan(0);
    expect(atRisk).toBeGreaterThan(0);
  });

  it("flags an excursion once a reading leaves 2–8 °C and keeps it for the rest of the trip", () => {
    const ship = FLEET.find((s) => s.profile?.kind === "excursion")!;
    let seen = false;
    for (let m = 0; m < ship.cycleHours * 60; m += 20) {
      const st = simulate(ship, T0 + m * 60_000);
      if (!st.inTransit) {
        seen = false;
        continue;
      }
      if (st.tripPeakC > 8) seen = true;
      if (seen) expect(st.status).toBe("excursion");
    }
  });

  it("gives a 12-hour, 15-minute sparkline and a drawable route", () => {
    const st = FLEET.map((s) => simulate(s, T0)).find((s) => s.inTransit && (T0 - s.tripStart) / HOUR > 12)!;
    expect(history(st, T0)).toHaveLength(49);
    expect(routePath(st.ship).length).toBeGreaterThan(0);
  });
});
