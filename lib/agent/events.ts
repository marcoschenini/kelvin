import type { CaseStatus } from "@/lib/domain/case-status";
import type { Citation } from "@/lib/domain/citation";

/** Events streamed from an agent run to the UI, and recorded for Replay mode. */

export type RunKind = "investigate" | "prepare_claim" | "close" | "follow_up";
export type RunMode = "live" | "deterministic" | "replay";

export type AgentEvent =
  | { type: "run_started"; runId: string; caseId: string; kind: RunKind; mode: RunMode; model: string | null; at: string }
  | { type: "step_started"; seq: number; tool: string; input: unknown; at: string }
  | {
      type: "step_finished";
      seq: number;
      tool: string;
      status: "ok" | "error";
      summary: string;
      output: unknown;
      citations: Citation[];
      durationMs: number;
      error?: string;
    }
  /** Model narration between tool calls */
  | { type: "text"; delta: string }
  | { type: "status"; from: CaseStatus; to: CaseStatus; reason?: string }
  | { type: "run_finished"; status: "completed" | "failed"; durationMs: number; error?: string; finalStatus?: CaseStatus };

export interface Recording {
  version: 1;
  caseId: string;
  kind: RunKind;
  mode: RunMode;
  model: string | null;
  recordedAt: string;
  /** Each event with ms offset from the run start, so replay keeps the rhythm */
  events: { t: number; event: AgentEvent }[];
}
