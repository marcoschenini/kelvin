import { describe, expect, it, vi } from "vitest";
import { FLEET, simulate } from "@/lib/live/fleet";

vi.mock("@/lib/db/client", () => ({ getDb: async () => ({}) }));
vi.mock("@/lib/live/live-cases", () => ({ createLiveCase: vi.fn(async () => ({ caseId: "x", created: true })) }));

const post = async (body: unknown) => {
  const { POST } = await import("@/app/api/live/deliver/route");
  return POST(new Request("http://x/api/live/deliver", { method: "POST", body: JSON.stringify(body) }));
};

describe("POST /api/live/deliver trip window", () => {
  const ship = FLEET[0];
  const cur = simulate(ship, Date.now()).tripIndex;
  it("rejects out-of-range, negative and non-integer trips", async () => {
    for (const tripIndex of [cur - 4, cur + 41, -1]) {
      const r = await post({ shipId: ship.id, tripIndex });
      expect(r.status).toBe(422);
      expect(await r.json()).toEqual({ error: "Trip out of range" });
    }
    expect((await post({ shipId: ship.id, tripIndex: 1.5 })).status).toBe(400);
  });
  it("accepts the window edges", async () => {
    for (const tripIndex of [cur - 3, cur + 40]) expect((await post({ shipId: ship.id, tripIndex })).status).toBe(200);
  });
});
