import type { CaseSpec } from "../spec";
import { ACCENTS, DocBuilder, partyLines } from "./kit";

/** Forwarder's Logistics Services Agreement: numbered clauses across several pages. */
export async function contractPdf(spec: CaseSpec) {
  const c = spec.contract;
  const fw = spec.forwarder;
  const cu = spec.shipper;
  const d = await DocBuilder.create({
    title: c.title,
    letterhead: { name: fw.name, lines: partyLines(fw), accent: ACCENTS.forwarder },
    docRef: c.reference,
    confidential: true,
  });

  d.title(c.title, `Agreement ref. ${c.reference}  |  Signed ${c.signedOn}`);
  d.para("This agreement (the \"Agreement\") is made between:");
  d.kv(
    [
      ["Customer", `${cu.name}, ${cu.address.join(", ")}`],
      ["Forwarder", `${fw.name}, ${fw.address.join(", ")}`],
    ],
    90,
  );
  d.heading("Recitals");
  d.clause("A.", null, "The Customer manufactures biopharmaceutical products that must be stored and transported at +2 °C to +8 °C.");
  d.clause(
    "B.",
    null,
    "The Forwarder provides forwarding, warehousing and transport services for temperature-sensitive pharmaceutical goods in accordance with Good Distribution Practice.",
  );

  d.heading("1. Definitions");
  d.clause("1.1", "Goods", "Pharmaceutical products tendered by the Customer to the Forwarder under this Agreement.");
  d.clause(
    "1.2",
    "Temperature Range",
    "+2 °C to +8 °C, unless a different range is stated on the air waybill or the Customer's written shipping instructions.",
  );
  d.clause(
    "1.3",
    "Temperature Excursion",
    "Any recorded temperature outside the Temperature Range, as measured by the data logger accompanying the Goods.",
  );
  d.clause(
    "1.4",
    "Custody",
    "The period during which the Goods are in the possession of the Forwarder or of any Subcontractor appointed by it, from acceptance at the Customer's premises until Delivery.",
  );
  d.clause("1.5", "Delivery", "Handover of the Goods to the consignee, evidenced by a signed proof of delivery.");
  d.clause(
    "1.6",
    "Subcontractor",
    "Any road carrier, warehouse operator, handling agent or air carrier engaged by the Forwarder to perform part of the services.",
  );

  d.heading("2. Scope of services");
  d.clause(
    "2.1",
    "Services",
    "The Forwarder shall arrange door-to-door transport of the Goods, including collection, road feeder service, hub handling and storage, booking of air carriage, import handling and final delivery.",
  );
  d.clause(
    "2.2",
    "Capacity",
    "The Forwarder acts as principal for road transport and hub operations and as contracting party towards air carriers for air carriage booked on the Customer's behalf.",
  );
  d.clause("2.3", "Standards", "All services shall be performed in accordance with the EU Guidelines on Good Distribution Practice (2013/C 343/01).");

  d.heading("3. Temperature control and service levels");
  d.clause(
    "3.1",
    "Temperature Range",
    "The Forwarder shall keep the Goods within the Temperature Range at all times while they are in its Custody, using qualified and validated equipment.",
  );
  d.clause(
    "3.2",
    "Hub storage",
    c.coldRoomDuty
      ? "At all Forwarder hubs and warehouses the Goods shall be stored exclusively in qualified cold rooms maintained at +2 °C to +8 °C. The Goods shall not be staged in ambient areas, on docks or on warehouse floors for longer than 30 minutes in aggregate per hub."
      : "At Forwarder hubs the Goods shall be stored in temperature-controlled areas where available. Where no such area is available the Forwarder shall use reasonable endeavours to minimise ambient exposure.",
  );
  d.clause(
    "3.3",
    "Road transport",
    "Road vehicles shall be pre-conditioned refrigerated units with a set point of +5 °C and continuous temperature recording.",
  );
  d.clause(
    "3.4",
    "Transfers",
    "Each transfer of the Goods between vehicles, hubs or carriers shall be completed within 20 minutes through sealed dock doors.",
  );
  d.clause(
    "3.5",
    "Air carriage",
    "The Forwarder shall book temperature-controlled air services and give the air carrier written handling instructions \"KEEP 2-8 °C\". While the Goods are in the air carrier's custody the Forwarder monitors but does not physically control the Goods.",
  );

  d.heading("4. Subcontracting");
  d.clause("4.1", "Approval", "The Forwarder may engage Subcontractors listed in Schedule 2 or approved in writing by the Customer.");
  d.clause(
    "4.2",
    "Responsibility",
    "The Forwarder is responsible for the acts and omissions of its road and warehouse Subcontractors as if they were its own.",
  );
  d.clause(
    "4.3",
    "Air carriers",
    c.airLegPassThrough
      ? "In respect of carriage by air performed by an air carrier, the Forwarder's liability shall not exceed the amount the Forwarder is able to recover from that air carrier under the Montreal Convention 1999 or other applicable air law. On request, the Forwarder shall assign to the Customer its rights of action against the air carrier."
      : "The Forwarder remains liable for the acts and omissions of air carriers it engages as if they were its own, subject to the limits in clause 6.",
  );

  d.heading("5. Monitoring, reporting and records");
  d.clause("5.1", "Data loggers", "Each shipment carries a data logger supplied by the Customer. The Forwarder shall not stop, remove or obstruct it.");
  d.clause(
    "5.2",
    "Excursion reporting",
    `The Forwarder shall notify the Customer in writing of any known or suspected Temperature Excursion within ${c.excursionReportHours} hours of becoming aware of it.`,
  );
  d.clause(
    "5.3",
    "Records",
    "The Forwarder shall keep handling records (warehouse management scans, vehicle temperature records, proof of delivery) for three years and produce them within two business days of a request.",
  );

  d.heading("6. Liability");
  d.clause(
    "6.1",
    "Basis",
    "The Forwarder is liable for loss of or damage to the Goods, including damage resulting from a Temperature Excursion, occurring while the Goods are in its Custody, unless it proves that the loss arose from circumstances it could not avoid and whose consequences it could not prevent.",
  );
  const cap = c.liabilityCap;
  d.clause(
    "6.2",
    "Limit of liability",
    cap.kind === "invoice_value"
      ? "For loss or damage resulting from a breach of clause 3 (Temperature control and service levels), the Forwarder's liability shall be limited to the invoice value of the affected Goods, as evidenced by the Customer's commercial invoice."
      : cap.kind === "sdr_per_kg"
        ? `The Forwarder's liability shall be limited to ${cap.sdrPerKg} Special Drawing Rights (SDR) per kilogram of gross weight of the Goods lost or damaged.`
        : `The Forwarder's aggregate liability per shipment shall not exceed EUR ${cap.eur.toLocaleString("en-GB")}.`,
  );
  d.clause(
    "6.3",
    "Damaged goods",
    "Goods that the Customer's Quality Assurance rejects as a result of a Temperature Excursion are deemed damaged. The Customer's documented QA decision is conclusive in the absence of manifest error.",
  );
  d.clause("6.4", "Consequential loss", "Neither party is liable for loss of profit, loss of market or other indirect or consequential loss.");
  d.clause("6.5", "Wilful misconduct", "The limits in this clause 6 do not apply to loss caused by wilful misconduct or gross negligence.");

  d.heading("7. Claims and notice");
  d.clause(
    "7.1",
    "Notice of claim",
    `The Customer shall give written notice of any claim, or of circumstances that may give rise to a claim, within ${c.noticeDays} days of Delivery. Such notice may reserve the Customer's rights pending its quality assessment and need not state the final amount claimed.`,
  );
  d.clause(
    "7.2",
    "Substantiation",
    "Within 90 days of the notice, the Customer shall provide the logger data, the QA disposition and the commercial invoice for the affected Goods.",
  );
  d.clause("7.3", "Time bar", "Any claim is barred unless legal proceedings are commenced within one year of Delivery.");
  d.clause("7.4", "Form", `Notices shall be sent by email to the claims address in Schedule 1 (${fw.email}).`);

  d.heading("8. Insurance");
  d.clause("8.1", "Liability insurance", "The Forwarder shall maintain forwarder's liability insurance with a minimum cover of EUR 2,000,000 per event.");
  d.clause(
    "8.2",
    "Cargo insurance",
    "The Customer arranges cargo insurance for the Goods. The Forwarder is not obliged to insure the Goods unless instructed in writing.",
  );

  d.heading("9. Exclusions");
  d.clause(
    "9.1",
    "Excluded causes",
    "The Forwarder is not liable to the extent a Temperature Excursion is caused by (a) packaging supplied by the Customer that is unsuitable or not validated for the route, (b) incorrect temperature instructions given by the Customer, (c) inherent vice of the Goods, or (d) force majeure.",
  );

  d.heading("10. Governing law");
  d.clause("10.1", null, `This Agreement is governed by ${c.governingLaw}.`);

  d.heading("Schedule 1 - Contacts");
  d.kv([
    ["Forwarder claims", `${fw.contact ?? "Claims Desk"}, ${fw.email}`],
    ["Customer logistics", `${cu.contact ?? "Logistics"}, ${cu.email}`],
  ]);
  d.heading("Schedule 2 - Key performance indicators");
  d.table(
    [
      { header: "KPI", width: 260 },
      { header: "Target", width: 120 },
      { header: "Clause", width: 60 },
    ],
    [
      ["Transfer time between vehicles / hubs / carriers", "<= 20 minutes", "3.4"],
      ["Ambient exposure at hubs (aggregate)", c.coldRoomDuty ? "<= 30 minutes" : "best endeavours", "3.2"],
      ["Excursion report to Customer", `<= ${c.excursionReportHours} hours`, "5.2"],
      ["Proof of delivery available", "<= 24 hours", "1.5"],
    ],
  );
  d.signature([`For ${cu.name}`, cu.contact ?? "Authorised signatory"]);
  d.signature([`For ${fw.name}`, fw.contact ?? "Authorised signatory"]);
  return d.finish();
}
