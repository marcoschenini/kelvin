import type { CaseSpec } from "../spec";
import {
  BOREAL,
  FRA_RAMP,
  HARBORVIEW,
  HUDSON,
  LOWLANDS,
  MERIDIAN,
  MERIDIAN_POLICY,
  NORDSTAR,
  NORDSTAR_CONTRACT,
  POLDER,
  RHEINFELD_DE,
  RHEINFELD_NL,
  WESTWIND,
} from "./parties";

/** FRA -> BOS custody chain used by cases A and B (NordStar + Boreal). */
function fraBosChain(transferAtDock: boolean): CaseSpec["custody"] {
  return [
    {
      role: "shipper",
      custodian: RHEINFELD_DE.name,
      location: "Rheinfeld plant, Marburg - cold dock",
      activity: "Packed in active container, loaded onto reefer",
      fromH: -54,
      toH: -52.5,
      controlled: true,
    },
    {
      role: "forwarder",
      custodian: NORDSTAR.name,
      location: "Road Marburg -> Frankfurt (unit FR-NS 2207)",
      activity: "Reefer truck, set point +5 °C",
      fromH: -52.5,
      toH: -50,
      controlled: true,
      reference: "Trip NS-T-55120",
    },
    ...(transferAtDock
      ? [
          {
            role: "forwarder" as const,
            custodian: NORDSTAR.name,
            location: "NordStar FRA hub - dock door 7",
            activity: "Truck transfer: unloading reefer into hub",
            fromH: -50,
            toH: -49.4,
            controlled: false,
            reference: "WMS scan DOCK-07",
          },
        ]
      : []),
    {
      role: "forwarder",
      custodian: NORDSTAR.name,
      location: "NordStar FRA hub, Cargo City Sued - cold room CR-1",
      activity: "Cold-room storage (2-8 °C)",
      fromH: transferAtDock ? -49.4 : -50,
      toH: -45,
      controlled: true,
      reference: "WMS loc CR-1-14",
    },
    {
      role: "airline",
      custodian: BOREAL.name,
      location: "Boreal Air Cargo, FRA - cool centre",
      activity: "Acceptance and build-up (2-8 °C)",
      fromH: -45,
      toH: -40.5,
      controlled: true,
    },
    {
      role: "airline",
      custodian: BOREAL.name,
      location: "FRA apron, position V114",
      activity: "Staged on ramp awaiting loading (aircraft late)",
      fromH: -40.5,
      toH: -38.5,
      controlled: false,
      reference: "Ramp log V114",
    },
    {
      role: "airline",
      custodian: BOREAL.name,
      location: "Flight BO 404 FRA -> BOS",
      activity: "Flight, main deck set to +5 °C",
      fromH: -38.5,
      toH: -30,
      controlled: true,
    },
    {
      role: "airline",
      custodian: BOREAL.name,
      location: "Boreal Air Cargo, BOS Logan - import cool room",
      activity: "Import handling and storage (2-8 °C)",
      fromH: -30,
      toH: -21,
      controlled: true,
    },
    {
      role: "forwarder",
      custodian: NORDSTAR.name,
      location: "NordStar US agent, Chelsea MA - cold storage",
      activity: "Cold-room storage (2-8 °C)",
      fromH: -21,
      toH: -2.5,
      controlled: true,
    },
    {
      role: "forwarder",
      custodian: NORDSTAR.name,
      location: "Road Chelsea MA -> Boston",
      activity: "Reefer truck to consignee",
      fromH: -2.5,
      toH: 0,
      controlled: true,
    },
  ];
}

/* ------------------------------------------------------------------ Case A */

