"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AgentEvent, RunKind, RunMode } from "@/lib/agent/events";
import type { Citation } from "@/lib/domain/citation";
import { streamRun } from "./run-stream";

export interface LiveStep {
  seq: number;
  tool: string;
  status: "running" | "ok" | "error";
  summary?: string;
  durationMs?: number;
  citations?: Citation[];
  input?: unknown;
  output?: unknown;
  text?: string;
}

/** The run in progress: how it runs and since when (for the live panel's header). */
export interface RunInfo {
  mode: RunMode | null;
  model: string | null;
  startedAt: number;
}

/** The last run this page watched, kept after it ends so its steps can be shown again. */
export interface FinishedRun {
  kind: RunKind;
  steps: LiveStep[];
  durationMs: number;
  mode: RunMode | null;
  model: string | null;
  error?: string;
}

interface RunState {
  running: RunKind | null;
  steps: LiveStep[];
  /** Narration being streamed right now */
  narration: string;
  info: RunInfo | null;
  lastRun: FinishedRun | null;
  start: (kind: RunKind) => void;
}

const Ctx = createContext<RunState | null>(null);
export const useAgentRun = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAgentRun outside AgentRunProvider");
  return v;
};

/**
 * Owns the live agent run for a case: starts it, folds the NDJSON event stream
 * into steps, and refreshes the server components when it ends.
 */
export function AgentRunProvider({
  caseId,
  autoStart,
  autoStartKey,
  children,
}: {
  caseId: string;
  autoStart: RunKind | null;
  /** Changes whenever there is new work of the same kind (e.g. a new reply), so a run can start again */
  autoStartKey?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [running, setRunning] = useState<RunKind | null>(null);
  const [steps, setSteps] = useState<LiveStep[]>([]);
  const [narration, setNarration] = useState("");
  const [info, setInfo] = useState<RunInfo | null>(null);
  const [lastRun, setLastRun] = useState<FinishedRun | null>(null);
  const startedFor = useRef<string | null>(null);
  const said = useRef("");
  // Synchronous guard: two start() calls in the same tick (auto-start plus a click) must not start two runs.
  const busy = useRef(false);
  // Source of truth for the live steps (state mirrors it for rendering), so the end-of-run snapshot is never stale.
  const stepsRef = useRef<LiveStep[]>([]);
  const finished = useRef<{ durationMs: number; error?: string } | null>(null);
  const infoRef = useRef<RunInfo | null>(null);
  const setLiveSteps = useCallback((next: LiveStep[]) => {
    stepsRef.current = next;
    setSteps(next);
  }, []);

  const apply = useCallback((e: AgentEvent) => {
    switch (e.type) {
      case "run_started":
        infoRef.current = { mode: e.mode, model: e.model, startedAt: infoRef.current?.startedAt ?? Date.now() };
        setInfo(infoRef.current);
        break;
      case "text":
        said.current += e.delta;
        setNarration(said.current);
        break;
      case "step_started": {
        const text = said.current.trim();
        said.current = "";
        setNarration("");
        setLiveSteps([
          ...stepsRef.current,
          ...(text ? [{ seq: e.seq - 0.5, tool: "message", status: "ok" as const, text }] : []),
          { seq: e.seq, tool: e.tool, status: "running", input: e.input },
        ]);
        break;
      }
      case "step_finished":
        setLiveSteps(stepsRef.current.map((x) => (x.seq === e.seq ? { ...x, status: e.status, summary: e.summary, durationMs: e.durationMs, citations: e.citations, output: e.output } : x)));
        break;
      case "status":
        toast(`Status: ${e.to.replace(/_/g, " ")}`, { description: e.reason });
        break;
      case "run_finished":
        finished.current = { durationMs: e.durationMs, error: e.status === "failed" ? e.error : undefined };
        if (e.status === "failed") {
          // Another tab or person already has Kelvin working on this case: not a failure of this page.
          if (/already working on this case/i.test(e.error ?? "")) toast.info("Kelvin is already working on this case", { description: "The page updates when it finishes." });
          else toast.error("Analysis stopped", { description: e.error });
        }
        break;
    }
  }, [setLiveSteps]);

  const start = useCallback(
    (kind: RunKind) => {
      if (busy.current) return;
      busy.current = true;
      const startedAt = Date.now();
      infoRef.current = { mode: null, model: null, startedAt };
      finished.current = null;
      setInfo(infoRef.current);
      setRunning(kind);
      setLiveSteps([]);
      setNarration("");
      said.current = "";
      void (async () => {
        try {
          for await (const e of streamRun(caseId, kind)) apply(e);
        } catch (err) {
          finished.current = { durationMs: Date.now() - startedAt, error: err instanceof Error ? err.message : String(err) };
          toast.error("Analysis failed", { description: finished.current.error });
        } finally {
          const done = finished.current ?? { durationMs: Date.now() - startedAt };
          const shown = stepsRef.current.filter((s) => s.status !== "running");
          if (shown.length || done.error) {
            setLastRun({ kind, steps: shown, durationMs: done.durationMs, mode: infoRef.current?.mode ?? null, model: infoRef.current?.model ?? null, error: done.error });
          }
          busy.current = false;
          setRunning(null);
          setInfo(null);
          setLiveSteps([]);
          setNarration("");
          router.refresh();
        }
      })();
    },
    [apply, caseId, router, setLiveSteps],
  );

  useEffect(() => {
    const key = `${caseId}:${autoStart}:${autoStartKey ?? ""}`;
    if (autoStart && startedFor.current !== key) {
      startedFor.current = key;
      start(autoStart);
    }
  }, [autoStart, autoStartKey, caseId, start]);

  const value = useMemo(() => ({ running, steps, narration, info, lastRun, start }), [running, steps, narration, info, lastRun, start]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
