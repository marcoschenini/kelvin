import "server-only";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { stepCountIs, streamText, tool, type ToolSet } from "ai";
import type { DB } from "@/lib/db/client";
import { agentRuns, agentSteps, cases, decisions, drafts, outboxMessages } from "@/lib/db/schema";
import type { CaseStatus } from "@/lib/domain/case-status";
import { getRecord, patchRecord } from "@/lib/case/record";
import { transition } from "@/lib/case/status-machine";
import { loadRules } from "@/lib/rules/load";
import { getCaseRow, qaStatus } from "./assess";
import { findDocuments } from "./docs";
import type { AgentEvent, RunKind, RunMode } from "./events";
import { SYSTEM_PROMPT, runPrompt } from "./prompts";
import { getModel } from "./provider";
import { createRecorder } from "./recorder";
import { runScript } from "./script";
import { executeTool, type AgentContext } from "./tool";
import { TOOLS_FOR_RUN, getTool } from "./tools";
import { reminderState } from "./tools/followup";

const AGENT = { type: "agent" as const, name: "Kelvin agent" };
const MAX_STEPS = 32;

export interface RunOptions {
  db: DB;
  caseId: string;
  kind: RunKind;
  /** Force a mode; default: live when a model key is configured, else deterministic */
  mode?: Exclude<RunMode, "replay">;
  now?: Date;
  onEvent?: (e: AgentEvent) => void;
  /** Write a recording (default true) */
  record?: boolean;
}

export interface RunResult {
  runId: string;
  status: "completed" | "failed";
  mode: RunMode;
  finalStatus: CaseStatus;
  error?: string;
}

/** Status moves before a run starts (enforced in code). */
async function preRun(db: DB, caseId: string, kind: RunKind, runId: string, emit: (e: AgentEvent) => void) {
  const row = await getCaseRow(db, caseId);
  const qa = await qaStatus(db, caseId);
  const guard: Record<RunKind, () => void> = {
    investigate: () => {
      if (!["new", "investigating", "awaiting_qa"].includes(row.status)) throw new Error(`Cannot investigate a case that is ${row.status}.`);
    },
    prepare_claim: () => {
      if (qa.status !== "rejected") throw new Error("A claim can only be prepared after QA rejects the batch.");
      if (!["investigating", "awaiting_qa", "claim_prepared"].includes(row.status)) throw new Error(`Cannot prepare a claim when the case is ${row.status}.`);
    },
    close: () => {
      if (row.status !== "no_claim") throw new Error(`Only a no-claim case can be closed (case is ${row.status}).`);
    },
    follow_up: () => {
      if (!["awaiting_approval", "sent", "in_negotiation", "investigating", "awaiting_qa"].includes(row.status)) throw new Error(`Nothing to follow up on a case that is ${row.status}.`);
    },
  };
  guard[kind]();
  if (kind === "investigate" && row.status === "new") {
    const tr = await transition(db, caseId, "investigating", AGENT, { reason: "Agent started the investigation", runId });
    emit({ type: "status", ...tr, reason: "Investigation started" });
  }
}

