import "server-only";
import { asc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { documents, drafts, type CaseRow } from "@/lib/db/schema";
import { getCaseRow, qaStatus } from "@/lib/agent/assess";
import { getRecord, type CaseRecord } from "@/lib/case/record";
import type { RecoveryRoute } from "@/lib/domain/parties";
import { loadRules } from "@/lib/rules/load";
import type { RulesConfig } from "@/lib/rules/config";
import type { QaStatus } from "@/lib/rules/types";

/**
 * Everything "Ask Kelvin" may read about one case. The chat is read-only:
 * nothing here writes to the case, the outbox or the audit trail.
 */
export interface ChatDraft {
  id: string;
  kind: string;
  route: RecoveryRoute | null;
  recipientName: string | null;
  status: string;
  amountEur: number | null;
  subject: string | null;
}

export interface ChatContext {
  caseId: string;
  row: CaseRow;
  record: CaseRecord;
  qa: { status: QaStatus; by?: string; note?: string | null };
  rules: RulesConfig;
  drafts: ChatDraft[];
  documents: { id: string; kind: string; title: string; pages: number | null }[];
  now: Date;
}

export async function loadChatContext(db: DB, caseId: string, now = new Date()): Promise<ChatContext> {
  const [row, record, qa, rules, draftRows, docRows] = await Promise.all([
    getCaseRow(db, caseId),
    getRecord(db, caseId),
    qaStatus(db, caseId),
    loadRules(db),
    db.select().from(drafts).where(eq(drafts.caseId, caseId)).orderBy(asc(drafts.createdAt)),
    db.select().from(documents).where(eq(documents.caseId, caseId)).orderBy(asc(documents.createdAt)),
  ]);
  return {
    caseId,
    row,
    record,
    qa: { status: qa.status, by: qa.by, note: qa.note },
    rules,
    drafts: draftRows.map((d) => ({
      id: d.id,
      kind: d.kind,
      route: (d.route as RecoveryRoute | null) ?? null,
      recipientName: d.recipientName ?? null,
      status: d.status,
      amountEur: d.amountEur ?? null,
      subject: d.subject ?? null,
    })),
    documents: docRows.map((d) => ({ id: d.id, kind: d.kind, title: d.title, pages: d.pages ?? null })),
    now,
  };
}
