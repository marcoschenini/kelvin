/**
 * Domain rules configuration. Every number the agent relies on lives here (or
 * in the settings table as an override), never in prompts.
 *
 * Decision support only: not legal advice.
 */

export interface RulesConfig {
  sdr: {
    /** EUR per 1 SDR */
    eurPerSdr: number;
    asOf: string;
    source: string;
  };
  montreal: {
    /** Carrier liability limit per kg (Art. 22(3), revised limit effective 28 Dec 2024) */
    sdrPerKg: number;
    limitEffectiveFrom: string;
    /** Art. 31(2): written complaint for damage within N days from receipt */
    damageNoticeDays: number;
    /** Art. 31(2): delay complaint within N days from the date the cargo was placed at disposal */
    delayNoticeDays: number;
    /** Art. 35: right to damages extinguished after N years */
    timeBarYears: number;
  };
  /** Draft a protective notice when a live route's deadline is this close and QA is pending */
  earlyNoticeThresholdDays: number;
  /** Deadlines under this many days are "at risk" (red) */
  atRiskDays: number;
  /** TEMPORARY (backend owns): quality agent uncertainty margin around the allowance, % */
  qaUncertaintyMarginPct: number;
  reminderDays: number[];
  maxAppeals: number;
  /** Heuristic success probabilities used to rank routes by expected recovery */
  probability: {
    carrierInCustody: number;
    carrierNotInCustody: number;
    forwarderInCustodyDutyBreached: number;
    forwarderInCustody: number;
    forwarderPassThrough: number;
    forwarderNotInCustody: number;
    insurerCovered: number;
  };
}

export const DEFAULT_RULES: RulesConfig = {
  sdr: { eurPerSdr: 1.2088, asOf: "2026-11-04", source: "XE mid-market XDR/EUR (indicative; check IMF daily SDR rates)" },
  montreal: { sdrPerKg: 26, limitEffectiveFrom: "2024-12-28", damageNoticeDays: 14, delayNoticeDays: 21, timeBarYears: 2 },
  earlyNoticeThresholdDays: 5,
  atRiskDays: 3,
  qaUncertaintyMarginPct: 10,
  reminderDays: [14, 30],
  maxAppeals: 1,
  probability: {
    carrierInCustody: 0.85,
    carrierNotInCustody: 0.05,
    forwarderInCustodyDutyBreached: 0.85,
    forwarderInCustody: 0.6,
    forwarderPassThrough: 0.5,
    forwarderNotInCustody: 0.05,
    insurerCovered: 0.8,
  },
};

/** Deep-merges a partial override (from the settings table) onto the defaults. */
export function mergeRules(override: unknown): RulesConfig {
  if (!override || typeof override !== "object") return DEFAULT_RULES;
  const o = override as Partial<RulesConfig>;
  return {
    ...DEFAULT_RULES,
    ...o,
    sdr: { ...DEFAULT_RULES.sdr, ...(o.sdr ?? {}) },
    montreal: { ...DEFAULT_RULES.montreal, ...(o.montreal ?? {}) },
    probability: { ...DEFAULT_RULES.probability, ...(o.probability ?? {}) },
  };
}