/** Status moves after a run, derived from the case record (the model cannot skip a gate). */
async function postRun(db: DB, caseId: string, kind: RunKind, runId: string, emit: (e: AgentEvent) => void, ctx: AgentContext) {
  const row = await getCaseRow(db, caseId);
  const record = await getRecord(db, caseId);
  const move = async (to: CaseStatus, reason: string, patch?: Partial<typeof cases.$inferInsert>) => {
    const tr = await transition(db, caseId, to, AGENT, { reason, runId, patch });
    emit({ type: "status", ...tr, reason });
  };
  if (kind === "investigate" && row.status === "investigating") {
    if (record.excursions && record.excursions.length === 0) {
      await move("no_claim", "No temperature excursion in the logger data");
      await move("closed_no_claim", "No excursion recorded: nothing to claim", { closedReason: "All logger readings within 2–8 °C." });
    } else if (record.excursions?.length) {
      // The quality agent always decides: if the model skipped assess_quality, the orchestrator runs it.
      if (!record.qaAssessment && (await qaStatus(db, caseId)).status === "pending") {
        const r = await executeTool(getTool("assess_quality"), {}, ctx);
        if (!r.ok) throw new Error(`Quality assessment failed: ${r.error}`);
      }
    }
  }
  if (kind === "prepare_claim" && record.claim) {
    const [letter] = await db.select().from(drafts).where(eq(drafts.id, record.claim.draftId));
    if (letter && letter.status === "draft" && record.claim.evidencePackId) {
      if (row.status === "awaiting_qa" || row.status === "investigating") await move("claim_prepared", "Claim letter and evidence pack prepared");
      await db.update(drafts).set({ status: "awaiting_approval" }).where(eq(drafts.id, letter.id));
      // The secondary claim letter(s) of the claim plan wait for approval together with the primary.
      await db.update(drafts).set({ status: "awaiting_approval" }).where(and(eq(drafts.caseId, caseId), eq(drafts.kind, "claim_letter"), eq(drafts.status, "draft")));
      await move("awaiting_approval", "Waiting for manager approval");
    }
  }
  if (kind === "close" && row.status === "no_claim") {
    const qa = await qaStatus(db, caseId);
    const ex = record.excursions?.[0];
    const reason = `QA released the product${qa.by ? ` (${qa.by})` : ""}${ex ? ` after an excursion to ${ex.peakC.toFixed(1)} °C for ${ex.minutes} min` : ""}. No damage, so nothing is recoverable on any route.`;
    await patchRecord(db, caseId, { closingNote: reason });
    await move("closed_no_claim", reason, { closedReason: reason });
  }
}

export class RunInProgressError extends Error {}

