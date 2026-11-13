import { formatEUR, formatNumber } from "@/lib/format";
import type { RulesConfig } from "./config";
import { montrealLimit } from "./montreal";
import type { LiabilityInput, RouteLiability } from "./types";

/**
 * Recoverable € per route, applying caps, deductibles and exclusions.
 * Recoverable assumes the route succeeds; probability is handled in ranking.
 */
export function computeLiability(raw: LiabilityInput, cfg: RulesConfig): RouteLiability[] {
  // Loss = goods value + eligible, documented extra costs; caps apply to the total.
  const extra = (raw.extraCosts ?? []).reduce((s, c) => s + (c.eur > 0 ? c.eur : 0), 0);
  const input: LiabilityInput = extra ? { ...raw, lossEur: raw.lossEur + extra } : raw;
  const qaBlocker =
    input.qa === "released" ? ["QA released the product: no damage, nothing to recover."] : [];
  const qaCondition = input.qa === "pending" ? ["QA must reject the batch for the goods to count as damaged."] : [];

  /* ---------------- carrier (Montreal) ---------------- */
  const m = montrealLimit(input, cfg);
  const carrier: RouteLiability = {
    route: "carrier",
    recoverableEur: input.custodyAtExcursion === "airline" ? m.recoverableEur : 0,
    capEur: m.capEur,
    basis: m.basis,
    deductibleEur: null,
    conditions: [...qaCondition, "Written notice of damage within the Art. 31 period."],
    blockers: [
      ...qaBlocker,
      ...(input.custodyAtExcursion !== "airline" ? ["The excursion did not happen while the airline held the cargo."] : []),
    ],
  };

  /* ---------------- forwarder (contract) ---------------- */
  const c = input.contract;
  let fwdCap: number | null = null;
  let fwdBasis = "";
  if (!c.found) {
    fwdBasis = "No forwarder contract on file: liability terms unknown.";
  } else if (c.liabilityCap.kind === "invoice_value") {
    fwdCap = input.lossEur;
    fwdBasis = `Contract caps liability for temperature breaches at the invoice value: ${formatEUR(input.lossEur)}.`;
  } else if (c.liabilityCap.kind === "sdr_per_kg") {
    const sdr = c.liabilityCap.sdrPerKg * input.weightKg;
    fwdCap = sdr * cfg.sdr.eurPerSdr;
    fwdBasis = `Contract cap ${c.liabilityCap.sdrPerKg} SDR/kg × ${formatNumber(input.weightKg)} kg = ${formatNumber(sdr)} SDR × ${cfg.sdr.eurPerSdr} = ${formatEUR(fwdCap)}.`;
  } else if (c.liabilityCap.kind === "fixed_eur") {
    fwdCap = c.liabilityCap.eur;
    fwdBasis = `Contract cap ${formatEUR(c.liabilityCap.eur)} per shipment.`;
  } else {
    fwdBasis = "Contract liability cap could not be determined.";
  }

  let fwdRecoverable = 0;
  const fwdBlockers: string[] = [...qaBlocker];
  if (input.custodyAtExcursion === "forwarder") {
    fwdRecoverable = Math.min(input.lossEur, fwdCap ?? 0);
  } else if (input.custodyAtExcursion === "airline" && c.found) {
    if (c.airLegPassThrough) {
      fwdRecoverable = Math.min(input.lossEur, m.capEur);
      fwdCap = m.capEur;
      fwdBasis = `Air-leg clause limits the forwarder to what it recovers from the carrier: Montreal limit ${formatEUR(m.capEur)}.`;
      fwdBlockers.push("Excursion happened in the air carrier's custody; forwarder liability passes through to the carrier limit.");
    } else {
      fwdRecoverable = Math.min(input.lossEur, fwdCap ?? 0);
      fwdBlockers.push("Excursion happened in the air carrier's custody; forwarder answers for its subcontractor.");
    }
  } else {
    fwdBlockers.push("The excursion did not happen in the forwarder's custody.");
  }
  if (!c.found) fwdBlockers.push("Forwarder contract missing.");
  const forwarder: RouteLiability = {
    route: "forwarder",
    recoverableEur: fwdRecoverable,
    capEur: fwdCap,
    basis: fwdBasis,
    deductibleEur: null,
    conditions: [...qaCondition, "Written notice within the contract notice period."],
    blockers: fwdBlockers,
  };

  /* ---------------- insurer (policy) ---------------- */
  const p = input.policy;
  const insured = (input.lossEur * p.insuredPercentOfInvoice) / 100;
  const deductible = p.deductibleEur ?? 0;
  const insBlockers: string[] = [...qaBlocker];
  if (!p.found) insBlockers.push("Cargo policy missing.");
  else if (!p.temperatureCover) insBlockers.push("Policy does not cover temperature deviation.");
  else if (p.minDeviationMinutes > 0 && input.excursionMinutes < p.minDeviationMinutes)
    insBlockers.push(`Deviation of ${input.excursionMinutes} min is below the policy minimum of ${p.minDeviationMinutes} min.`);
  const covered = p.found && p.temperatureCover && !(p.minDeviationMinutes > 0 && input.excursionMinutes < p.minDeviationMinutes);
  const insurer: RouteLiability = {
    route: "insurer",
    recoverableEur: covered ? Math.max(0, insured - deductible) : 0,
    capEur: insured,
    basis: covered
      ? `Insured value ${formatEUR(insured)} (${p.insuredPercentOfInvoice}% of invoice) less deductible ${formatEUR(deductible)} = ${formatEUR(Math.max(0, insured - deductible))}.`
      : "Not recoverable under the policy.",
    deductibleEur: p.deductibleEur,
    conditions: [...qaCondition, "Notify the insurer within the policy period.", "Preserve rights against carriers and bailees."],
    blockers: insBlockers,
  };

  if (input.qa === "released") for (const r of [carrier, forwarder, insurer]) r.recoverableEur = 0;
  return [carrier, forwarder, insurer];
}
