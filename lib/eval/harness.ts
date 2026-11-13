import "server-only";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DB } from "@/lib/db/client";
import { and } from "drizzle-orm";
import { cases, drafts, evalResults, evalRuns } from "@/lib/db/schema";
import { getPersona } from "@/lib/domain/personas";
import type { RecoveryRoute } from "@/lib/domain/parties";
import { validateLetter } from "@/lib/agent/letters";
import { runAgent } from "@/lib/agent/orchestrator";
import { getModel } from "@/lib/agent/provider";
import { recordApproval, recordQaDecision } from "@/lib/case/gates";
import { deliverDueReplies } from "@/lib/counterparties/scripted";
import { getRecord } from "@/lib/case/record";
import { endOfDayPlus } from "@/lib/rules/deadlines";
import { EVAL_CASES, type EvalCase } from "@/seed/cases/eval";
import { seedCases } from "@/seed/seed-db";
import { deliveryInstant } from "@/seed/time";

/**
 * Evaluation harness: runs the full agent workflow on every evaluation case and
 * scores it against the hand-written answer keys. Cases are anchored to a fixed
 * date so results are comparable between runs.
 */

export const EVAL_NOW = new Date("2026-11-09T10:00:00Z");

export interface EvalActual {
  route: RecoveryRoute | null;
  claim: boolean;
  custody: string | null;
  notices: RecoveryRoute[];
  deadlines: Record<string, string>;
  finalStatus: string;
  claimAmountEur: number | null;
  /** The quality agent's verdict (null when no assessment ran) */
  qaAgent: string | null;
  appeals: number;
  errors: string[];
}

export interface EvalCaseResult {
  caseId: string;
  title: string;
  tests: string;
  key: EvalCase["key"] & { deadlines: Record<string, string> };
  actual: EvalActual;
  checks: { route: boolean; claim: boolean; custody: boolean; notices: boolean; deadlines: boolean; qaAgent: boolean; amount: boolean; appeal: boolean };
  correct: boolean;
  citationCoverage: number | null;
  durationMs: number;
}

