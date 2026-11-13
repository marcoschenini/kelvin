import type { RulesConfig } from "./config";

/** TEMPORARY stand-in (backend owns this file). */
export function remindersDue(input: { sentAt: string; lastReplyAt: string | null; remindersSent: number[]; now: Date }, cfg: RulesConfig): number[] {
  const since = new Date(input.lastReplyAt ?? input.sentAt).getTime();
  const days = (input.now.getTime() - since) / 86_400_000;
  return cfg.reminderDays.filter((d) => days >= d && !input.remindersSent.includes(d));
}
export function canAppeal(appealsUsed: number, cfg: RulesConfig): boolean {
  return appealsUsed < cfg.maxAppeals;
}
