import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { auditEvents, cases, documents, type CaseRow } from "@/lib/db/schema";
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
