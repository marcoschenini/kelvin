"use client";

import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import { OpenableCitation } from "@/components/documents/citation-viewer";
import { RatelBadge } from "@/components/mascot/ratel-badge";
import { Button } from "@/components/ui/button";
import type { ChatEvent, ChatTurn } from "@/lib/chat/events";
import { CHAT_TOOL_LABEL } from "@/lib/chat/suggestions";
import type { Citation } from "@/lib/domain/citation";
import { cn } from "@/lib/utils";

interface Message extends ChatTurn {
  citations?: Record<string, Citation>;
  /** Built-in answer used because the AI was unavailable (reason) */
  fallback?: string;
  mode?: "ai" | "rules";
  pending?: boolean;
  status?: string;
  error?: string;
}

async function* streamChat(endpoint: string, messages: ChatTurn[], signal: AbortSignal): AsyncGenerator<ChatEvent> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal,
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as ChatEvent;
    }
  }
}

/** **bold** and [S7] citation chips inside one line of an answer (some models write 【S7】: same thing). */
function Inline({ text, citations }: { text: string; citations?: Record<string, Citation> }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|[[【]S\d+[\]】])/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>;
        if (/^\*[^*\s][^*]*\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
        const m = /^[[【](S\d+)[\]】]$/.exec(p);
        if (m) {
          const c = citations?.[m[1]];
          // Unknown or not yet loaded ids are hidden rather than shown as raw markers.
          return c ? <OpenableCitation key={i} citation={c} className="mx-0.5 align-baseline" /> : null;
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

/** Paragraphs and "- " bullet lists, the small markdown subset the answers use. */
function AnswerText({ text, citations }: { text: string; citations?: Record<string, Citation> }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    const bullet = /^\s*[-*•]\s+/.test(line);
    const last = blocks[blocks.length - 1];
    if (bullet && last?.list) last.lines.push(line.replace(/^\s*[-*•]\s+/, ""));
    else blocks.push({ list: bullet, lines: [bullet ? line.replace(/^\s*[-*•]\s+/, "") : line] });
  }
  return (
    <div className="flex flex-col gap-2 text-[13.5px] leading-relaxed text-foreground/90">
      {blocks.map((b, i) =>
        b.list ? (
          <ul key={i} className="flex list-disc flex-col gap-1 pl-5 marker:text-subtle">
            {b.lines.map((l, j) => (
              <li key={j}>
                <Inline text={l} citations={citations} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Inline text={b.lines[0]} citations={citations} />
          </p>
        ),
      )}
    </div>
  );
}

export function Chips({ items, onPick, disabled, className }: { items: string[]; onPick: (q: string) => void; disabled?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((q) => (
        <button
          key={q}
          type="button"
          disabled={disabled}
          onClick={() => onPick(q)}
          className="rounded-full border border-border bg-background px-3 py-1 text-left text-xs text-foreground/80 hover:border-foreground/30 hover:bg-muted disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {q}
        </button>
      ))}
    </div>
  );
}

/**
 * One "Ask Kelvin" conversation: suggested questions, the streamed answers with source
 * chips, and the question box. Used by the case panel and by the Ask Kelvin page.
 * Unmounting it (closing the panel, switching case) stops an answer still streaming.
 */
export function Conversation({
  endpoint,
  chips,
  intro,
  placeholder,
  onBusyChange,
  className,
  autoFocus = true,
}: {
  endpoint: string;
  chips: string[];
  intro: ReactNode;
  placeholder: string;
  onBusyChange?: (busy: boolean) => void;
  className?: string;
  autoFocus?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  // Screen readers hear each answer once, when it is complete (not every streamed word).
  const last = messages[messages.length - 1];
  const announce = busy
    ? "Kelvin is answering…"
    : last?.role === "assistant"
      ? last.error
        ? `Could not answer: ${last.error}`
        : last.content.replace(/\*+|[[【]S\d+[\]】]/g, "")
      : "";

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [messages]);

  useEffect(() => () => abort.current?.abort(), []);

  const update = (fn: (m: Message) => Message) => setMessages((all) => [...all.slice(0, -1), fn(all[all.length - 1])]);

  async function send(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setBusy(true);
    onBusyChange?.(true);
    // Earlier answers are trimmed (the server trims too), so a long one never blocks later questions.
    const history: ChatTurn[] = [
      ...messages.filter((m) => !m.error && m.content).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })),
      { role: "user", content: q },
    ];
    setMessages((all) => [...all, { role: "user", content: q }, { role: "assistant", content: "", pending: true }]);
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      for await (const e of streamChat(endpoint, history.slice(-12), ctrl.signal)) {
        if (e.type === "text") update((m) => ({ ...m, content: m.content + e.delta, status: undefined }));
        else if (e.type === "tool") update((m) => ({ ...m, status: CHAT_TOOL_LABEL[e.name] ?? "Reading the case" }));
        else if (e.type === "citations") update((m) => ({ ...m, citations: e.items }));
        else if (e.type === "done") update((m) => ({ ...m, mode: e.mode, fallback: e.fallback }));
        else if (e.type === "error") update((m) => ({ ...m, error: e.error }));
      }
    } catch (err) {
      if (!ctrl.signal.aborted) update((m) => ({ ...m, error: err instanceof Error ? err.message : String(err) }));
    } finally {
      update((m) => ({ ...m, pending: false, status: undefined }));
      setBusy(false);
      onBusyChange?.(false);
      if (!ctrl.signal.aborted) inputRef.current?.focus();
    }
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </p>
      <div ref={scrollRef} className="min-h-40 flex-1 overflow-y-auto px-5 py-4" aria-busy={busy}>
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3">
            {intro}
            <Chips items={chips} onPick={send} disabled={busy} />
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <li key={i} className="ml-10 self-end rounded-xl bg-muted px-3.5 py-2 text-[13.5px]">
                  {m.content}
                </li>
              ) : (
                <li key={i} className="flex gap-2.5">
                  <RatelBadge size={26} state={m.pending ? "think" : "idle"} className="mt-0.5" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    {m.content ? <AnswerText text={m.content} citations={m.citations} /> : null}
                    {m.pending && !m.content && (
                      <p className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                        {m.status ?? "Thinking…"}
                      </p>
                    )}
                    {m.error && <p className="text-xs text-danger-fg">Could not answer: {m.error}</p>}
                    {m.fallback && <p className="text-[11px] text-subtle">Built-in answer: {m.fallback}.</p>}
                    {!m.pending && !m.error && m.mode && <p className="text-[11px] text-subtle">{m.mode === "ai" ? "AI answer · check the sources" : "Built-in answer"}</p>}
                  </div>
                </li>
              ),
            )}
          </ol>
        )}
        {messages.length > 0 && !busy && <Chips items={chips.slice(0, 4)} onPick={send} disabled={busy} className="mt-4" />}
      </div>

      <form
        className="flex items-end gap-2 border-t border-border px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          Your question
        </label>
        <textarea
          id={`${id}-q`}
          ref={inputRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Not while composing (IME): Enter there confirms the characters, it doesn't send.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder={placeholder}
          maxLength={2000}
          className="max-h-32 min-h-9 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-[13.5px] outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send question">
          {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
        </Button>
      </form>
    </div>
  );
}
