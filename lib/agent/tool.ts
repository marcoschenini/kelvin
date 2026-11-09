import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { z } from "zod";
import type { DB } from "@/lib/db/client";
import { agentSteps, auditEvents } from "@/lib/db/schema";
import type { Citation } from "@/lib/domain/citation";
import { registerCitations } from "@/lib/case/record";
import type { RulesConfig } from "@/lib/rules/config";
import type { AgentEvent, RunKind, RunMode } from "./events";

/** Everything a tool needs: database, case, clock, rules and the event sink. */
export interface AgentContext {
  db: DB;
  caseId: string;
  runId: string;
  kind: RunKind;
  mode: RunMode;
  model: string | null;
  now: Date;
  rules: RulesConfig;
  emit: (e: AgentEvent) => void;
  nextSeq: () => number;
  /** Called before each step (the orchestrator flushes narration so ordering is preserved) */
  beforeStep?: () => Promise<void>;
}

export interface ToolResult<O> {
  output: O;
  /** One human sentence shown in the agent panel */
  summary: string;
  citations?: Citation[];
}

export interface KelvinTool<S extends z.ZodType = z.ZodType, O = unknown> {
  name: string;
  description: string;
  input: S;
  run: (input: z.infer<S>, ctx: AgentContext) => Promise<ToolResult<O>>;
}

export function defineTool<S extends z.ZodType>(t: KelvinTool<S, unknown>): KelvinTool<S, unknown> {
  return t;
}

/** A tool refusing to act (guard failed) — reported to the model as an error result it can recover from. */
export class ToolGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolGuardError";
  }
}

function clip(value: unknown, max = 20_000): unknown {
  const s = JSON.stringify(value);
  if (!s || s.length <= max) return value;
  return { truncated: true, preview: s.slice(0, max) };
}

/**
 * Runs a tool with full bookkeeping: validates input, streams step events,
 * registers citations, persists the step and appends an audit event
 * (input, output, timestamp, model, duration).
 */
export async function executeTool<S extends z.ZodType, O>(
  tool: KelvinTool<S, O>,
  rawInput: unknown,
  ctx: AgentContext,
): Promise<{ ok: true; summary: string; output: O; citations: Citation[] } | { ok: false; error: string }> {
  await ctx.beforeStep?.();
  const seq = ctx.nextSeq();
  const stepId = nanoid(12);
  const started = Date.now();
  ctx.emit({ type: "step_started", seq, tool: tool.name, input: rawInput, at: new Date().toISOString() });
  await ctx.db.insert(agentSteps).values({
    id: stepId,
    runId: ctx.runId,
    caseId: ctx.caseId,
    seq,
    tool: tool.name,
    input: rawInput as object,
    status: "running",
  });

  let status: "ok" | "error" = "ok";
  let summary = "";
  let output: unknown = null;
  let citations: Citation[] = [];
  let error: string | undefined;
  try {
    const parsed = tool.input.safeParse(rawInput ?? {});
    if (!parsed.success) throw new ToolGuardError(`Invalid input: ${parsed.error.message}`);
    const res = await tool.run(parsed.data, ctx);
    citations = await registerCitations(ctx.db, ctx.caseId, res.citations ?? []);
    summary = res.summary;
    output = res.output;
  } catch (e) {
    status = "error";
    error = e instanceof Error ? e.message : String(e);
    summary = error;
  }
  const durationMs = Date.now() - started;

  await ctx.db
    .update(agentSteps)
    .set({ status, summary, output: clip(output) as object, citations, durationMs })
    .where(eq(agentSteps.id, stepId));
  await ctx.db.insert(auditEvents).values({
    caseId: ctx.caseId,
    actorType: "agent",
    actorName: "Kelvin agent",
    eventType: status === "ok" ? "tool_call" : "tool_error",
    tool: tool.name,
    input: rawInput as object,
    output: clip(status === "ok" ? { summary, output } : { error }) as object,
    model: ctx.model,
    durationMs,
    runId: ctx.runId,
  });
  ctx.emit({ type: "step_finished", seq, tool: tool.name, status, summary, output: clip(output, 6000), citations, durationMs, error });

  return status === "ok" ? { ok: true, summary, output: output as O, citations } : { ok: false, error: error! };
}
