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

/** Earlier answers can be long: keep the history usable by trimming them, not rejecting the question. */
const HISTORY_CHARS = 4000;

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(20_000),
      }),
    )
    .min(1)
    .max(24)
    .refine((m) => m.at(-1)?.role === "user", "The last message must be the user's question")
    .refine((m) => (m.at(-1)?.content.length ?? 0) <= 2000, "The question is too long (2,000 characters at most)"),
});

/**
 * Citation chips for an answer: ids written in the text that exist in the case's registry
 * and, for AI answers, that a tool actually returned (so a real source can't be pinned
 * on an invented sentence).
 */
function citedSources(ctx: ChatContext, text: string, allowed?: Set<string>): Record<string, Citation> {
  const reg = ctx.record.citations ?? {};
  const items: Record<string, Citation> = {};
  // Some models write 【S3】 (wide brackets) instead of [S3]: accept both.
  for (const m of text.matchAll(/[[【](S\d+)[\]】]/g)) if (reg[m[1]] && (!allowed || allowed.has(m[1]))) items[m[1]] = reg[m[1]];
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
  let caseCtx: ChatContext;
  try {
    caseCtx = await loadChatContext(await getDb(), id);
  } catch (e) {
    if (e instanceof Error && /not found/i.test(e.message)) return Response.json({ error: "Case not found" }, { status: 404 });
    console.error("[chat] could not load case", id, e);
    return Response.json({ error: "Kelvin could not load this case. Try again." }, { status: 500 });
  }
  const messages = parsed.data.messages.map((m) => ({ role: m.role, content: m.content.slice(0, HISTORY_CHARS) }));
  const question = messages[messages.length - 1].content;
  const enc = new TextEncoder();
  // Closing the panel (or leaving the page) stops the model, so no quota is spent on an unread answer.
  const abort = new AbortController();
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatEvent) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
        } catch {
          closed = true;
        }
      };
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
        const fromTools = new Set<string>();
        try {
          const result = streamText({
            model: llm.model,
            system: CHAT_SYSTEM,
            messages,
            tools: chatTools(caseCtx, (ids) => ids.forEach((i) => fromTools.add(i))),
            stopWhen: stepCountIs(5),
            maxRetries: 1,
            abortSignal: AbortSignal.any([abort.signal, req.signal, AbortSignal.timeout(45_000)]),
          });
          for await (const part of result.fullStream) {
            if (closed) break;
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
          if (closed) return;
          if (!written.trim()) throw new Error("empty answer");
          send({ type: "citations", items: citedSources(caseCtx, written, fromTools) });
          send({ type: "done", mode: "ai" });
        } catch (e) {
          if (closed) return;
          // Nothing shown yet: answer from the built-in answers instead, and say why.
          if (!written.trim()) builtIn(why(e));
          else {
            send({ type: "citations", items: citedSources(caseCtx, written, fromTools) });
            send({ type: "done", mode: "ai", fallback: `${why(e)}: the answer may be incomplete` });
          }
        }
      } catch (e) {
        console.error("[chat] failed", id, e);
        send({ type: "error", error: "Kelvin could not answer this question. Try again or rephrase it." });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed by the client */
          }
        }
      }
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
