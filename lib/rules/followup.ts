import type { RulesConfig } from "./config";

const DAY_MS = 86_400_000;

/**
 * Reminder day marks (cfg.reminderDays) that are due now: the claim was sent at
 * least N days ago, no reply arrived since, and the mark has not been used yet.
 */
export function remindersDue(
  input: { sentAt: string; lastReplyAt: string | null; remindersSent: number[]; now: Date },
  cfg: RulesConfig,
): number[] {
  const sent = Date.parse(input.sentAt);
  if (!Number.isFinite(sent)) return [];
  if (input.lastReplyAt && Date.parse(input.lastReplyAt) >= sent) return [];
  const days = Math.floor((input.now.getTime() - sent) / DAY_MS);
  return [...cfg.reminderDays].sort((a, b) => a - b).filter((d) => days >= d && !input.remindersSent.includes(d));
}

export function canAppeal(appealsUsed: number, cfg: RulesConfig): boolean {
  return appealsUsed < cfg.maxAppeals;
}
