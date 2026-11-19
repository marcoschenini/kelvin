"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CircleCheck, CircleX, ChevronDown } from "lucide-react";
import { RUN_LABEL, Step } from "@/components/agent/agent-panel";
import { useAgentRun, type FinishedRun, type LiveStep } from "@/components/agent/agent-run-context";
import { Skeleton } from "@/components/ui/skeleton";
import type { RunKind, RunMode } from "@/lib/agent/events";
import { formatMs } from "@/lib/format";
import { cn } from "@/lib/utils";

const RUN_TITLE: Record<RunKind, string> = {
  investigate: "Investigating the excursion",
  prepare_claim: "Preparing the claim",
  close: "Closing the case",
  follow_up: "Handling correspondence",
};

const RUN_COPY: Record<RunKind, string> = {
  investigate: "Logger, shipping documents, contract and policy, then the paying party.",
  prepare_claim: "Claim letters and evidence pack.",
  close: "Outcome recorded, case closed.",
  follow_up: "Approved messages out, counterparty replies in.",
};

const modeLabel = (mode: RunMode | null, model: string | null) =>
  mode === "live" ? (model ?? "live model") : mode === "deterministic" ? "deterministic planner" : mode === "replay" ? "replay" : null;

const toolSteps = (steps: LiveStep[]) => steps.filter((s) => s.tool !== "message");

/**
 * An investigation that finds the product damaged goes on to prepare the claim in the same run.
 * The claim phase starts by ranking the routes again, so a second rank_routes (or any drafting
 * of the claim) marks the switch.
 */
const CLAIM_TOOLS = new Set(["draft_claim_letter", "build_evidence_pack"]);
const phaseOf = (kind: RunKind, steps: LiveStep[]): RunKind =>
  kind === "investigate" && (steps.filter((s) => s.tool === "rank_routes").length > 1 || steps.some((s) => CLAIM_TOOLS.has(s.tool))) ? "prepare_claim" : kind;

function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The ordered step list shared by the live view and the finished-run view. */
function StepList({ steps, live, id }: { steps: LiveStep[]; live?: boolean; id?: string }) {
  return (
    <ol id={id} className={cn("ml-1 border-l pl-3", live ? "border-ai-fg/30" : "border-border")}>
      {steps.map((s) => (
        <Step key={s.seq} s={s} className={live ? "kelvin-step-in" : undefined} />
      ))}
    </ol>
  );
}

