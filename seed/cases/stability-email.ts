import type { CaseSpec, EmailSpec } from "../spec";
import type { ExtraCost, StabilityAllowance } from "@/lib/rules/types";

/**
 * Stability data reaches the quality agent as a document: an email from the
 * manufacturer's QA with the allowance in one sentence. The agent parses the
 * numbers from this sentence (lib/agent/stability-doc.ts), so keep the wording:
 * "... up to <N> °C for a cumulative <M> minutes ...".
 */
export function stabilityEmail(spec: Pick<CaseSpec, "product" | "shipper">, allowance: StabilityAllowance, atH = 2): EmailSpec {
  return {
    from: { name: "Elena Weber (QA Lead)", email: "qa@rheinfeld-bio.example" },
    to: spec.shipper,
    atH,
    subject: `Stability data - ${spec.product.name}`,
    body: `Dear team,\n\nfor ${spec.product.name} (batch ${spec.product.batch}) the validated stability data allows temperature excursions up to ${allowance.maxTempC} °C for a cumulative ${allowance.maxMinutesOutOfRange.toLocaleString("en-US")} minutes outside 2-8 °C.\n\nElena`,
  };
}

/** Eligible extra costs, one line each: "- <label>: EUR <amount>". */
export function extraCostsEmail(spec: Pick<CaseSpec, "shipper" | "consignee" | "shipmentRef">, costs: ExtraCost[], atH = 30): EmailSpec {
  return {
    from: spec.consignee,
    to: spec.shipper,
    atH,
    subject: `Extra costs - ${spec.shipmentRef}`,
    body: `Dear team,\n\nfurther to the quarantine of shipment ${spec.shipmentRef}, these documented extra costs were incurred:\n\n${costs.map((c) => `- ${c.label}: EUR ${c.eur.toLocaleString("en-US")}`).join("\n")}\n\nInvoices on request.\n\nKind regards`,
  };
}