export interface EvalSummary {
  cases: number;
  correct: number;
  routeAccuracy: number;
  deadlineAccuracy: number;
  claimAccuracy: number;
  custodyAccuracy: number;
  noticeAccuracy: number;
  qaAgentAccuracy: number;
  citationCoverage: number | null;
  avgMsPerCase: number;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Expected notice dates, computed from the case facts (independent of the rules
 * engine). With no excursion there is nothing to claim, so no deadlines apply.
 */
function expectedDeadlines(c: EvalCase): Record<string, string> {
  if (!c.spec.excursions.length) return {};
  const delivered = deliveryInstant(EVAL_NOW, c.spec.deliveredDaysAgo);
  const discovered = new Date(delivered.getTime() + c.spec.discoveredAfterH * 3_600_000);
  const missing = new Set(c.spec.missing ?? []);
  const out: Record<string, string> = { montreal_notice: day(endOfDayPlus(delivered, 14)) };
  if (!missing.has("contract")) out.contract_notice = day(endOfDayPlus(delivered, c.spec.contract.noticeDays));
  if (!missing.has("policy")) out.policy_notice = day(endOfDayPlus(discovered, c.spec.policy.noticeDays));
  return out;
}

export function summarise(results: EvalCaseResult[]): EvalSummary {
  const n = results.length || 1;
  const rate = (k: keyof EvalCaseResult["checks"]) => results.filter((r) => r.checks[k]).length / n;
  const cov = results.map((r) => r.citationCoverage).filter((v): v is number => v != null);
  return {
    cases: results.length,
    correct: results.filter((r) => r.correct).length,
    routeAccuracy: rate("route"),
    deadlineAccuracy: rate("deadlines"),
    claimAccuracy: rate("claim"),
    custodyAccuracy: rate("custody"),
    noticeAccuracy: rate("notices"),
    qaAgentAccuracy: rate("qaAgent"),
    citationCoverage: cov.length ? cov.reduce((a, b) => a + b, 0) / cov.length : null,
    avgMsPerCase: results.reduce((a, r) => a + r.durationMs, 0) / n,
  };
}

async function evaluateCase(db: DB, c: EvalCase, mode: "live" | "deterministic"): Promise<EvalCaseResult> {
  const id = c.spec.id;
  const started = Date.now();
  const errors: string[] = [];
  await seedCases(db, [c.spec], EVAL_NOW);
  const run = async (kind: "investigate" | "prepare_claim" | "close" | "follow_up") => {
    const r = await runAgent({ db, caseId: id, kind, mode, now: EVAL_NOW, record: false });
    if (r.status === "failed") errors.push(`${kind}: ${r.error}`);
    return r;
  };

  await run("investigate");
  // Notices are scored as drafted while QA was still pending.
  const noticeRows = (await db.select().from(drafts).where(eq(drafts.caseId, id))).filter((d) => d.kind === "protective_notice");
  const [afterInvestigation] = await db.select().from(cases).where(eq(cases.id, id));
  // The quality agent decides clear cases itself; a human QA only decides when it is unsure.
  if (afterInvestigation.status === "awaiting_qa") {
    await recordQaDecision(db, id, { decision: c.key.qa, note: "Evaluation: decision from the answer key", actor: getPersona("elena") });
    await run(c.key.qa === "rejected" ? "prepare_claim" : "close");
  }
  if (c.key.appeal) {
    // Part-payment lifecycle: manager approves, the claim goes out, the counterparty offers less, the agent appeals once.
    const waiting = await db.select().from(drafts).where(and(eq(drafts.caseId, id), eq(drafts.status, "awaiting_approval")));
    for (const d of waiting.filter((x) => x.kind !== "info_request")) await recordApproval(db, id, { draftId: d.id, decision: "approved", actor: getPersona("tom") });
    await run("follow_up");
    await deliverDueReplies(db, id, new Date(EVAL_NOW.getTime() + 60_000));
    await run("follow_up");
  }

  const [row] = await db.select().from(cases).where(eq(cases.id, id));
  const record = await getRecord(db, id);
  const allDrafts = await db.select().from(drafts).where(eq(drafts.caseId, id));
  const claimLetter = allDrafts.find((d) => d.kind === "claim_letter");
  const actual: EvalActual = {
    route: (c.key.qa === "released" ? null : (record.ranking?.find((r) => r.recommended)?.route ?? null)) as RecoveryRoute | null,
    claim: !!claimLetter,
    custody: record.custody?.attribution?.role ?? null,
    notices: noticeRows.map((d) => d.route as RecoveryRoute).sort(),
    deadlines: Object.fromEntries((record.deadlines ?? []).filter((d) => d.kind === "notice").map((d) => [d.id, d.dueAt.slice(0, 10)])),
    finalStatus: row.status,
    claimAmountEur: claimLetter?.amountEur ?? null,
    qaAgent: record.qaAssessment?.verdict ?? null,
    appeals: record.followUp?.appeals.length ?? 0,
    errors,
  };
  const keyDeadlines = expectedDeadlines(c);
  const letters = allDrafts.filter((d) => d.kind === "claim_letter" || d.kind === "protective_notice");
  const coverage = letters.length ? letters.map((d) => validateLetter(d.body, record.citations ?? {}).coverage).reduce((a, b) => a + b, 0) / letters.length : null;
  const checks = {
    route: actual.route === c.key.route,
    claim: actual.claim === c.key.claim,
    custody: actual.custody === c.key.custody,
    notices: JSON.stringify(actual.notices) === JSON.stringify([...c.key.notices].sort()),
    // No excursion means no assessment: nothing to check.
    qaAgent: !c.spec.excursions.length ? actual.qaAgent === null : actual.qaAgent === (c.key.qaAgent ?? (c.key.qa === "released" ? "usable" : "damaged")),
    amount: c.key.claimEur == null || actual.claimAmountEur === c.key.claimEur,
    appeal: !c.key.appeal || (actual.appeals === 1 && allDrafts.some((d) => d.kind === "reply" && d.status === "awaiting_approval" && (record.followUp?.appeals ?? []).some((a) => a.draftId === d.id))),
    deadlines: Object.entries(keyDeadlines).every(([k, v]) => actual.deadlines[k] === v) && Object.keys(actual.deadlines).length === Object.keys(keyDeadlines).length,
  };
  return {
    caseId: id,
    title: c.spec.title,
    tests: c.key.tests,
    key: { ...c.key, deadlines: keyDeadlines },
    actual,
    checks,
    correct: Object.values(checks).every(Boolean),
    citationCoverage: coverage,
    durationMs: Date.now() - started,
  };
}

export type EvalEvent =
  | { type: "started"; runId: string; total: number; mode: string; model: string | null }
  | { type: "case"; index: number; result: EvalCaseResult }
  | { type: "done"; runId: string; summary: EvalSummary }
  | { type: "error"; error: string };

export async function runEvaluation(
  db: DB,
  opts: { mode?: "live" | "deterministic"; limit?: number; onEvent?: (e: EvalEvent) => void } = {},
): Promise<{ runId: string; summary: EvalSummary; results: EvalCaseResult[] }> {
  const handle = opts.mode === "deterministic" ? null : await getModel();
  const mode = handle ? "live" : "deterministic";
  const list = EVAL_CASES.slice(0, opts.limit ?? EVAL_CASES.length);
  const runId = `eval-${nanoid(8)}`;
  await db.insert(evalRuns).values({ id: runId, mode, model: handle?.id ?? null, status: "running", total: list.length });
  opts.onEvent?.({ type: "started", runId, total: list.length, mode, model: handle?.id ?? null });

  const results: EvalCaseResult[] = [];
  try {
    for (const [i, c] of list.entries()) {
      const r = await evaluateCase(db, c, mode);
      results.push(r);
      await db.insert(evalResults).values({
        runId,
        caseId: r.caseId,
        title: r.title,
        tests: r.tests,
        key: r.key as unknown as Record<string, unknown>,
        actual: r.actual as unknown as Record<string, unknown>,
        checks: r.checks,
        correct: r.correct,
        citationCoverage: r.citationCoverage,
        durationMs: r.durationMs,
      });
      opts.onEvent?.({ type: "case", index: i, result: r });
    }
    const summary = summarise(results);
    await db.update(evalRuns).set({ status: "completed", summary: summary as unknown as Record<string, unknown>, finishedAt: new Date() }).where(eq(evalRuns.id, runId));
    opts.onEvent?.({ type: "done", runId, summary });
    return { runId, summary, results };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.update(evalRuns).set({ status: "failed", summary: { error }, finishedAt: new Date() }).where(eq(evalRuns.id, runId));
    opts.onEvent?.({ type: "error", error });
    throw e;
  }
}
