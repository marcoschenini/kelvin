import type { CustodyParty, RecoveryRoute } from "@/lib/domain/parties";
import type { CaseSpec, EmailSpec } from "../spec";
import type { ExtraCost, StabilityAllowance } from "@/lib/rules/types";
import { CASE_B, CASE_C, fraBosChain } from "./demo";

/**
 * Evaluation set: 24 shipments that each change one or two facts against the
 * demo setups — who held the cargo, declared value, missing documents, policy
 * exclusions, late discovery, lapsed notices, QA outcome. Every case carries an
 * answer key written by hand from the domain rules (not produced by the engine).
 */

export interface AnswerKey {
  /** What the case tests, shown on the evaluation page */
  tests: string;
  qa: "released" | "rejected";
  claim: boolean;
  route: RecoveryRoute | null;
  custody: CustodyParty | null;
  /** Protective notices due at investigation time (QA still pending) */
  notices: RecoveryRoute[];
  /** What the quality agent decides from the stability data; default: usable if qa is released, else damaged */
  qaAgent?: "usable" | "damaged" | "unsure";
  /** Claim amount of the primary letter, written by hand (goods + extra costs, capped) */
  claimEur?: number;
  /** The counterparty offers a part-payment: exactly one appeal (a reply draft) must follow */
  appeal?: boolean;
}

export interface EvalCase {
  spec: CaseSpec;
  key: AnswerKey;
}

type Base = "FRA" | "AMS";
interface Variant {
  n: number;
  base: Base;
  title: string;
  key: AnswerKey;
  /** Index of the custody segment where the excursion starts (null = no excursion) */
  seg: number | null;
  minutes?: number;
  peakC?: number;
  dockTransfer?: boolean;
  deliveredDaysAgo: number;
  discoveredAfterH?: number;
  declaredValueEur?: number | null;
  missing?: CaseSpec["missing"];
  contract?: Partial<CaseSpec["contract"]>;
  policy?: Partial<CaseSpec["policy"]>;
  /** Overrides the stability allowance derived from the key */
  stability?: StabilityAllowance;
  extraCosts?: ExtraCost[];
}

/** Demo allowances: B up to 10 °C for 30 min, C up to 10 °C for 60 min. */
const BASE_ALLOWANCE: Record<Base, StabilityAllowance> = { FRA: { maxTempC: 10, maxMinutesOutOfRange: 30 }, AMS: { maxTempC: 10, maxMinutesOutOfRange: 60 } };

/**
 * Stability data per variant, so the quality agent reaches the answer key's
 * disposition. Variants inherit the base case's allowance where the excursion is
 * clearly beyond it; released variants get an allowance they clearly pass.
 */
function allowanceFor(v: Variant): StabilityAllowance {
  if (v.stability) return v.stability;
  if (v.key.qa === "released") return { maxTempC: 25, maxMinutesOutOfRange: 1440 };
  const base = BASE_ALLOWANCE[v.base];
  const peak = v.peakC ?? 12;
  const mins = v.minutes ?? 90;
  if (peak >= base.maxTempC * 1.3 && mins >= base.maxMinutesOutOfRange * 1.5) return base;
  return { maxTempC: Math.max(8, Math.round(Math.min(base.maxTempC, peak * 0.7) * 10) / 10), maxMinutesOutOfRange: Math.max(1, Math.floor(Math.min(base.maxMinutesOutOfRange, mins * 0.5))) };
}

function alarmEmail(spec: CaseSpec, atH: number): EmailSpec {
  return {
    from: spec.consignee,
    to: spec.shipper,
    atH,
    subject: `Logger alarm - ${spec.shipmentRef} / AWB ${spec.awbNumber}`,
    body: `Dear team,\n\nthe ColdTrace logger of shipment ${spec.shipmentRef} (received {date:0}) shows an alarm. The goods are quarantined pending your QA disposition. Logger file attached.\n\nKind regards,\n${spec.consignee.contact ?? spec.consignee.name}`,
  };
}