export const CASE_A: CaseSpec = {
  id: "demo-a",
  code: "A",
  scenario: "demo",
  title: "Short excursion during truck transfer at the FRA hub",
  shipmentRef: "RB-24117",
  product: {
    name: "Lumetrazumab 200 mg/10 mL",
    description: "monoclonal antibody, concentrate for infusion",
    batch: "LMZ-2609-031",
    units: 240,
    unitPriceEur: 360,
    packaging: "2 x active container (2-8 °C)",
  },
  valueEur: 86_400,
  weightKg: 64,
  pieces: 2,
  declaredValueEur: null,
  origin: { iata: "FRA", city: "Frankfurt" },
  destination: { iata: "BOS", city: "Boston" },
  incoterm: "FCA Marburg (Incoterms 2020)",
  awbNumber: "717-4820 9915",
  flight: "BO 404",
  loggerId: "CT5-88140",
  shipper: RHEINFELD_DE,
  forwarder: NORDSTAR,
  airline: BOREAL,
  consignee: HARBORVIEW,
  insurer: MERIDIAN,
  deliveredDaysAgo: 1,
  discoveredAfterH: 1,
  custody: fraBosChain(true),
  excursions: [{ startH: -49.9, minutes: 25, peakC: 9.2, shape: "hump" }],
  baseTempC: 4.9,
  contract: { ...NORDSTAR_CONTRACT },
  policy: { ...MERIDIAN_POLICY },
  emails: [
    {
      from: HARBORVIEW,
      to: RHEINFELD_DE,
      atH: 1,
      subject: "Logger alarm on receipt - RB-24117 / AWB 717-4820 9915",
      body: `Dear Lena,

we received shipment RB-24117 today ({date:0}). The ColdTrace logger shows a short alarm: maximum 9.2 °C, approx. 25 minutes above 8 °C on {date:-50}, all other readings within 2-8 °C.

The goods are quarantined in our cold room pending your QA disposition. Logger file attached.

Kind regards,
Dana Whitfield
QA Manager, Harborview Specialty Distribution`,
    },
    {
      from: { name: "Elena Weber (QA Lead)", email: "qa@rheinfeld-bio.example" },
      to: RHEINFELD_DE,
      atH: 3,
      subject: "RE: Logger alarm on receipt - RB-24117",
      body: `Lena,

QA assessment for batch LMZ-2609-031 has started. We will compare the excursion with the stability data on file and issue a disposition shortly. Please keep the goods in quarantine until then.

Elena`,
    },
  ],
  expected: {
    qa: "released",
    claim: false,
    route: null,
    custodyAtExcursion: "forwarder",
    protectiveNotice: null,
    notes: "25 min at 9.2 °C during the dock transfer (forwarder custody). QA releases, so there is no damage and no claim; the policy would also exclude deviations under 60 minutes.",
  },
};

/* ------------------------------------------------------------------ Case B */

export const CASE_B: CaseSpec = {
  id: "demo-b",
  code: "B",
  scenario: "demo",
  title: "Excursion near FRA departure, discovered eight days late",
  shipmentRef: "RB-24093",
  product: {
    name: "Orenvacept 40 mg pre-filled syringe",
    description: "fusion protein, solution for injection",
    batch: "ORV-2608-112",
    units: 1_000,
    unitPriceEur: 200,
    packaging: "4 x active container (2-8 °C)",
  },
  valueEur: 200_000,
  weightKg: 120,
  pieces: 4,
  declaredValueEur: null,
  origin: { iata: "FRA", city: "Frankfurt" },
  destination: { iata: "BOS", city: "Boston" },
  incoterm: "FCA Marburg (Incoterms 2020)",
  awbNumber: "717-4821 3377",
  flight: "BO 404",
  loggerId: "CT5-88213",
  shipper: RHEINFELD_DE,
  forwarder: NORDSTAR,
  airline: BOREAL,
  consignee: HARBORVIEW,
  insurer: MERIDIAN,
  deliveredDaysAgo: 10,
  discoveredAfterH: 9 * 24 - 5,
  custody: fraBosChain(false),
  excursions: [{ startH: -40.1, minutes: 90, peakC: 13.0, shape: "hump" }],
  baseTempC: 5.1,
  contract: { ...NORDSTAR_CONTRACT },
  policy: { ...MERIDIAN_POLICY },
  handlingReport: {
    title: "Ground Handling Irregularity Report",
    issuer: FRA_RAMP,
    reference: "IRR-FRA-0417",
    atH: -37,
    lines: [
      "At {h:-40.5} four PIL/COL pieces for flight BO 404 (Boreal Air Cargo) were moved from the Boreal cool centre to apron position V114 for loading.",
      "The inbound aircraft was delayed by 1 h 50 min due to a technical issue. The pieces remained on the apron, exposed to ambient conditions (outside air temperature 14 °C, direct sun), until loading began at {h:-38.5}.",
      "No thermal covers were applied during the wait. The shipment was loaded and departed with the delayed flight.",
      "This report is filed on behalf of Boreal Air Cargo for internal quality review. Shipment RB-24093 / AWB 717-4821 3377 was among the affected pieces.",
    ],
  },
  emails: [
    {
      from: HARBORVIEW,
      to: RHEINFELD_DE,
      atH: 9 * 24 - 5,
      subject: "Temperature alarm - RB-24093 / AWB 717-4821 3377",
      body: `Dear Lena,

during our periodic review we downloaded the ColdTrace logger of shipment RB-24093, received on {date:0}. Our apologies: the logger was not read at goods receipt because of a staffing gap at our dock.

The logger shows an alarm on {date:-40}: maximum 13.0 °C, approx. 90 minutes above 8 °C. The goods are quarantined in our cold room pending your QA disposition. Logger file attached.

Kind regards,
Dana Whitfield
QA Manager, Harborview Specialty Distribution`,
    },
    {
      from: RHEINFELD_DE,
      to: NORDSTAR,
      atH: 9 * 24 - 3,
      subject: "Custody records requested - RB-24093",
      body: `Dear Markus,

the logger of RB-24093 shows an excursion to 13.0 °C on {date:-40}. Please send us the custody and handling records for this shipment under clause 5.3 of our agreement as soon as possible.

Best regards,
Lena Hartmann
Head of Distribution Logistics, Rheinfeld Biologics`,
    },
    {
      from: NORDSTAR,
      to: RHEINFELD_DE,
      atH: 9 * 24 - 1,
      subject: "RE: Custody records requested - RB-24093",
      body: `Dear Lena,

our records show the shipment was tendered to Boreal Air Cargo at FRA at {h:-45} and collected from Boreal at BOS at {h:-21}. Our hub and truck records for both legs are within 2-8 °C.

Boreal's ramp handler issued the attached irregularity report: the pieces were staged on apron V114 during an aircraft delay. Please note clause 4.3 of our agreement for the air leg. We are happy to support your notice to the carrier.

Kind regards,
Markus Feld
Claims Desk, NordStar Logistics`,
    },
  ],
  expected: {
    qa: "rejected",
    claim: true,
    route: "insurer",
    custodyAtExcursion: "airline",
    protectiveNotice: "carrier",
    notes: "Excursion on the FRA ramp in Boreal's custody. Montreal cap = 26 SDR x 120 kg (~EUR 3.7k) with NVD; the forwarder is passed through to the carrier (cl. 4.3) and its 7-day notice has lapsed. The insurer covers EUR 200k less EUR 10k deductible. Protective notice to the airline: 4 days left on Art. 31.",
  },
};

