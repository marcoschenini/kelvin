import { formatEUR, formatNumber } from "@/lib/format";
import type { RulesConfig } from "./config";

/**
 * Montreal Convention 1999 carrier liability for cargo (Art. 22(3)).
 * Without a special declaration of value the limit is N SDR per kg of the
 * weight concerned; with one, the declared sum (unless it exceeds the actual value).
 */
export function montrealLimit(
  args: { weightKg: number; declaredValueEur: number | null; lossEur: number },
  cfg: RulesConfig,
): { capEur: number; recoverableEur: number; basis: string; sdr: number } {
  if (args.declaredValueEur != null) {
    const recoverable = Math.min(args.lossEur, args.declaredValueEur);
    return {
      capEur: args.declaredValueEur,
      recoverableEur: recoverable,
      sdr: args.declaredValueEur / cfg.sdr.eurPerSdr,
      basis: `Special declaration of value ${formatEUR(args.declaredValueEur)} on the air waybill replaces the per-kg limit (Art. 22(3)).`,
    };
  }
  const sdr = cfg.montreal.sdrPerKg * args.weightKg;
  const capEur = sdr * cfg.sdr.eurPerSdr;
  return {
    capEur,
    recoverableEur: Math.min(args.lossEur, capEur),
    sdr,
    basis: `${cfg.montreal.sdrPerKg} SDR/kg × ${formatNumber(args.weightKg)} kg = ${formatNumber(sdr)} SDR × ${cfg.sdr.eurPerSdr} €/SDR (as of ${cfg.sdr.asOf}) = ${formatEUR(capEur)}. No value declared for carriage (NVD).`,
  };
}
