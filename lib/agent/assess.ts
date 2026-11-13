import { and, desc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { cases, decisions, type CaseRow } from "@/lib/db/schema";
import type { Citation } from "@/lib/domain/citation";
import { formatDate } from "@/lib/format";
import type { CaseRecord } from "@/lib/case/record";
import type { DeadlineInput } from "@/lib/rules/deadlines";
import type { LiabilityInput, QaStatus } from "@/lib/rules/types";
import { findDocument } from "./docs";
import { ToolGuardError } from "./tool";

export async function getCaseRow(db: DB, caseId: string): Promise<CaseRow> {
  const [row] = await db.select().from(cases).where(eq(cases.id, caseId));
  if (!row) throw new Error(`Case ${caseId} not found`);
  return row;
}

/** QA status from the latest human QA decision (the agent never decides it). */
export async function qaStatus(db: DB, caseId: string): Promise<{ status: QaStatus; decisionId?: string; by?: string; at?: Date; note?: string | null }> {
  const [d] = await db
    .select()
    .from(decisions)
    .where(and(eq(decisions.caseId, caseId), eq(decisions.gate, "qa")))
    .orderBy(desc(decisions.at))
    .limit(1);
  if (!d) return { status: "pending" };
  return { status: d.decision === "released" ? "released" : "rejected", decisionId: d.id, by: `${d.actorName} (${d.actorRole})`, at: d.at, note: d.note };
}

/** Builds the rules-engine inputs from the case record, failing loudly when a prerequisite tool has not run. */
export function liabilityInput(record: CaseRecord, row: CaseRow, qa: QaStatus): LiabilityInput {
  const missing: string[] = [];
  if (!record.excursions) missing.push("parse_logger");
  if (!record.custody) missing.push("build_custody_timeline");
  if (!record.contract) missing.push("check_contract");
  if (!record.policy) missing.push("check_policy");
  if (missing.length) throw new ToolGuardError(`Run ${missing.join(", ")} first.`);
  const lossEur = record.shipment?.valueEur ?? row.valueEur;
  const weightKg = record.shipment?.weightKg ?? row.weightKg;
  if (lossEur == null) throw new ToolGuardError("Shipment value unknown: read the commercial invoice (extract_document kind=invoice) or request it.");
  if (weightKg == null) throw new ToolGuardError("Shipment weight unknown: read the air waybill (extract_document kind=awb).");
  const main = record.excursions!.find((e) => e.direction === "high") ?? record.excursions![0];
  const attr = record.custody!.attribution;
  return {
    lossEur,
    weightKg,
    declaredValueEur: record.shipment?.declaredValueEur !== undefined ? record.shipment.declaredValueEur : row.declaredValueEur,
    custodyAtExcursion: attr?.role ?? null,
    excursionInUncontrolledSegment: attr ? !attr.controlled : false,
    excursionMinutes: main?.minutes ?? 0,
    qa,
    contract: record.contract!.terms,
    policy: record.policy!.terms,
    extraCosts: record.extraCosts,
  };
}

export function deadlineInput(record: CaseRecord, row: CaseRow, now: Date): DeadlineInput {
  const delivered = row.deliveredAt ?? (record.shipment?.deliveredAt ? new Date(record.shipment.deliveredAt) : null);
  if (!delivered) throw new ToolGuardError("Delivery date unknown: run build_custody_timeline or read the proof of delivery.");
  const discovered = row.discoveredAt ?? now;
  if (!record.contract || !record.policy) throw new ToolGuardError("Run check_contract and check_policy first.");
  return { deliveredAt: delivered, discoveredAt: discovered, contract: record.contract.terms, policy: record.policy.terms, now };
}

/** Goods value plus eligible extra costs: the total loss the claim plan is measured against. */
export function totalLossEur(input: LiabilityInput): number {
  return input.lossEur + (input.extraCosts ?? []).reduce((s, c) => s + c.eur, 0);
}

/** Required documents that are missing from the file (the protective-notice safety net also applies then). */
export async function requiredDataMissing(db: DB, caseId: string): Promise<boolean> {
  const need = ["logger", "awb", "invoice", "contract", "policy"] as const;
  for (const k of need) if (!(await findDocument(db, caseId, k))) return true;
  return false;
}

/** The citation for the QA decision (same source whichever letter cites it). */
export function qaCitation(qa: Awaited<ReturnType<typeof qaStatus>>): Citation {
  return {
    kind: "record",
    label: `QA decision ${qa.at ? formatDate(qa.at) : ""}`.trim(),
    title: `Quality disposition: rejected by ${qa.by}${qa.note ? `. Note: ${qa.note}` : ""}`,
    quote: qa.note ?? "Batch rejected",
  };
}