/** One line after a run, with its steps one click away (no scrolling to the audit trail). */
function FinishedSummary({ run, className }: { run: FinishedRun; className?: string }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const n = toolSteps(run.steps).length;
  const mode = modeLabel(run.mode, run.model);
  const failed = !!run.error;
  const label = phaseOf(run.kind, run.steps) !== run.kind ? "Investigation and claim" : RUN_LABEL[run.kind];
  return (
    <section aria-label="Last analysis" className={cn("rounded-xl border bg-card", failed ? "border-danger/30" : "border-border", className)}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 sm:px-6">
        {failed ? <CircleX className="size-4 shrink-0 text-danger-fg" aria-hidden="true" /> : <CircleCheck className="size-4 shrink-0 text-success-fg" aria-hidden="true" />}
        <p className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">
            {label} {failed ? "stopped" : "finished"}
          </span>
          <span className="num text-muted-foreground">
            {" "}
            · {n} {n === 1 ? "step" : "steps"} in {formatMs(run.durationMs)}
            {mode ? ` · ${mode}` : ""}
          </span>
          {failed && <span className="block text-xs text-danger-fg">{run.error}</span>}
        </p>
        {run.steps.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls={listId}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {open ? "Hide steps" : "Show steps"}
            <ChevronDown className={cn("size-3.5 transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className={cn("border-t border-border px-5 py-3 sm:px-6", !open && "hidden")}>
        <StepList steps={run.steps} id={listId} />
      </div>
    </section>
  );
}

/**
 * The agent at work, in plain view: while a run is going, every tool call appears as it
 * happens (what Kelvin read, what it found, which sources it cites). When the run ends,
 * a one-line summary stays, and the same steps can be reopened without scrolling to the
 * audit trail.
 */
export function AnalysisStatus({ className }: { className?: string }) {
  const { running, steps, narration, info, lastRun } = useAgentRun();
  const [now, setNow] = useState(() => Date.now());
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);

  // Keep the newest step in view while the list grows.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [steps.length, narration]);

  if (running) {
    const done = toolSteps(steps).filter((s) => s.status !== "running").length;
    // Asymptotic: moves with every finished step, never claims to be complete before it is.
    const pct = Math.round(Math.min(0.94, Math.max(0.04, 1 - Math.exp(-done / 7))) * 100);
    const mode = modeLabel(info?.mode ?? null, info?.model ?? null);
    const phase = phaseOf(running, steps);
    return (
      <section aria-label="Analysis in progress" className={cn("overflow-hidden rounded-xl border border-ai-fg/25 bg-card shadow-card", className)}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-ai-soft px-5 py-3.5 sm:px-6">
          <span className="relative flex size-2.5 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex size-full rounded-full bg-ai-fg/40 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2.5 rounded-full bg-ai-fg" />
          </span>
          <div className="min-w-0 flex-1">
            <p role="status" className="font-heading text-[1.05rem] font-semibold text-foreground">
              {RUN_TITLE[phase]}
            </p>
            <p className="text-xs text-muted-foreground">{RUN_COPY[phase]}</p>
          </div>
          <dl className="num flex shrink-0 items-baseline gap-4 text-xs text-muted-foreground">
            <div className="flex gap-1">
              <dt className="sr-only">Steps</dt>
              <dd>
                <span className="font-semibold text-foreground">{done}</span> {done === 1 ? "step" : "steps"}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt className="sr-only">Elapsed</dt>
              <dd className="font-semibold text-foreground">{clock(now - (info?.startedAt ?? now))}</dd>
            </div>
            {mode && (
              <div className="hidden sm:flex">
                <dt className="sr-only">Mode</dt>
                <dd>{mode}</dd>
              </div>
            )}
          </dl>
        </div>
        <div className="h-[3px] bg-muted" role="progressbar" aria-label="Analysis progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-full bg-ai-fg transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <div ref={listRef} className="max-h-[26rem] overflow-y-auto px-5 py-3 sm:px-6">
          {/* Mounted from the start, so screen readers announce the first step too. */}
          <div aria-live="polite" aria-relevant="additions">
            {steps.length === 0 && !narration.trim() && <p className="py-1.5 text-[13px] text-muted-foreground">Opening the case file…</p>}
            <StepList steps={steps} live />
          </div>
          {/* Streamed narration, word by word: shown, not announced (it is announced as a step once complete). */}
          {narration.trim() && (
            <p aria-hidden="true" className="ml-1 border-l border-ai-fg/30 py-1.5 pl-11 text-[13px] text-muted-foreground italic">
              {narration.trim()}
            </p>
          )}
        </div>
      </section>
    );
  }

  if (!lastRun) return null;
  return <FinishedSummary key={lastRun.id} run={lastRun} className={className} />;
}

/** Renders a skeleton in place of a card that the running analysis has not produced yet. */
export function PendingWhileRunning({ ready, children, className, lines = 3 }: { ready: boolean; children?: React.ReactNode; className?: string; lines?: number }) {
  const { running } = useAgentRun();
  if (ready) return <>{children}</>;
  if (!running) return <>{children}</>;
  return (
    <div className={cn("rounded-xl border border-border bg-card p-6", className)} aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-4 h-7 w-2/5" />
      <div className="mt-6 flex flex-col gap-2.5">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-3.5" style={{ width: `${88 - i * 14}%` }} />
        ))}
      </div>
    </div>
  );
}
