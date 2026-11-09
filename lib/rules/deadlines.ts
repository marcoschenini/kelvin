import { daysUntil } from "@/lib/format";
import type { RulesConfig } from "./config";
import type { ContractTermsParsed, Deadline, PolicyTermsParsed } from "./types";

const DAY_MS = 86_400_000;

/** Last moment of the calendar day `days` after `from` (UTC). */
export function endOfDayPlus(from: Date, days: number): Date {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 23, 59, 59));
  return new Date(d.getTime() + days * DAY_MS);
}

export function addYears(from: Date, years: number): Date {
  const d = new Date(from);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return endOfDayPlus(d, 0);
}

function status(daysLeft: number, cfg: RulesConfig): Deadline["status"] {
  if (daysLeft < 0) return "overdue";
  if (daysLeft === 0) return "due_today";
  if (daysLeft < cfg.atRiskDays) return "at_risk";
  return "ok";
}

export interface DeadlineInput {
  /** Date of receipt by the consignee */
  deliveredAt: Date;
  /** When the excursion was discovered (alert) */
  discoveredAt: Date;
  contract: Pick<ContractTermsParsed, "found" | "noticeDays" | "timeBarYears">;
  policy: Pick<PolicyTermsParsed, "found" | "noticeDays">;
  now: Date;
}

/** All notice deadlines and time bars, nearest first. */
export function computeDeadlines(input: DeadlineInput, cfg: RulesConfig): Deadline[] {
  const out: Deadline[] = [];
  const push = (d: Omit<Deadline, "daysLeft" | "status">) => {
    const daysLeft = daysUntil(d.dueAt, input.now);
    out.push({ ...d, daysLeft, status: status(daysLeft, cfg) });
  };

  const m = cfg.montreal;
  push({
    id: "montreal_notice",
    route: "carrier",
    label: "Written notice of damage to the carrier",
    basis: `Montreal Convention Art. 31(2): within ${m.damageNoticeDays} days from the date of receipt`,
    dueAt: endOfDayPlus(input.deliveredAt, m.damageNoticeDays).toISOString(),
    windowDays: m.damageNoticeDays,
    kind: "notice",
  });
  push({
    id: "montreal_time_bar",
    route: "carrier",
    label: "Court action against the carrier",
    basis: `Montreal Convention Art. 35: ${m.timeBarYears} years from arrival`,
    dueAt: addYears(input.deliveredAt, m.timeBarYears).toISOString(),
    windowDays: 365 * m.timeBarYears,
    kind: "time_bar",
  });
  if (input.contract.found && input.contract.noticeDays != null) {
    push({
      id: "contract_notice",
      route: "forwarder",
      label: "Written notice of claim to the forwarder",
      basis: `Forwarder contract notice clause: within ${input.contract.noticeDays} days of delivery`,
      dueAt: endOfDayPlus(input.deliveredAt, input.contract.noticeDays).toISOString(),
      windowDays: input.contract.noticeDays,
      kind: "notice",
    });
  }
  if (input.contract.found && input.contract.timeBarYears != null) {
    push({
      id: "contract_time_bar",
      route: "forwarder",
      label: "Legal proceedings against the forwarder",
      basis: `Forwarder contract time bar: ${input.contract.timeBarYears} year(s) from delivery`,
      dueAt: addYears(input.deliveredAt, input.contract.timeBarYears).toISOString(),
      windowDays: 365 * input.contract.timeBarYears,
      kind: "time_bar",
    });
  }
  if (input.policy.found && input.policy.noticeDays != null) {
    push({
      id: "policy_notice",
      route: "insurer",
      label: "Notification of loss to the insurer",
      basis: `Cargo policy claims clause: within ${input.policy.noticeDays} days of discovery`,
      dueAt: endOfDayPlus(input.discoveredAt, input.policy.noticeDays).toISOString(),
      windowDays: input.policy.noticeDays,
      kind: "notice",
    });
  }
  return out.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/** Nearest notice deadline that is still open (for the deadline ring). */
export function nearestOpenDeadline(deadlines: Deadline[], routes?: Set<string>): Deadline | null {
  return (
    deadlines
      .filter((d) => d.kind === "notice" && d.daysLeft >= 0 && (!routes || (d.route && routes.has(d.route))))
      .sort((a, b) => a.daysLeft - b.daysLeft)[0] ?? null
  );
}
