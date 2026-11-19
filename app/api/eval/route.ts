import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { claimEvalRun, EvalBusyError, runEvaluation, type EvalEvent } from "@/lib/eval/harness";

export const maxDuration = 300;

const Body = z.object({
  mode: z.enum(["live", "deterministic"]).default("deterministic"),
  limit: z.number().int().min(1).max(50).optional(),
});

/** POST → runs the evaluation and streams progress as NDJSON (one EvalEvent per line). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const db = await getDb();
  const enc = new TextEncoder();
  // Live model runs take ~1 min per case: cap them so a request stays within the function limit.
  const limit = parsed.data.mode === "live" ? Math.min(parsed.data.limit ?? 4, 4) : parsed.data.limit;
  let claim;
  try {
    claim = await claimEvalRun(db, { mode: parsed.data.mode, limit });
  } catch (e) {
    if (e instanceof EvalBusyError) return Response.json({ error: e.message }, { status: 409 });
    throw e;
  }
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // enqueue throws once the client aborted: that propagates into runEvaluation, which marks the run "failed".
      const send = (e: EvalEvent) => controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      try {
        await runEvaluation(db, { claim, onEvent: send });
      } catch (e) {
        try {
          send({ type: "error", error: e instanceof Error ? e.message : String(e) });
        } catch {}
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
