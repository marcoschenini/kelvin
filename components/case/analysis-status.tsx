"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { RunKind } from "@/lib/agent/events";
import { cn } from "@/lib/utils";
import { useAgentRun } from "@/components/agent/agent-run-context";

const RUN_COPY: Record<RunKind, string> = {
  investigate: "Reviewing the logger, shipping documents, contract and policy.",
  prepare_claim: "Preparing the claim and the evidence pack.",
  close: "Closing the case and recording the outcome.",
  follow_up: "Processing correspondence with the counterparty.",
};

/**
 * Compact status line while an analysis runs: a sentence and a thin progress bar.
 * No step or tool names here; they live under "Analysis details & audit trail".
 */
export function AnalysisStatus({ className }: { className?: string }) {
  const { running, steps } = useAgentRun();
  if (!running) return null;
  const done = steps.filter((s) => s.tool !== "message" && s.status !== "running").length;
  // Asymptotic: moves with every finished step, never claims to be complete before it is.
  const pct = Math.round(Math.min(0.94, Math.max(0.06, 1 - Math.exp(-done / 5))) * 100);
  return (
    <div role="status" aria-live="polite" className={cn("rounded-xl border border-border bg-card px-5 py-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-semibold text-foreground">Analysis in progress…</span>
        <span className="text-xs text-muted-foreground">{RUN_COPY[running]}</span>
      </div>
      <div
        className="mt-3 h-[3px] overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Analysis progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full rounded-full bg-ai transition-[width] duration-200 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
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