function build(v: Variant): EvalCase {
  const base = v.base === "FRA" ? CASE_B : CASE_C;
  const custody = v.base === "FRA" ? fraBosChain(!!v.dockTransfer) : CASE_C.custody;
  const id = `eval-${String(v.n).padStart(2, "0")}`;
  const discoveredAfterH = v.discoveredAfterH ?? 1;
  let excursions: CaseSpec["excursions"] = [];
  if (v.seg != null) {
    const s = custody[v.seg];
    excursions = [{ startH: s.fromH + Math.min(0.25, (s.toH - s.fromH) * 0.15), minutes: v.minutes ?? 90, peakC: v.peakC ?? 12, shape: "hump" }];
  }
  const spec: CaseSpec = {
    ...base,
    id,
    code: `E${String(v.n).padStart(2, "0")}`,
    scenario: "eval",
    title: v.title,
    shipmentRef: `EV-${String(v.n).padStart(2, "0")}${v.base === "FRA" ? "F" : "A"}`,
    awbNumber: `${base.awbNumber.slice(0, 4)}${String(5000 + v.n * 37).padStart(4, "0")} ${String(1000 + v.n * 91).slice(-4)}`,
    loggerId: `CT5-${70000 + v.n}`,
    custody,
    excursions,
    declaredValueEur: v.declaredValueEur === undefined ? null : v.declaredValueEur,
    deliveredDaysAgo: v.deliveredDaysAgo,
    discoveredAfterH,
    missing: v.missing,
    contract: { ...base.contract, ...(v.contract ?? {}) },
    policy: { ...base.policy, ...(v.policy ?? {}) },
    handlingReport: undefined,
    emails: [],
    expected: {
      qa: v.key.qa,
      claim: v.key.claim,
      route: v.key.route,
      custodyAtExcursion: v.key.custody ?? "shipper",
      protectiveNotice: v.key.notices[0] ?? null,
      notes: v.key.tests,
    },
  };
  const allowance = allowanceFor(v);
  spec.product = { ...spec.product, stability: allowance };
  // The seed generator turns product.stability and extraCosts into the cited emails.
  spec.emails = [alarmEmail(spec, discoveredAfterH)];
  if (v.extraCosts?.length) spec.extraCosts = v.extraCosts;
  return { spec, key: v.key };
}

