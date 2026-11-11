"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AgentEvent, RunKind } from "@/lib/agent/events";
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

interface RunState {
  running: RunKind | null;
  steps: LiveStep[];
  /** Narration being streamed right now */
  narration: string;
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
export function AgentRunProvider({ caseId, autoStart, children }: { caseId: string; autoStart: RunKind | null; children: React.ReactNode }) {
  const router = useRouter();
  const [running, setRunning] = useState<RunKind | null>(null);
  const [steps, setSteps] = useState<LiveStep[]>([]);
  const [narration, setNarration] = useState("");
  const startedFor = useRef<string | null>(null);
  const said = useRef("");

  const apply = useCallback((e: AgentEvent) => {
    switch (e.type) {
      case "text":
        said.current += e.delta;
        setNarration(said.current);
        break;
      case "step_started": {
        const text = said.current.trim();
        said.current = "";
        setNarration("");
        setSteps((s) => [
          ...s,
          ...(text ? [{ seq: e.seq - 0.5, tool: "message", status: "ok" as const, text }] : []),
          { seq: e.seq, tool: e.tool, status: "running", input: e.input },
        ]);
        break;
      }
      case "step_finished":
        setSteps((s) => s.map((x) => (x.seq === e.seq ? { ...x, status: e.status, summary: e.summary, durationMs: e.durationMs, citations: e.citations, output: e.output } : x)));
        break;
      case "status":
        toast(`Status: ${e.to.replace(/_/g, " ")}`, { description: e.reason });
        break;
      case "run_finished":
        if (e.status === "failed") toast.error("Agent stopped", { description: e.error });
        break;
    }
  }, []);

  const start = useCallback(
    (kind: RunKind) => {
      if (running) return;
      setRunning(kind);
      setSteps([]);
      setNarration("");
      said.current = "";
      void (async () => {
        try {
          for await (const e of streamRun(caseId, kind)) apply(e);
        } catch (err) {
          toast.error("Agent run failed", { description: err instanceof Error ? err.message : String(err) });
        } finally {
          setRunning(null);
          setSteps([]);
          setNarration("");
          router.refresh();
        }
      })();
    },
    [apply, caseId, router, running],
  );

  useEffect(() => {
    const key = `${caseId}:${autoStart}`;
    if (autoStart && startedFor.current !== key) {
      startedFor.current = key;
      start(autoStart);
    }
  }, [autoStart, caseId, start]);

  const value = useMemo(() => ({ running, steps, narration, start }), [running, steps, narration, start]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
