import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { FLEET } from "@/lib/live/fleet";
import { createLiveCase } from "@/lib/live/live-cases";

const Body = z.object({ shipId: z.string(), tripIndex: z.number().int() });

/** POST { shipId, tripIndex } → opens a claims case for a delivered live trip with an excursion. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const { shipId, tripIndex } = parsed.data;
  if (!FLEET.some((s) => s.id === shipId)) return Response.json({ error: "Unknown shipment" }, { status: 404 });
  const r = await createLiveCase(await getDb(), shipId, tripIndex, new Date());
  if (!r) return Response.json({ error: "No excursion on this trip" }, { status: 422 });
  return Response.json(r);
}
