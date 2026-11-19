import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { FLEET, simulate } from "@/lib/live/fleet";
import { createLiveCase } from "@/lib/live/live-cases";

const Body = z.object({ shipId: z.string(), tripIndex: z.number().int() });

/** POST { shipId, tripIndex } → opens a claims case for a delivered live trip with an excursion. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const { shipId, tripIndex } = parsed.data;
  if (!FLEET.some((s) => s.id === shipId)) return Response.json({ error: "Unknown shipment" }, { status: 404 });
  const ship = FLEET.find((s) => s.id === shipId)!;
  const current = simulate(ship, Date.now()).tripIndex;
  if (tripIndex < 0 || tripIndex < current - 3 || tripIndex > current + 40) return Response.json({ error: "Trip out of range" }, { status: 422 });
  const r = await createLiveCase(await getDb(), shipId, tripIndex, new Date());
  if (!r) return Response.json({ error: "No excursion on this trip" }, { status: 422 });
  return Response.json(r);
}
