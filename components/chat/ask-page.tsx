"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";
import { Conversation, type AnswerOutcome } from "@/components/chat/conversation";
import { CitationViewerProvider } from "@/components/documents/citation-viewer";
import { StatusChip } from "@/components/kit/status-chip";
import { RatelBadge } from "@/components/mascot/ratel-badge";
import { RatelStage, type RatelStageHandle } from "@/components/mascot/ratel-stage";
import { portfolioSuggestions, suggestions } from "@/lib/chat/suggestions";
import type { CaseStatus } from "@/lib/domain/case-status";
import { cn } from "@/lib/utils";

export interface AskCase {
  id: string;
  code: string | null;
  ref: string;
  title: string;
  status: string;
  hasClaim: boolean;
}

const caseName = (c: AskCase) => (c.code ? `Case ${c.code}` : c.ref);

/**
 * The Ask Kelvin page: pick "All cases" or one case, then ask. Switching starts a new
 * conversation (and stops an answer still streaming). The choice is kept in the URL
 * (?case=…) so the page can be linked from a case.
 */
export function AskPage({ cases, initial, mode, model }: { cases: AskCase[]; initial: string; mode: "ai" | "rules"; model: string | null }) {
  const [selected, setSelected] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [cheer, setCheer] = useState(false);
  const stage = useRef<RatelStageHandle>(null);
  const cheerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = cases.find((c) => c.id === selected) ?? null;
  const chips = current ? suggestions(current.status, current.hasClaim) : portfolioSuggestions(cases.map((c) => c.code ?? ""));

  const onBusy = (b: boolean) => {
    setBusy(b);
    if (b) stage.current?.busy();
  };
  const onAnswer = (outcome: AnswerOutcome) => {
    stage.current?.answered(outcome);
    if (outcome === "ai" || outcome === "rules") {
      if (cheerTimer.current) clearTimeout(cheerTimer.current);
      setCheer(true);
      cheerTimer.current = setTimeout(() => setCheer(false), 1600);
    }
  };

  const pick = (id: string) => {
    setSelected(id);
    setBusy(false);
    const next = cases.find((c) => c.id === id);
    stage.current?.focus(next ? caseName(next) : "all your cases");
    const url = id === "all" ? "/ask" : `/ask?case=${encodeURIComponent(id)}`;
    window.history.replaceState(null, "", url);
  };

  const option = (id: string, active: boolean, children: React.ReactNode) => (
    <li key={id}>
      <button
        type="button"
        onClick={() => pick(id)}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          active ? "border-brand/40 bg-brand-soft" : "border-transparent hover:bg-muted",
        )}
      >
        {children}
      </button>
    </li>
  );

  return (
    <CitationViewerProvider>
      <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
        <nav aria-label="Ask about" className="flex flex-col gap-2">
          <span className="eyebrow px-1 text-subtle">Ask about</span>
          <ul className="flex flex-col gap-1">
            {option(
              "all",
              selected === "all",
              <>
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-foreground/70">
                  <Layers className="size-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">All cases</span>
                  <span className="block text-xs text-muted-foreground">What needs attention, totals, deadlines</span>
                </span>
              </>,
            )}
            {cases.map((c) =>
              option(
                c.id,
                selected === c.id,
                <>
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card font-heading text-sm font-semibold">{c.code ?? "·"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="num text-sm font-semibold">{c.ref}</span>
                      <StatusChip status={c.status as CaseStatus} />
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{c.title}</span>
                  </span>
                </>,
              ),
            )}
          </ul>
          {!cases.length && <p className="px-1 text-sm text-muted-foreground">No cases yet: load the demo from New case.</p>}
          <RatelStage ref={stage} tips={chips} className="mt-3 hidden lg:block" />
        </nav>

        <section
          aria-labelledby="ask-title"
          className="flex h-[calc(100dvh-19rem)] min-h-[32rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card"
        >
          <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
            <RatelBadge size={44} state={busy ? "think" : cheer ? "celebrate" : "idle"} />
            <div className="min-w-0 flex-1">
              <h2 id="ask-title" className="font-heading text-[1.1rem] font-semibold">
                {current ? `${caseName(current)} · ${current.ref}` : "All cases"}
              </h2>
              <p className="truncate text-xs text-muted-foreground">
                {mode === "ai" ? (
                  <>
                    AI answers · <span className="font-mono">{model}</span> · read-only
                  </>
                ) : (
                  "Built-in answers from the case files · no AI"
                )}
              </p>
            </div>
            {current && (
              <Link
                href={`/cases/${encodeURIComponent(current.id)}`}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                Open case <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            )}
          </header>

          <Conversation
            key={selected}
            endpoint={current ? `/api/cases/${encodeURIComponent(current.id)}/chat` : "/api/chat"}
            chips={chips}
            onBusyChange={onBusy}
            onAnswer={onAnswer}
            autoFocus={false}
            placeholder={current ? `Ask anything about ${caseName(current)}…` : "Ask across all cases, or about one: “why does case B go to the insurer?”"}
            intro={
              <div className="flex flex-col items-center gap-4 py-4 text-center sm:flex-row sm:items-end sm:text-left">
                {/* On large screens Ratel lives on his stage (left column); here only on small ones */}
                <RatelBadge variant="full" size={150} state={busy ? "think" : "idle"} className="lg:hidden" />
                <div className="flex max-w-md flex-col gap-1.5 pb-2">
                  <p className="font-heading text-lg font-semibold">Hi, I&apos;m Ratel, Kelvin&apos;s claims assistant.</p>
                  <p className="text-[13.5px] text-muted-foreground">
                    {current
                      ? `Ask me about ${caseName(current)}: who pays and why, deadlines, who held the cargo, quality, or what would change with different facts. Every number comes from the case file and Kelvin's rules.`
                      : "Ask me across all cases (what needs attention, what is at stake, deadlines) or about one case by name. I explain and simulate; people approve and send."}
                  </p>
                </div>
              </div>
            }
          />
        </section>
      </div>
    </CitationViewerProvider>
  );
}
