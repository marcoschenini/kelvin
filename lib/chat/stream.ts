import "server-only";
import { stepCountIs, streamText, type ToolSet } from "ai";
import { z } from "zod";
import type { Citation } from "@/lib/domain/citation";
import type { Answer } from "./answers";
import type { ChatEvent, ChatTurn } from "./events";
import { getChatModel } from "./llm";

/** Earlier answers can be long: keep the history usable by trimming them, not rejecting the question. */
const HISTORY_CHARS = 4000;

export const ChatBody = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(20_000) }))
    .min(1)
    .max(24)
    .refine((m) => m.at(-1)?.role === "user", "The last message must be the user's question")
    .refine((m) => (m.at(-1)?.content.length ?? 0) <= 2000, "The question is too long (2,000 characters at most)"),
});

export function trimHistory(messages: ChatTurn[]): ChatTurn[] {
  return messages.map((m) => ({ role: m.role, content: m.content.slice(0, HISTORY_CHARS) }));
}

/**
 * Citation chips for an answer: ids written in the text ([S3], or 【S3】 as some models
 * write them) that exist in the registry and, for AI answers, that a tool returned.
 */
export function citedSources(registry: Record<string, Citation> | null, text: string, allowed?: Set<string>): Record<string, Citation> {
  const items: Record<string, Citation> = {};
  if (!registry) return items;
  for (const m of text.matchAll(/[[【](S\d+)[\]】]/g)) if (registry[m[1]] && (!allowed || allowed.has(m[1]))) items[m[1]] = registry[m[1]];
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
 * Streams one chat answer as NDJSON (ChatEvent per line). With a model key: the model
 * with read-only tools; without one, or if it fails before writing: the built-in answer.
 * Closing the panel (request aborted / stream cancelled) stops the model.
 */
export function chatResponse(opts: {
  req: Request;
  messages: ChatTurn[];
  builtIn: () => Answer;
  system: string;
  /** Builds the tools; onCited receives the citation ids each tool returned */
  tools: (onCited: (ids: string[]) => void) => ToolSet;
  /** Citation registry for chips, or null when answers carry no chips (e.g. across cases) */
  registry: Record<string, Citation> | null;
  label: string;
}): Response {
  const enc = new TextEncoder();
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
        const a = opts.builtIn();
        send({ type: "text", delta: a.text });
        send({ type: "citations", items: citedSources(opts.registry, a.text) });
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
            system: opts.system,
            messages: opts.messages,
            tools: opts.tools((ids) => ids.forEach((i) => fromTools.add(i))),
            stopWhen: stepCountIs(6),
            maxRetries: 1,
            abortSignal: AbortSignal.any([abort.signal, opts.req.signal, AbortSignal.timeout(45_000)]),
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
          send({ type: "citations", items: citedSources(opts.registry, written, fromTools) });
          send({ type: "done", mode: "ai" });
        } catch (e) {
          if (closed) return;
          // Nothing shown yet: answer from the built-in answers instead, and say why.
          if (!written.trim()) builtIn(why(e));
          else {
            send({ type: "citations", items: citedSources(opts.registry, written, fromTools) });
            send({ type: "done", mode: "ai", fallback: `${why(e)}: the answer may be incomplete` });
          }
        }
      } catch (e) {
        console.error(`[chat] ${opts.label} failed`, e);
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
