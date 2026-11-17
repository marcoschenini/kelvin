import { stepCountIs, streamText } from "ai";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { answer } from "@/lib/chat/answers";
import { loadChatContext, type ChatContext } from "@/lib/chat/context";
import type { ChatEvent } from "@/lib/chat/events";
import { matchIntent } from "@/lib/chat/intents";
import { CHAT_SYSTEM, chatTools, getChatModel } from "@/lib/chat/llm";
import type { Citation } from "@/lib/domain/citation";

export const maxDuration = 60;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(24)
    .refine((m) => m[m.length - 1].role === "user", "The last message must be the user's question"),
});

/** Only ids that exist in the case's registry become chips; anything else the model wrote is dropped. */
function citedSources(ctx: ChatContext, text: string): Record<string, Citation> {
  const reg = ctx.record.citations ?? {};
  const items: Record<string, Citation> = {};
  for (const m of text.matchAll(/\[(S\d+)\]/g)) if (reg[m[1]]) items[m[1]] = reg[m[1]];
  return items;
}

function why(e: unknown): string {
  // The AI SDK may wrap the provider error after retries (RetryError.lastError).
  const err = e as { statusCode?: number; lastError?: { statusCode?: number } };
  const status = err?.statusCode ?? err?.lastError?.statusCode;
  if (status === 429) return "the free AI quota is used up for now";
  if (status === 401 || status === 403) return "the AI key was refused";
  if ((e as Error)?.name === "TimeoutError" || (e as Error)?.name === "AbortError") return "the AI took too long";
  return "the AI is unavailable";
}

/**
 * POST { messages } → answers the last question about the case, streamed as NDJSON.
 * With GROQ_API_KEY: a language model with read-only tools over Kelvin's own answers.
 * Without it, or if the model fails before writing anything: the built-in answers.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/cases/[id]/chat">) {
  const { id } = await ctx.params;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  const db = await getDb();
  let caseCtx: ChatContext;
  try {
    caseCtx = await loadChatContext(db, id);
  } catch {
    return Response.json({ error: "Case not found" }, { status: 404 });
  }
  const messages = parsed.data.messages;
  const question = messages[messages.length - 1].content;
  const enc = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatEvent) => controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      const builtIn = (fallback?: string) => {
        const m = matchIntent(question);
        const a = answer(caseCtx, m.intent, m.whatIf);
        send({ type: "text", delta: a.text });
        send({ type: "citations", items: citedSources(caseCtx, a.text) });
        send({ type: "done", mode: "rules", fallback });
      };
      try {
        const llm = await getChatModel();
        if (!llm) {
          send({ type: "meta", mode: "rules", model: null });
          builtIn();
          return;
        }
        send({ type: "meta", mode: "ai", model: llm.id });
        let written = "";
        try {
          const result = streamText({
            model: llm.model,
            system: CHAT_SYSTEM,
            messages,
            tools: chatTools(caseCtx),
            stopWhen: stepCountIs(5),
            maxRetries: 1,
            abortSignal: AbortSignal.timeout(45_000),
          });
          for await (const part of result.fullStream) {
            if (part.type === "text-delta") {
              const delta = (part as { text?: string; delta?: string }).text ?? (part as { delta?: string }).delta ?? "";
              written += delta;
              send({ type: "text", delta });
            } else if (part.type === "tool-call") {
              send({ type: "tool", name: part.toolName });
            } else if (part.type === "error") {
              throw part.error instanceof Error ? part.error : new Error(String(part.error));
            }
          }
          if (!written.trim()) throw new Error("empty answer");
          send({ type: "citations", items: citedSources(caseCtx, written) });
          send({ type: "done", mode: "ai" });
        } catch (e) {
          // Nothing shown yet: answer from the built-in answers instead, and say why.
          if (!written.trim()) builtIn(why(e));
          else {
            send({ type: "citations", items: citedSources(caseCtx, written) });
            send({ type: "done", mode: "ai", fallback: `${why(e)}: the answer may be incomplete` });
          }
        }
      } catch (e) {
        send({ type: "error", error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
