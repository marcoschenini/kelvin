"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Check, Loader2, Play, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AgentEvent, RunKind } from "@/lib/agent/events";
import { formatMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { streamRun } from "./run-stream";

interface LiveStep {
  seq: number;
  tool: string;
  status: "running" | "ok" | "error";
  summary?: string;
  durationMs?: number;
}

/**
 * Minimal live runner (milestone 3). Milestone 4 replaces the list with the
 * full agent panel; the streaming contract stays the same.
 */
export function AgentRunner({ caseId, kind, label, autoStart = false }: { caseId: string; kind: RunKind; label: string; autoStart?: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<LiveStep[]>([]);
  const [text, setText] = useState("");
  const started = useRef(false);

  async function start() {
    if (running) return;
    setRunning(true);
    setSteps([]);
    setText("");
    try {
      for await (const e of streamRun(caseId, kind)) apply(e);
    } catch (err) {
      toast.error("Agent run failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setRunning(false);
      router.refresh();
    }
  }

  function apply(e: AgentEvent) {
    if (e.type === "step_started") setSteps((s) => [...s, { seq: e.seq, tool: e.tool, status: "running" }]);
    else if (e.type === "step_finished")
      setSteps((s) => s.map((x) => (x.seq === e.seq ? { ...x, status: e.status, summary: e.summary, durationMs: e.durationMs } : x)));
    else if (e.type === "text") setText((t) => (t + e.delta).slice(-600));
    else if (e.type === "run_finished") {
      if (e.status === "failed") toast.error("Agent stopped", { description: e.error });
      else toast.success("Agent finished", { description: `Case is now ${e.finalStatus?.replace(/_/g, " ")}` });
    }
  }

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Button variant="ai" onClick={start} disabled={running}>
          {running ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Play data-icon="inline-start" />}
          {running ? "Agent working…" : label}
        </Button>
      </div>
      {running && text && <p className="text-sm text-muted-foreground italic">{text.trim().split("\n").slice(-1)[0]}</p>}
      <ol className="flex flex-col gap-1.5">
        <AnimatePresence initial={false}>
          {steps.map((s) => (
            <motion.li
              key={s.seq}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
              className="flex items-start gap-2.5 text-sm"
            >
              <span
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full",
                  s.status === "running" ? "text-ai-fg" : s.status === "ok" ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                )}
              >
                {s.status === "running" ? <Loader2 className="size-3.5 animate-spin" /> : s.status === "ok" ? <Check className="size-3" /> : <X className="size-3" />}
              </span>
              <span className="min-w-0">
                <span className="font-mono text-xs text-muted-foreground">{s.tool}</span>
                {s.durationMs != null && <span className="num ml-2 text-xs text-subtle">{formatMs(s.durationMs)}</span>}
                {s.summary && <span className="block text-foreground/90">{s.summary}</span>}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </div>
  );
}