export async function runAgent(opts: RunOptions): Promise<RunResult> {
  const { db, caseId, kind } = opts;
  // One run per case at a time (stale "running" rows older than 10 minutes are ignored).
  const active = await db
    .select({ id: agentRuns.id, startedAt: agentRuns.startedAt })
    .from(agentRuns)
    .where(and(eq(agentRuns.caseId, caseId), eq(agentRuns.status, "running")));
  if (active.some((r) => Date.now() - r.startedAt.getTime() < 10 * 60_000)) {
    throw new RunInProgressError("The agent is already working on this case.");
  }
  const handle = opts.mode === "deterministic" ? null : await getModel();
  const mode: RunMode = handle ? "live" : "deterministic";
  const runId = `run-${nanoid(10)}`;
  const rules = await loadRules(db);
  const recorder = createRecorder({ caseId, kind, mode, model: handle?.id ?? null });
  const started = Date.now();
  let seq = 0;

  // Narration between tool calls is buffered and stored as a "message" step.
  let narration = "";
  const flushNarration = async () => {
    const text = narration.trim();
    narration = "";
    if (!text) return;
    await db.insert(agentSteps).values({ id: nanoid(12), runId, caseId, seq: ++seq, tool: "message", summary: text, status: "ok", durationMs: 0 });
  };
  const emit = (e: AgentEvent) => {
    recorder.push(e);
    opts.onEvent?.(e);
  };

  await db.insert(agentRuns).values({ id: runId, caseId, kind, mode, model: handle?.id ?? null, status: "running" });
  emit({ type: "run_started", runId, caseId, kind, mode, model: handle?.id ?? null, at: new Date().toISOString() });

  const ctx: AgentContext = {
    db,
    caseId,
    runId,
    kind,
    mode,
    model: handle?.id ?? null,
    now: opts.now ?? new Date(),
    rules,
    emit: (e) => emit(e),
    nextSeq: () => ++seq,
    beforeStep: () => flushNarration(),
  };
  const say = (text: string) => {
    narration += `${text} `;
    emit({ type: "text", delta: `${text}\n` });
  };

  let status: RunResult["status"] = "completed";
  let error: string | undefined;
  const runPhase = async (phase: RunKind) => {
    const pctx: AgentContext = { ...ctx, kind: phase };
    await preRun(db, caseId, phase, runId, emit);
    if (handle) {
      const row = await getCaseRow(db, caseId);
      const docs = await findDocuments(db, caseId);
      const qa = await qaStatus(db, caseId);
      const pending: string[] = [];
      if (phase === "prepare_claim") {
        const rejected = await db
          .select()
          .from(decisions)
          .where(and(eq(decisions.caseId, caseId), eq(decisions.gate, "approval"), eq(decisions.decision, "rejected")));
        rejected.forEach((r) => pending.push(`- The manager rejected a previous draft: "${r.note}". Address this in the new letter (write the body yourself, citing sources).`));
        const plan = (await getRecord(db, caseId)).claimPlan ?? [];
        plan.filter((p) => p.role === "secondary").forEach((p) => pending.push(`- The claim plan has a secondary claim against the ${p.route} for the uninsured part: draft it too (draft_claim_letter with route "${p.route}").`));
      }
      if (phase === "follow_up") {
        const approved = await db.select().from(drafts).where(and(eq(drafts.caseId, caseId), eq(drafts.status, "approved")));
        approved.forEach((d) => pending.push(`- Approved draft ${d.id} (${d.kind}) to ${d.recipientName}: send it.`));
        const record = await getRecord(db, caseId);
        const handled = new Set(record.handledMessageIds ?? []);
        const replies = await db.select().from(outboxMessages).where(and(eq(outboxMessages.caseId, caseId), eq(outboxMessages.direction, "in")));
        replies.filter((m) => !handled.has(m.id)).forEach((m) => pending.push(`- New reply ${m.id} from ${m.counterparty}: "${m.subject}". Handle it.`));
        const st = await reminderState(pctx);
        if (st?.due.length) pending.push(`- No reply to the claim after ${Math.max(...st.due)} days: draft a reminder (draft_reminder).`);
      }
      const tools: ToolSet = {};
      for (const name of TOOLS_FOR_RUN[phase]) {
        const t = getTool(name);
        tools[name] = tool({
          description: t.description,
          inputSchema: t.input,
          execute: async (input: unknown) => {
            const r = await executeTool(t, input, pctx);
            return r.ok
              ? { summary: r.summary, result: r.output, citations: r.citations.map((c) => ({ id: c.id, label: c.label })) }
              : { error: r.error };
          },
        });
      }
      const result = streamText({
        model: handle.model,
        system: SYSTEM_PROMPT,
        prompt: runPrompt(phase, row, docs, { qa: qa.status, now: ctx.now, pending }),
        tools,
        stopWhen: stepCountIs(MAX_STEPS),
        providerOptions: handle.providerOptions as never,
        maxRetries: 2,
      });
      for await (const part of result.fullStream) {
        if (part.type === "text-delta") {
          const delta = (part as { text?: string; delta?: string }).text ?? (part as { delta?: string }).delta ?? "";
          narration += delta;
          emit({ type: "text", delta });
        } else if (part.type === "error") {
          throw part.error instanceof Error ? part.error : new Error(String(part.error));
        }
      }
    } else {
      await runScript(phase, pctx, say);
    }
    await flushNarration();
    await postRun(db, caseId, phase, runId, emit, pctx);
  };

  try {
    await runPhase(kind);
    // The quality agent found the product damaged: the claim path continues in the same run, no human QA step.
    if (kind === "investigate") {
      const [row, record] = await Promise.all([getCaseRow(db, caseId), getRecord(db, caseId)]);
      if (row.status === "investigating" && record.qaAssessment?.verdict === "damaged") await runPhase("prepare_claim");
    }
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
    await flushNarration().catch(() => {});
  }

  const finalRow = await getCaseRow(db, caseId);
  const durationMs = Date.now() - started;
  emit({ type: "run_finished", status, durationMs, error, finalStatus: finalRow.status });
  let recordingPath: string | null = null;
  if (opts.record !== false) {
    recordingPath = await recorder.save(runId, { demo: finalRow.scenario === "demo" && status === "completed" }).catch(() => null);
  }
  await db.update(agentRuns).set({ status, error, finishedAt: new Date(), recordingPath }).where(eq(agentRuns.id, runId));
  return { runId, status, mode, finalStatus: finalRow.status, error };
}
