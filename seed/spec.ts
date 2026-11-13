import type { CustodyParty, RecoveryRoute } from "@/lib/domain/parties";
import type { ExtraCost, StabilityAllowance } from "@/lib/rules/types";

/**
 * A CaseSpec describes one synthetic shipment completely. The generator turns it
 * into realistic files (logger CSV, waybill, contract, policy, invoice, handling
 * log, emails). Times are hours relative to delivery to the consignee (0 = receipt),
 * so every case can be re-anchored to "now" when the demo is reset.
 */

export interface Party {
  name: string;
  short: string;
  address: string[];
  email: string;
  contact?: string;
  phone?: string;
}

export interface CustodySegment {
  role: CustodyParty;
  /** Legal entity holding the cargo, e.g. "Boreal Air Cargo" */
  custodian: string;
  location: string;
  activity: string;
  fromH: number;
  toH: number;
  /** Temperature controlled? Drives realism of the handling log only. */
  controlled: boolean;
  reference?: string;
}

export interface ExcursionSpec {
  /** Hour (relative to delivery) when the reading first exceeds 8.0 °C */
  startH: number;
  /** Minutes above 8.0 °C */
  minutes: number;
  peakC: number;
  /** hump = rises and falls smoothly; soak = rises quickly and stays near peak */
  shape: "hump" | "soak";
}

export interface ContractTerms {
  title: string;
  reference: string;
  signedOn: string; // ISO date, static
  governingLaw: string;
  /** Clause 3.2: obliges cold-room storage at hubs */
  coldRoomDuty: boolean;
  /** Clause 6.2: liability cap for breach in own custody */
  liabilityCap: { kind: "invoice_value" } | { kind: "sdr_per_kg"; sdrPerKg: number } | { kind: "fixed_eur"; eur: number };
  /** Clause 4.3: liability for subcontracted air carriage is limited to what forwarder recovers from the carrier */
  airLegPassThrough: boolean;
  /** Clause 7.1: written notice within N days of delivery */
  noticeDays: number;
  /** Clause 5.2: forwarder must report excursions within N hours */
  excursionReportHours: number;
}

export interface PolicyTerms {
  policyNumber: string;
  title: string;
  periodFrom: string;
  periodTo: string;
  deductibleEur: number;
  /** Temperature-deviation extension present? */
  temperatureCover: boolean;
  /** Deviations shorter than this many minutes are excluded (0 = no such exclusion) */
  minDeviationMinutes: number;
  /** Written notice to insurer within N days of discovery */
  noticeDays: number;
  /** Sum insured basis: % of invoice value */
  insuredPercentOfInvoice: number;
  /** Extra exclusion clause text, e.g. packaging */
  extraExclusions?: string[];
}

export interface EmailSpec {
  from: Party | { name: string; email: string };
  to: Party | { name: string; email: string };
  cc?: { name: string; email: string }[];
  /** Hours relative to delivery */
  atH: number;
  subject: string;
  body: string;
}

export interface ExpectedOutcome {
  qa: "released" | "rejected";
  claim: boolean;
  route: RecoveryRoute | null;
  /** Party in custody when the excursion happened */
  custodyAtExcursion: CustodyParty;
  protectiveNotice: RecoveryRoute | null;
  notes: string;
}

export interface CaseSpec {
  id: string;
  code: string;
  scenario: "demo" | "eval";
  title: string;
  shipmentRef: string;
  product: { name: string; description: string; batch: string; units: number; unitPriceEur: number; packaging: string; stability?: StabilityAllowance };
  /** Eligible extra costs; each must be backed by a seeded document line to cite */
  extraCosts?: ExtraCost[];
  /** Defaults to units × unitPrice */
  valueEur: number;
  weightKg: number;
  pieces: number;
  /** null = NVD */
  declaredValueEur: number | null;
  origin: { iata: string; city: string };
  destination: { iata: string; city: string };
  incoterm: string;
  awbNumber: string;
  flight: string;
  loggerId: string;

  shipper: Party;
  forwarder: Party;
  airline: Party;
  consignee: Party;
  insurer: Party;

  /** Days before "now" that the cargo was delivered */
  deliveredDaysAgo: number;
  /** Hours after delivery when the excursion was discovered (alert raised) */
  discoveredAfterH: number;

  custody: CustodySegment[];
  excursions: ExcursionSpec[];
  /** Base temperature inside the shipper's passive/active packaging */
  baseTempC: number;

  contract: ContractTerms;
  policy: PolicyTerms;
  handlingReport?: { title: string; issuer: Party; reference: string; lines: string[]; atH: number };
  emails: EmailSpec[];
  /** Omit a document to simulate missing information (eval cases) */
  missing?: ("invoice" | "contract" | "policy" | "handling_report" | "awb")[];

  expected: ExpectedOutcome;
}