// FRA chain segments: 0 shipper plant · 1 forwarder truck · 2 forwarder hub (2 = dock with dockTransfer) ·
// 3 airline acceptance · 4 airline ramp · 5 flight · 6 airline import · 7 forwarder US storage · 8 forwarder truck
// AMS chain: 0 shipper · 1 forwarder truck · 2 hub floor (ambient) · 3 hub cold room · 4 airline acceptance ·
// 5 flight · 6 airline import · 7 forwarder US cold room · 8 forwarder truck
const VARIANTS: Variant[] = [
  { n: 1, base: "FRA", title: "Ramp exposure, airline custody, found late", seg: 4, minutes: 90, peakC: 13, deliveredDaysAgo: 10, discoveredAfterH: 211,
    key: { tests: "Montreal cap with NVD; forwarder notice lapsed; insurer best; notice to carrier", qa: "rejected", claim: true, route: "insurer", custody: "airline", notices: ["carrier"] } },
  { n: 2, base: "FRA", title: "Ramp exposure with full declared value", seg: 4, minutes: 90, peakC: 13, deliveredDaysAgo: 5, declaredValueEur: 200_000,
    key: { tests: "Special declaration of value lifts the Montreal cap: carrier beats insurer", qa: "rejected", claim: true, route: "carrier", custody: "airline", notices: ["forwarder"] } },
  { n: 3, base: "FRA", title: "Ramp exposure with partial declared value", seg: 4, minutes: 90, peakC: 13, deliveredDaysAgo: 10, discoveredAfterH: 211, declaredValueEur: 100_000,
    key: { tests: "Declared value below loss: insurer still ahead after deductible", qa: "rejected", claim: true, route: "insurer", custody: "airline", notices: ["carrier"] } },
  { n: 4, base: "FRA", title: "Warm flight, airline custody", seg: 5, minutes: 75, peakC: 9.6, deliveredDaysAgo: 2,
    key: { tests: "Excursion in flight; insurer covers; forwarder pass-through notice due", qa: "rejected", claim: true, route: "insurer", custody: "airline", notices: ["forwarder"] } },
  { n: 5, base: "FRA", title: "Cold-room failure at forwarder hub", seg: 2, minutes: 120, peakC: 11, deliveredDaysAgo: 2,
    key: { tests: "Forwarder custody but SDR/kg cap is tiny: insurer best; notice to forwarder", qa: "rejected", claim: true, route: "insurer", custody: "forwarder", notices: ["forwarder"] } },
  { n: 6, base: "FRA", title: "Short warm truck leg", seg: 1, minutes: 40, peakC: 9.8, deliveredDaysAgo: 1,
    key: { tests: "Below the policy's 60-minute minimum: only the forwarder route remains", qa: "rejected", claim: true, route: "forwarder", custody: "forwarder", notices: [] } },
  { n: 7, base: "FRA", title: "Warm at the shipper's own dock", seg: 0, minutes: 45, peakC: 10, deliveredDaysAgo: 3,
    key: { tests: "Shipper custody and under policy minimum: nobody to claim from", qa: "rejected", claim: false, route: null, custody: "shipper", notices: [] } },
  { n: 8, base: "FRA", title: "Ramp exposure, product released", seg: 4, minutes: 90, peakC: 13, deliveredDaysAgo: 10, discoveredAfterH: 211,
    key: { tests: "QA releases: no claim, but the protective notice was still due while QA was pending", qa: "released", claim: false, route: null, custody: "airline", notices: ["carrier"] } },
  { n: 9, base: "AMS", title: "Hub floor storage, forwarder breach", seg: 2, minutes: 225, peakC: 15, deliveredDaysAgo: 2,
    key: { tests: "Cold-room duty breached, cap = invoice value: full claim against forwarder", qa: "rejected", claim: true, route: "forwarder", custody: "forwarder", notices: ["forwarder"] } },
  { n: 10, base: "AMS", title: "Hub floor storage, contract notice lapsed", seg: 2, minutes: 225, peakC: 15, deliveredDaysAgo: 9,
    key: { tests: "Forwarder notice lapsed: fall back to the insurer", qa: "rejected", claim: true, route: "insurer", custody: "forwarder", notices: [] } },
  { n: 11, base: "AMS", title: "Hub floor storage, product released", seg: 2, minutes: 225, peakC: 15, deliveredDaysAgo: 2,
    key: { tests: "QA releases after a forwarder breach: no claim", qa: "released", claim: false, route: null, custody: "forwarder", notices: ["forwarder"] } },
  { n: 12, base: "AMS", title: "Warm transatlantic flight", seg: 5, minutes: 80, peakC: 10, deliveredDaysAgo: 6,
    key: { tests: "Airline custody, no deductible exclusion: insurer; forwarder notice due tomorrow", qa: "rejected", claim: true, route: "insurer", custody: "airline", notices: ["forwarder"] } },
  { n: 13, base: "AMS", title: "Hub floor storage, invoice missing", seg: 2, minutes: 225, peakC: 15, deliveredDaysAgo: 2, missing: ["invoice"],
    key: { tests: "No invoice: value from the waybill's customs value; still a full forwarder claim", qa: "rejected", claim: true, route: "forwarder", custody: "forwarder", notices: ["forwarder"] } },
  { n: 14, base: "FRA", title: "Ramp exposure, no cargo policy", seg: 4, minutes: 90, peakC: 13, deliveredDaysAgo: 10, discoveredAfterH: 211, missing: ["policy"],
    key: { tests: "No policy on file: only the carrier remains", qa: "rejected", claim: true, route: "carrier", custody: "airline", notices: ["carrier"] } },
  { n: 15, base: "FRA", title: "Ramp exposure, no forwarder contract", seg: 4, minutes: 90, peakC: 13, deliveredDaysAgo: 10, discoveredAfterH: 211, missing: ["contract"],
    key: { tests: "No contract: forwarder route unknown; insurer best", qa: "rejected", claim: true, route: "insurer", custody: "airline", notices: ["carrier"] } },
  { n: 16, base: "FRA", title: "Ramp exposure, policy without temperature cover", seg: 4, minutes: 90, peakC: 13, deliveredDaysAgo: 10, discoveredAfterH: 211, policy: { temperatureCover: false },
    key: { tests: "Temperature not covered: carrier is the only route", qa: "rejected", claim: true, route: "carrier", custody: "airline", notices: ["carrier"] } },
  { n: 17, base: "FRA", title: "Ramp exposure discovered on day 13", seg: 4, minutes: 90, peakC: 13, deliveredDaysAgo: 13, discoveredAfterH: 13 * 24 - 4,
    key: { tests: "Montreal notice due tomorrow: urgent protective notice", qa: "rejected", claim: true, route: "insurer", custody: "airline", notices: ["carrier"] } },
  { n: 18, base: "FRA", title: "Ramp exposure discovered after 15 days", seg: 4, minutes: 90, peakC: 13, deliveredDaysAgo: 15, discoveredAfterH: 15 * 24 - 4,
    key: { tests: "Montreal notice lapsed: no carrier notice, insurer still possible", qa: "rejected", claim: true, route: "insurer", custody: "airline", notices: [] } },
  { n: 19, base: "FRA", title: "Warm storage at destination agent", seg: 7, minutes: 100, peakC: 12, deliveredDaysAgo: 1,
    key: { tests: "Forwarder custody at destination, SDR cap: insurer best, notice not yet due", qa: "rejected", claim: true, route: "insurer", custody: "forwarder", notices: [] } },
  { n: 20, base: "FRA", title: "Dock transfer breach, contract capped at invoice value", seg: 2, dockTransfer: true, minutes: 70, peakC: 11, deliveredDaysAgo: 2,
    contract: { liabilityCap: { kind: "invoice_value" } },
    key: { tests: "Ambient dock in breach + invoice-value cap: forwarder beats insurer", qa: "rejected", claim: true, route: "forwarder", custody: "forwarder", notices: ["forwarder"] } },
  { n: 21, base: "FRA", title: "Alarm check, no excursion in the data", seg: null, deliveredDaysAgo: 1,
    key: { tests: "All readings in range: case closes without QA", qa: "released", claim: false, route: null, custody: null, notices: [] } },
  { n: 22, base: "AMS", title: "Warm flight with full declared value", seg: 5, minutes: 80, peakC: 10, deliveredDaysAgo: 3, declaredValueEur: 350_000,
    key: { tests: "Declared value: carrier ahead of insurer; forwarder pass-through notice due", qa: "rejected", claim: true, route: "carrier", custody: "airline", notices: ["forwarder"] } },
  { n: 23, base: "FRA", title: "Short ramp exposure", seg: 4, minutes: 30, peakC: 9, deliveredDaysAgo: 10, discoveredAfterH: 211,
    key: { tests: "Under the policy minimum: the carrier's capped amount is all that is left", qa: "rejected", claim: true, route: "carrier", custody: "airline", notices: ["carrier"] } },
  { n: 24, base: "FRA", title: "Import cool-room failure at destination airport", seg: 6, minutes: 150, peakC: 11, deliveredDaysAgo: 3,
    key: { tests: "Airline custody at destination; insurer best; forwarder pass-through notice due", qa: "rejected", claim: true, route: "insurer", custody: "airline", notices: ["forwarder"] } },
  // --- workflow v2: new answer keys (written by hand, not produced by the engine) ---
  { n: 25, base: "FRA", title: "Ramp exposure just inside the stability limit", seg: 4, minutes: 90, peakC: 13, deliveredDaysAgo: 10, discoveredAfterH: 211, stability: { maxTempC: 13.5, maxMinutesOutOfRange: 95 },
    key: { tests: "Within 10% of the stability limit: the quality agent is unsure and a human QA decides (here: rejects)", qaAgent: "unsure", qa: "rejected", claim: true, route: "insurer", custody: "airline", notices: ["carrier"] } },
  { n: 26, base: "AMS", title: "Hub floor storage with disposal and re-shipment costs", seg: 2, minutes: 225, peakC: 15, deliveredDaysAgo: 2,
    extraCosts: [{ label: "Disposal of the damaged batch", eur: 12_000 }, { label: "Re-shipment of replacement goods", eur: 8_000 }],
    key: { tests: "Loss = goods €350,000 + documented extra costs €20,000; the forwarder cap is the whole loss, so the claim is €370,000", claimEur: 370_000, qa: "rejected", claim: true, route: "forwarder", custody: "forwarder", notices: ["forwarder"] } },
  { n: 27, base: "AMS", title: "Hub floor storage, forwarder offers a part-payment", seg: 2, minutes: 225, peakC: 15, deliveredDaysAgo: 2,
    key: { tests: "The forwarder offers 90 %: exactly one appeal with extra evidence is drafted, a second is refused", appeal: true, qa: "rejected", claim: true, route: "forwarder", custody: "forwarder", notices: ["forwarder"] } },
];

export const EVAL_CASES: EvalCase[] = VARIANTS.map(build);
