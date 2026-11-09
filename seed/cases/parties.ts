import type { Party } from "../spec";

/**
 * Fictional organisations. All email domains use the reserved .example TLD:
 * nothing can ever be delivered anywhere.
 */

export const RHEINFELD_DE: Party = {
  name: "Rheinfeld Biologics GmbH",
  short: "Rheinfeld",
  address: ["Emil-von-Behring-Str. 41", "35041 Marburg", "Germany"],
  email: "logistics@rheinfeld-bio.example",
  contact: "Lena Hartmann, Head of Distribution Logistics",
  phone: "+49 6421 555 0140",
};

export const RHEINFELD_NL: Party = {
  name: "Rheinfeld Biologics B.V.",
  short: "Rheinfeld NL",
  address: ["Zernikedreef 12", "2333 CL Leiden", "Netherlands"],
  email: "logistics-nl@rheinfeld-bio.example",
  contact: "Joris van Dam, Logistics Manager",
  phone: "+31 71 555 0270",
};

export const NORDSTAR: Party = {
  name: "NordStar Logistics GmbH",
  short: "NordStar",
  address: ["Cargo City Sued, Gebaeude 552", "60549 Frankfurt am Main", "Germany"],
  email: "claims@nordstar-logistics.example",
  contact: "Markus Feld, Claims Desk",
  phone: "+49 69 555 2290",
};

export const POLDER: Party = {
  name: "Polder Freight Solutions B.V.",
  short: "Polder Freight",
  address: ["Pelikaanweg 31", "1118 DR Schiphol", "Netherlands"],
  email: "claims@polderfreight.example",
  contact: "Sanne de Wit, Operations Manager",
  phone: "+31 20 555 0815",
};

export const BOREAL: Party = {
  name: "Boreal Air Cargo",
  short: "Boreal",
  address: ["Cargo Claims Department", "Cargo City Nord, Gebaeude 458", "60549 Frankfurt am Main, Germany"],
  email: "cargo.claims@borealaircargo.example",
  contact: "Cargo Claims Department",
};

export const WESTWIND: Party = {
  name: "Westwind Cargo Airlines",
  short: "Westwind",
  address: ["Cargo Claims, Building 151", "JFK International Airport", "Jamaica, NY 11430, USA"],
  email: "claims@westwindcargo.example",
  contact: "Cargo Claims",
};

export const HARBORVIEW: Party = {
  name: "Harborview Specialty Distribution Inc.",
  short: "Harborview",
  address: ["200 Seaport Blvd, Suite 400", "Boston, MA 02210", "USA"],
  email: "qa@harborview-dist.example",
  contact: "Dana Whitfield, QA Manager",
};

export const HUDSON: Party = {
  name: "Hudson Clinical Supply LLC",
  short: "Hudson Clinical",
  address: ["85 Raymond Blvd", "Newark, NJ 07102", "USA"],
  email: "quality@hudsonclinical.example",
  contact: "Priya Raman, Quality Lead",
};

export const MERIDIAN: Party = {
  name: "Meridian Marine & Cargo Insurance SE",
  short: "Meridian",
  address: ["Ballindamm 17", "20095 Hamburg", "Germany"],
  email: "cargo.claims@meridian-marine.example",
  contact: "Marine Cargo Claims",
};

export const LOWLANDS: Party = {
  name: "Lowlands Cargo Underwriters N.V.",
  short: "Lowlands",
  address: ["Wilhelminakade 91", "3072 AP Rotterdam", "Netherlands"],
  email: "claims@lowlands-cargo.example",
  contact: "Cargo Claims Team",
};

export const FRA_RAMP: Party = {
  name: "FRA Ramp Services GmbH",
  short: "FRA Ramp",
  address: ["Tor 31, Gebaeude 401", "60549 Frankfurt am Main", "Germany"],
  email: "ops@fra-ramp.example",
  contact: "Duty Ramp Manager (handling agent for Boreal Air Cargo)",
};

/** Contract and policy terms shared across the Rheinfeld DE shipments. */
export const NORDSTAR_CONTRACT = {
  title: "Logistics Services Agreement - Temperature-Controlled Pharmaceutical Freight",
  reference: "NS-LSA-2025-014",
  signedOn: "3 March 2025",
  governingLaw: "the laws of the Federal Republic of Germany; courts of Frankfurt am Main",
  coldRoomDuty: true,
  liabilityCap: { kind: "sdr_per_kg", sdrPerKg: 8.33 },
  airLegPassThrough: true,
  noticeDays: 7,
  excursionReportHours: 24,
} as const;

export const MERIDIAN_POLICY = {
  policyNumber: "MCI-OC-2026-00871",
  title: "Marine Cargo Open Cover - Pharmaceutical Transit",
  periodFrom: "1 Jan 2026",
  periodTo: "31 Dec 2026",
  deductibleEur: 10_000,
  temperatureCover: true,
  minDeviationMinutes: 60,
  noticeDays: 30,
  insuredPercentOfInvoice: 100,
} as const;
