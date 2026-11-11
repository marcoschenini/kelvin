import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { agentRuns, agentSteps, auditEvents, cases, decisions, documents, drafts, outboxMessages, type CaseRow } from "@/lib/db/schema";
import { isClosed } from "@/lib/domain/case-status";
import { daysUntil } from "@/lib/format";

/** Read models for pages. Callers must `await connection()` first (Cache Components). */

export interface CaseListItem extends CaseRow {
  daysLeft: number | null;
}

function withDaysLeft(c: CaseRow, now: Date): CaseListItem {
  return { ...c, daysLeft: c.nearestDeadlineAt && !isClosed(c.status) ? daysUntil(c.nearestDeadlineAt, now) : null };
}

const SCENARIO_ORDER = { demo: 0, upload: 1, eval: 2 } as const;

export async function listCases(opts: { includeEval?: boolean } = {}): Promise<CaseListItem[]> {
  const db = await getDb();
  const rows = await db.select().from(cases).orderBy(asc(cases.code), desc(cases.createdAt));
  const now = new Date();
  return rows
    .filter((r) => opts.includeEval || r.scenario !== "eval")
    .sort((a, b) => SCENARIO_ORDER[a.scenario] - SCENARIO_ORDER[b.scenario])
    .map((r) => withDaysLeft(r, now));
}

export interface InboxKpis {
  openCases: number;
  atStakeEur: number;
  recoveredEur: number;
  deadlinesAtRisk: number;
  awaitingHuman: number;
}

export function computeKpis(items: CaseListItem[]): InboxKpis {
  const open = items.filter((c) => !isClosed(c.status));
  return {
    openCases: open.length,
    atStakeEur: open.reduce((s, c) => s + (c.valueEur ?? 0), 0),
    recoveredEur: items.reduce((s, c) => s + (c.recoveredEur ?? 0), 0),
    deadlinesAtRisk: open.filter((c) => c.daysLeft != null && c.daysLeft < 3).length,
    awaitingHuman: open.filter((c) => c.status === "awaiting_qa" || c.status === "awaiting_approval").length,
  };
}

export async function getCase(id: string): Promise<CaseListItem | null> {
  const db = await getDb();
  const [row] = await db.select().from(cases).where(eq(cases.id, id));
  return row ? withDaysLeft(row, new Date()) : null;
}

export async function listDocuments(caseId: string) {
  const db = await getDb();
  return db.select().from(documents).where(eq(documents.caseId, caseId)).orderBy(asc(documents.id));
}

export async function getDocument(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
  return row ?? null;
}

export async function listAudit(caseId: string) {
  const db = await getDb();
  return db.select().from(auditEvents).where(eq(auditEvents.caseId, caseId)).orderBy(asc(auditEvents.id));
}

export async function latestRunWithSteps(caseId: string) {
  const db = await getDb();
  const runs = await db.select().from(agentRuns).where(eq(agentRuns.caseId, caseId)).orderBy(desc(agentRuns.startedAt));
  const steps = runs.length
    ? await db.select().from(agentSteps).where(inArray(agentSteps.runId, runs.map((r) => r.id))).orderBy(asc(agentSteps.startedAt), asc(agentSteps.seq))
    : [];
  // A run counts as in progress for 10 minutes at most (a crashed run must not block the case forever).
  const busy = runs.some((r) => r.status === "running" && Date.now() - r.startedAt.getTime() < 10 * 60_000);
  return { runs, steps, busy };
}

export async function listDrafts(caseId: string) {
  const db = await getDb();
  return db.select().from(drafts).where(eq(drafts.caseId, caseId)).orderBy(asc(drafts.createdAt));
}

export async function listDecisions(caseId: string) {
  const db = await getDb();
  return db.select().from(decisions).where(eq(decisions.caseId, caseId)).orderBy(asc(decisions.at));
}

export async function listOutbox(caseId: string) {
  const db = await getDb();
  return db.select().from(outboxMessages).where(eq(outboxMessages.caseId, caseId)).orderBy(asc(outboxMessages.at));
}

/** Logger readings for the chart: [epoch ms, °C, row]. */
export async function loadReadings(caseId: string): Promise<{ t: number; c: number; row: number }[]> {
  const db = await getDb();
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.caseId, caseId), eq(documents.kind, "logger")));
  if (!doc) return [];
  const { readText } = await import("@/lib/storage");
  const csv = await readText(doc.storagePath);
  return csv
    .split(/\r?\n/)
    .filter((l) => /^\d+,/.test(l))
    .map((l) => {
      const [row, ts, c] = l.split(",");
      return { t: Date.parse(ts), c: Number(c), row: Number(row) };
    })
    .filter((r) => Number.isFinite(r.t) && Number.isFinite(r.c));
}
