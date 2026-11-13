import type { CustodyParty, RecoveryRoute } from "@/lib/domain/parties";

export type QaStatus = "pending" | "released" | "rejected";

/** Contract terms as parsed by check_contract. */
export interface ContractTermsParsed {
  found: boolean;
  coldRoomDuty: boolean;
  /** Max minutes of ambient staging allowed at hubs (clause 3.2) */
  ambientLimitMinutes: number | null;
  liabilityCap: { kind: "invoice_value" } | { kind: "sdr_per_kg"; sdrPerKg: number } | { kind: "fixed_eur"; eur: number } | { kind: "unknown" };
  airLegPassThrough: boolean;
  noticeDays: number | null;
  timeBarYears: number | null;
}

/** Policy terms as parsed by check_policy. */
export interface PolicyTermsParsed {
  found: boolean;
  temperatureCover: boolean;
  deductibleEur: number | null;
  insuredPercentOfInvoice: number;
  minDeviationMinutes: number;
  noticeDays: number | null;
  preservationDuty: boolean;
}

export interface StabilityAllowance {
  maxTempC: number;
  maxMinutesOutOfRange: number;
  citationHint?: string;
}
export type QaVerdict = "usable" | "damaged" | "unsure";
export interface QaAssessment {
  verdict: QaVerdict;
  peakC: number | null;
  minutesOutOfRange: number;
  allowance: StabilityAllowance | null;
  /** Human-readable, each a full sentence */
  reasons: string[];
  basis: "within_allowance" | "beyond_allowance" | "no_stability_data" | "near_limit";
}
export interface ExtraCost {
  label: string;
  eur: number;
  citationHint?: string;
}
export interface ClaimPlanItem {
  route: RecoveryRoute;
  role: "primary" | "secondary";
  amountEur: number;
  reason: string;
  order: number;
}
export interface CaseOutcome {
  result: "no_claim" | "recovered" | "settled" | "rejected" | "not_approved";
  claimedEur: number | null;
  recoveredEur: number | null;
  recoveryPct: number | null;
  payer: RecoveryRoute | null;
  daysToClose: number | null;
  closedAt: string;
}

export interface LiabilityInput {
  /** Goods value; eligible extraCosts are added before caps are applied */
  lossEur: number;
  extraCosts?: ExtraCost[];
  weightKg: number;
  /** null = NVD */
  declaredValueEur: number | null;
  custodyAtExcursion: CustodyParty | null;
  /** Excursion happened during an uncontrolled (ambient) segment at a hub/dock */
  excursionInUncontrolledSegment: boolean;
  excursionMinutes: number;
  qa: QaStatus;
  contract: ContractTermsParsed;
  policy: PolicyTermsParsed;
}

export interface RouteLiability {
  route: RecoveryRoute;
  /** Amount recoverable if the route succeeds */
  recoverableEur: number;
  /** Cap or limit applied, if any */
  capEur: number | null;
  /** Human-readable working: "26 SDR/kg × 120 kg = 3,120 SDR × 1.2088 = €3,771" */
  basis: string;
  deductibleEur: number | null;
  /** Conditions that must hold (e.g. "QA rejects the batch") */
  conditions: string[];
  /** Why this route is weak or blocked */
  blockers: string[];
}

export interface Deadline {
  id: string;
  route: RecoveryRoute | null;
  label: string;
  /** Legal or contractual basis, e.g. "Montreal Convention Art. 31(2)" */
  basis: string;
  dueAt: string; // ISO
  daysLeft: number;
  windowDays: number;
  kind: "notice" | "time_bar";
  status: "ok" | "at_risk" | "due_today" | "overdue";
}

export interface RankedRoute extends RouteLiability {
  probability: number;
  expectedEur: number;
  rank: number;
  recommended: boolean;
  reasons: string[];
  noticeDeadline: Deadline | null;
}
