import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { cases } from "@/lib/db/schema";
import { citationKey, type Citation } from "@/lib/domain/citation";
import type { CustodyParty } from "@/lib/domain/parties";
import type {
  CaseOutcome,
  ClaimPlanItem,
  ContractTermsParsed,
  Deadline,
  ExtraCost,
  PolicyTermsParsed,
  QaAssessment,
  QaStatus,
  RankedRoute,
  RouteLiability,
} from "@/lib/rules/types";

/** The shared case record every tool reads from and writes to (cases.record jsonb). */

export interface ExcursionWindow {
  index: number;
  direction: "high" | "low";
  start: string;
  end: string;
  minutes: number;
  peakC: number;
  peakAt: string;
  rowStart: number;
  rowEnd: number;
  citationId: string;
}

export interface CustodySegmentRecord {
  seq: number;
  role: CustodyParty;
  custodian: string;
  location: string;
  activity: string;
  from: string;
  to: string;
  controlled: boolean;
  reference: string | null;
}

export interface ClauseRef {
  clause: string;
  title: string | null;
  page: number;
  quote: string;
  citationId: string;
}

export interface CaseRecord {
  shipment?: {
    awbNumber?: string;
    weightKg?: number;
    declaredValueEur?: number | null;
    valueEur?: number;
    valueSource?: "invoice" | "awb_customs" | "assumption";
    origin?: string;
    destination?: string;
    flight?: string;
    deliveredAt?: string;
    discoveredAt?: string;
    citations?: Record<string, string>;
  };
  logger?: {
    documentId: string;
    loggerId: string | null;
    intervalMin: number;
    rows: number;
    minC: number;
    maxC: number;
    start: string;
    end: string;
  };
  excursions?: ExcursionWindow[];
  custody?: {
    segments: CustodySegmentRecord[];
    attribution: {
      excursionIndex: number;
      role: CustodyParty;
      custodian: string;
      segmentSeq: number;
      location: string;
      activity: string;
      controlled: boolean;
      spansMultipleParties: boolean;
      citationIds: string[];
    } | null;
  };
  contract?: { terms: ContractTermsParsed; clauses: Record<string, ClauseRef>; documentId: string | null; reference: string | null };
  policy?: { terms: PolicyTermsParsed; clauses: Record<string, ClauseRef>; documentId: string | null; policyNumber: string | null };
  qa?: { status: QaStatus; by?: string; at?: string; note?: string; citationId?: string };
  /** Quality agent's assessment against the stability allowance (with reasoning) */
  qaAssessment?: QaAssessment & { by: "quality_agent"; at: string; citationId?: string };
  /** Primary claim, plus a secondary one against the party in custody when the insurer is primary */
  claimPlan?: ClaimPlanItem[];
  /** Eligible, documented extra costs added to the loss before caps */
  extraCosts?: ExtraCost[];
  /** Appeals (max one) and reminders after a claim was sent */
  followUp?: { appeals: { draftId: string; at: string }[]; remindersSent: number[]; lastReplyAt?: string | null };
  /** Result record, written on every closing transition */
  outcome?: CaseOutcome;
  liability?: RouteLiability[];
  deadlines?: Deadline[];
  ranking?: RankedRoute[];
  protectiveNotices?: { route: string; draftId: string; deadlineId: string }[];
  missing?: { item: string; why: string; requestedFrom: string }[];
  claim?: { draftId: string; route: string; amountEur: number; evidencePackId?: string };
  /** Citation registry: id → citation */
  citations?: Record<string, Citation>;
  closingNote?: string;
  /** Open settlement offer awaiting the manager (set by handle_reply) */
  negotiation?: { route: string; offerEur: number; claimEur: number; messageId: string; counterDraftId: string; counterparty: string } | null;
  /** Incoming Outbox messages already processed by handle_reply */
  handledMessageIds?: string[];
}

/** Serialises record writes per case: the model may call tools in parallel. */
const locks = new Map<string, Promise<unknown>>();
async function withLock<T>(caseId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(caseId) ?? Promise.resolve();
  const next = prev.then(fn, fn);
  locks.set(
    caseId,
    next.catch(() => {}),
  );
  return next;
}

export async function getRecord(db: DB, caseId: string): Promise<CaseRecord> {
  const [row] = await db.select({ record: cases.record }).from(cases).where(eq(cases.id, caseId));
  return (row?.record ?? {}) as CaseRecord;
}

/** Shallow-merges top-level keys of `patch` into the record. */
export async function patchRecord(db: DB, caseId: string, patch: Partial<CaseRecord>): Promise<CaseRecord> {
  return withLock(caseId, async () => {
    const current = await getRecord(db, caseId);
    const next = { ...current, ...patch };
    await db.update(cases).set({ record: next as Record<string, unknown>, updatedAt: new Date() }).where(eq(cases.id, caseId));
    return next;
  });
}

/**
 * Registers citations in the case's registry and returns them with ids (S1, S2…).
 * The same source is registered once, so ids are stable within a case.
 */
export async function registerCitations(db: DB, caseId: string, list: Citation[]): Promise<Citation[]> {
  if (!list.length) return [];
  return withLock(caseId, async () => {
    const record = await getRecord(db, caseId);
    const registry = { ...(record.citations ?? {}) };
    const byKey = new Map(Object.values(registry).map((c) => [citationKey(c), c]));
    let n = Object.keys(registry).length;
    const out = list.map((c) => {
      const existing = byKey.get(citationKey(c));
      if (existing) return existing;
      const withId = { ...c, id: `S${++n}` };
      registry[withId.id] = withId;
      byKey.set(citationKey(withId), withId);
      return withId;
    });
    await db
      .update(cases)
      .set({ record: { ...record, citations: registry } as Record<string, unknown> })
      .where(eq(cases.id, caseId));
    return out;
  });
}
