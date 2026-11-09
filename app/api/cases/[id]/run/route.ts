import { z } from "zod";
import { getDb } from "@/lib/db/client";
import type { AgentEvent } from "@/lib/agent/events";
import { runAgent } from "@/lib/agent/orchestrator";

export const maxDuration = 300;

const Body = z.object({
  kind: z.enum(["investigate", "prepare_claim", "close", "follow_up"]),
  mode: z.enum(["live", "deterministic"]).optional(),
});

/**
 * POST { kind } → runs the agent and streams its events as NDJSON
 * (one AgentEvent per line) so the UI can render steps as they happen.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/cases/[id]/run">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid body" }, { status: 400 });
  const db = await getDb();
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AgentEvent) => controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      try {
        await runAgent({ db, caseId: id, kind: parsed.data.kind, mode: parsed.data.mode === "deterministic" ? "deterministic" : undefined, onEvent: send });
      } catch (e) {
        send({ type: "run_finished", status: "failed", durationMs: 0, error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