/* ------------------------------------------------------------------ Case C */

export const CASE_C: CaseSpec = {
  id: "demo-c",
  code: "C",
  scenario: "demo",
  title: "Long excursion before departure from AMS",
  shipmentRef: "RB-NL-7712",
  product: {
    name: "Ventralix quadrivalent vaccine",
    description: "cell-culture influenza vaccine, 0.5 mL PFS",
    batch: "VTX-2610-007",
    units: 2_500,
    unitPriceEur: 140,
    packaging: "6 x active container (2-8 °C)",
  },
  valueEur: 350_000,
  weightKg: 180,
  pieces: 6,
  declaredValueEur: null,
  origin: { iata: "AMS", city: "Amsterdam" },
  destination: { iata: "JFK", city: "New York" },
  incoterm: "FCA Leiden (Incoterms 2020)",
  awbNumber: "583-1190 2264",
  flight: "WW 118",
  loggerId: "CT5-90377",
  shipper: RHEINFELD_NL,
  forwarder: POLDER,
  airline: WESTWIND,
  consignee: HUDSON,
  insurer: LOWLANDS,
  deliveredDaysAgo: 2,
  discoveredAfterH: 2,
  custody: [
    {
      role: "shipper",
      custodian: RHEINFELD_NL.name,
      location: "Rheinfeld plant, Leiden - cold dock",
      activity: "Packed in active container, loaded onto reefer",
      fromH: -62,
      toH: -60.5,
      controlled: true,
    },
    {
      role: "forwarder",
      custodian: POLDER.name,
      location: "Road Leiden -> Schiphol (unit NL-PF 118)",
      activity: "Reefer truck, set point +5 °C",
      fromH: -60.5,
      toH: -59,
      controlled: true,
    },
    {
      role: "forwarder",
      custodian: POLDER.name,
      location: "Polder hub Schiphol - inbound floor area F3",
      activity: "Staged on warehouse floor awaiting cold-room slot (ambient)",
      fromH: -59,
      toH: -55,
      controlled: false,
      reference: "WMS loc F3-FLOOR",
    },
    {
      role: "forwarder",
      custodian: POLDER.name,
      location: "Polder hub Schiphol - cold room CR-02",
      activity: "Cold-room storage (2-8 °C)",
      fromH: -55,
      toH: -48,
      controlled: true,
      reference: "WMS loc CR-02-07",
    },
    {
      role: "airline",
      custodian: WESTWIND.name,
      location: "Westwind Cargo, AMS - cool centre",
      activity: "Acceptance and build-up (2-8 °C)",
      fromH: -48,
      toH: -44,
      controlled: true,
    },
    {
      role: "airline",
      custodian: WESTWIND.name,
      location: "Flight WW 118 AMS -> JFK",
      activity: "Flight, main deck set to +5 °C",
      fromH: -44,
      toH: -35.5,
      controlled: true,
    },
    {
      role: "airline",
      custodian: WESTWIND.name,
      location: "Westwind Cargo, JFK Building 151 - import cool room",
      activity: "Import handling and storage (2-8 °C)",
      fromH: -35.5,
      toH: -26,
      controlled: true,
    },
    {
      role: "forwarder",
      custodian: POLDER.name,
      location: "Polder US partner, Jamaica NY - cold room",
      activity: "Cold-room storage (2-8 °C)",
      fromH: -26,
      toH: -3,
      controlled: true,
    },
    {
      role: "forwarder",
      custodian: POLDER.name,
      location: "Road JFK -> Newark NJ",
      activity: "Reefer truck to consignee",
      fromH: -3,
      toH: 0,
      controlled: true,
    },
  ],
  excursions: [{ startH: -58.6, minutes: 225, peakC: 15.0, shape: "soak" }],
  baseTempC: 4.7,
  contract: {
    title: "Pharmaceutical Logistics Agreement - GDP Cold Chain Services",
    reference: "PFS-QA-2024-221",
    signedOn: "18 November 2024",
    governingLaw: "the laws of the Netherlands; courts of Amsterdam",
    coldRoomDuty: true,
    liabilityCap: { kind: "invoice_value" },
    airLegPassThrough: true,
    noticeDays: 7,
    excursionReportHours: 12,
  },
  policy: {
    policyNumber: "LCU-2026-NL-3310",
    title: "Cargo Insurance Policy - Temperature Controlled Goods",
    periodFrom: "1 Apr 2026",
    periodTo: "31 Mar 2027",
    deductibleEur: 25_000,
    temperatureCover: true,
    minDeviationMinutes: 0,
    noticeDays: 30,
    insuredPercentOfInvoice: 100,
  },
  handlingReport: {
    title: "Hub Movement Log - WMS Extract",
    issuer: POLDER,
    reference: "WMS-SPL-24-118377",
    atH: 20,
    lines: [
      "{h:-59}  INBOUND SCAN  dock 4 -> location F3-FLOOR (inbound staging, ambient)  6 pcs  operator 4471",
      "{h:-57}  INVENTORY CHECK  F3-FLOOR  6 pcs present  status: AWAITING CR SLOT",
      "{h:-55}  MOVE  F3-FLOOR -> CR-02-07 (cold room 2-8 °C)  6 pcs  operator 4471",
      "{h:-48}  OUTBOUND  CR-02-07 -> Westwind Cargo acceptance AMS  6 pcs  seal 0081374",
      "Remark: cold-room capacity constraint during peak week. Inbound staging time exceeded the 30-minute target.",
    ],
  },
  emails: [
    {
      from: HUDSON,
      to: RHEINFELD_NL,
      atH: 2,
      subject: "Temperature alarm at receipt - RB-NL-7712 / AWB 583-1190 2264",
      body: `Dear Joris,

shipment RB-NL-7712 arrived today ({date:0}). The ColdTrace logger shows a major alarm on {date:-59}: maximum 15.0 °C and almost 4 hours above 8 °C. All 6 pieces are quarantined pending your QA disposition. Logger file attached.

Regards,
Priya Raman
Quality Lead, Hudson Clinical Supply`,
    },
    {
      from: RHEINFELD_NL,
      to: POLDER,
      atH: 4,
      subject: "Excursion RB-NL-7712 - WMS records requested",
      body: `Dear Sanne,

the logger of RB-NL-7712 shows 15.0 °C at your Schiphol hub timeframe on {date:-59}. Please send the hub movement log under clause 5.3 within two business days, and explain why no excursion report was received under clause 5.2.

Regards,
Joris van Dam
Logistics Manager, Rheinfeld Biologics B.V.`,
    },
    {
      from: POLDER,
      to: RHEINFELD_NL,
      atH: 20,
      subject: "RE: Excursion RB-NL-7712 - WMS records requested",
      body: `Dear Joris,

please find attached the WMS extract. Due to peak volumes the shipment was staged on inbound floor F3 for approx. 4 hours before a cold-room slot became available in CR-02. We regret this and are investigating internally.

Kind regards,
Sanne de Wit
Operations Manager, Polder Freight Solutions`,
    },
  ],
  expected: {
    qa: "rejected",
    claim: true,
    route: "forwarder",
    custodyAtExcursion: "forwarder",
    protectiveNotice: "forwarder",
    notes: "4 h on the hub floor breaches cl. 3.2 (cold room only). Liability up to invoice value (cl. 6.2): EUR 350k in full, versus insurer EUR 325k after deductible. Contract notice 7 days from delivery: 5 days left, so protective notice on day 2.",
  },
};

export const DEMO_CASES: CaseSpec[] = [CASE_A, CASE_B, CASE_C];
