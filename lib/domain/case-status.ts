/**
 * Case statuses and their presentation. The transition rules themselves live in
 * lib/case/status-machine.ts (milestone 3); this file is display metadata only.
 */

export const CASE_STATUSES = [
  "new",
  "investigating",
  "awaiting_qa",
  "no_claim",
  "claim_prepared",
  "awaiting_approval",
  "sent",
  "in_negotiation",
  "closed_no_claim",
  "closed_recovered",
  "closed_settled",
  "closed_rejected",
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];

export type Tone = "neutral" | "ai" | "success" | "warning" | "danger" | "human" | "cold";

export const STATUS_META: Record<CaseStatus, { label: string; tone: Tone; description: string }> = {
  new: { label: "New", tone: "neutral", description: "Alert received, agent not started" },
  investigating: { label: "Investigating", tone: "ai", description: "Agent is rebuilding the incident" },
  awaiting_qa: { label: "Awaiting QA", tone: "human", description: "Quality must decide product disposition" },
  no_claim: { label: "No claim", tone: "success", description: "Product released, nothing to recover" },
  claim_prepared: { label: "Claim prepared", tone: "warning", description: "Evidence pack and letter drafted" },
  awaiting_approval: { label: "Awaiting approval", tone: "human", description: "Manager must approve before sending" },
  sent: { label: "Sent", tone: "cold", description: "Claim delivered to the counterparty" },
  in_negotiation: { label: "In negotiation", tone: "warning", description: "Counterparty replied, agent following up" },
  closed_no_claim: { label: "Closed · No claim", tone: "success", description: "Closed with reason logged" },
  closed_recovered: { label: "Closed · Recovered", tone: "success", description: "Full amount recovered" },
  closed_settled: { label: "Closed · Settled", tone: "success", description: "Settled for a partial amount" },
  closed_rejected: { label: "Closed · Rejected", tone: "neutral", description: "Counterparty rejected the claim" },
};

export function isClosed(status: CaseStatus): boolean {
  return status.startsWith("closed_");
}
