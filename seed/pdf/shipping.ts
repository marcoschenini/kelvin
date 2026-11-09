import { rgb } from "pdf-lib";
import { formatEUR } from "@/lib/format";
import type { CaseSpec } from "../spec";
import { atHours, awbDate, isoMinute, longDate, resolveTemplate } from "../time";
import { A4, ACCENTS, DocBuilder, partyLines, winAnsi } from "./kit";

/* ----------------------------------------------------------------- AWB form */

export async function awbPdf(spec: CaseSpec, delivery: Date) {
  const d = await DocBuilder.create({
    title: "Air Waybill",
    letterhead: {
      name: `${spec.airline.name} - Air Waybill`,
      lines: [
        "Not negotiable. Issued by the carrier named below, subject to its conditions of contract.",
        `Cargo claims: ${spec.airline.email}`,
      ],
      accent: ACCENTS.airline,
    },
    docRef: `AWB ${spec.awbNumber}`,
  });
  const page = d.page;
  const flightSeg = spec.custody.find((c) => c.activity.toLowerCase().startsWith("flight"));
  const flightDate = flightSeg ? atHours(delivery, flightSeg.fromH) : delivery;
  const accept = spec.custody.find((c) => c.role === "airline");
  const executed = accept ? atHours(delivery, accept.fromH) : flightDate;
  const ink = rgb(0.09, 0.11, 0.16);
  const muted = rgb(0.4, 0.45, 0.52);
  const line = rgb(0.75, 0.78, 0.82);

  const top = d.y;
  const L = 64;
  const W = A4.w - 128;
  const box = (x: number, y: number, w: number, h: number, label: string, value: string | string[], size = 9) => {
    page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: line, borderWidth: 0.6 });
    page.drawText(winAnsi(label.toUpperCase()), { x: x + 5, y: y - 10, size: 6, font: d.bold, color: muted });
    const vals = Array.isArray(value) ? value : [value];
    vals.forEach((v, i) =>
      page.drawText(winAnsi(v), { x: x + 5, y: y - 22 - i * (size + 2.5), size, font: i === 0 ? d.bold : d.font, color: ink }),
    );
  };

  const half = W / 2;
  box(L, top, half, 30, "Air waybill number", spec.awbNumber, 12);
  box(L + half, top, half, 30, "Issuing carrier", spec.airline.name, 10);
  box(L, top - 30, half, 70, "Shipper's name and address", [spec.shipper.name, ...spec.shipper.address]);
  box(L + half, top - 30, half, 70, "Consignee's name and address", [spec.consignee.name, ...spec.consignee.address]);
  box(L, top - 100, half, 46, "Issuing carrier's agent", [spec.forwarder.name, spec.forwarder.address[spec.forwarder.address.length - 1]]);
  box(L + half, top - 100, half, 46, "Accounting information", ["Freight prepaid", `Shipment ref. ${spec.shipmentRef}`]);
  const q = W / 4;
  box(L, top - 146, q, 34, "Airport of departure", `${spec.origin.iata} ${spec.origin.city}`);
  box(L + q, top - 146, q, 34, "Airport of destination", `${spec.destination.iata} ${spec.destination.city}`);
  box(L + 2 * q, top - 146, q, 34, "Flight / date", `${spec.flight} / ${awbDate(flightDate)}`);
  box(L + 3 * q, top - 146, q, 34, "Currency", "EUR");
  box(
    L,
    top - 180,
    half,
    34,
    "Declared value for carriage",
    spec.declaredValueEur == null ? "NVD" : formatEUR(spec.declaredValueEur),
    12,
  );
  box(L + half, top - 180, q, 34, "Declared value for customs", formatEUR(spec.valueEur));
  box(L + half + q, top - 180, q, 34, "Amount of insurance", "XXX");
  box(L, top - 214, W, 46, "Handling information", [
    `KEEP REFRIGERATED +2 °C TO +8 °C. DO NOT FREEZE. SHC: PIL COL.`,
    `Data logger ${spec.loggerId} enclosed. Notify consignee on arrival.`,
  ]);

  // Goods table
  const ty = top - 270;
  const cols = [
    { h: "Pieces", w: 50 },
    { h: "Gross weight", w: 80 },
    { h: "kg/lb", w: 40 },
    { h: "Chargeable wt", w: 80 },
    { h: "Nature and quantity of goods", w: W - 250 },
  ];
  let cx = L;
  for (const c of cols) {
    page.drawRectangle({ x: cx, y: ty - 70, width: c.w, height: 70, borderColor: line, borderWidth: 0.6 });
    page.drawText(winAnsi(c.h.toUpperCase()), { x: cx + 5, y: ty - 10, size: 6, font: d.bold, color: muted });
    cx += c.w;
  }
  const vals = [String(spec.pieces), spec.weightKg.toFixed(1), "K", (Math.ceil(spec.weightKg * 1.15 * 2) / 2).toFixed(1)];
  cx = L;
  vals.forEach((v, i) => {
    page.drawText(v, { x: cx + 5, y: ty - 26, size: 10, font: d.bold, color: ink });
    cx += cols[i].w;
  });
  const nature = [spec.product.name, spec.product.packaging, `Batch ${spec.product.batch}`, "Pharmaceuticals, not restricted"];
  nature.forEach((v, i) =>
    page.drawText(winAnsi(v), { x: cx + 5, y: ty - 26 - i * 11, size: i === 0 ? 9.5 : 8.5, font: i === 0 ? d.bold : d.font, color: ink }),
  );

  d.y = ty - 90;
  d.para(
    "NOTICE CONCERNING CARRIER'S LIMITATION OF LIABILITY. If the carriage involves an ultimate destination or stop in a country other than the country of departure, the Montreal Convention may be applicable. It governs and in most cases limits the liability of carriers for destruction, loss, damage or delay to cargo. The shipper may increase the limitation of liability by declaring a higher value for carriage and paying a supplemental charge if required.",
    { size: 7.5, color: muted },
  );
  d.para(
    "Notice of complaint: in case of damage, the person entitled to delivery must complain to the carrier forthwith after discovery of the damage and, at the latest, within 14 days from the date of receipt of the cargo.",
    { size: 7.5, color: muted },
  );
  d.space(8);
  d.kv(
    [
      ["Executed on", `${longDate(executed)} at ${spec.origin.city}`],
      ["Signature of issuing carrier", `${spec.airline.name} (acceptance ${isoMinute(executed)} UTC)`],
    ],
    170,
  );
  return d.finish();
}

/* ------------------------------------------------------------ Commercial invoice */

export async function invoicePdf(spec: CaseSpec, delivery: Date) {
  const s = spec.shipper;
  const d = await DocBuilder.create({
    title: "Commercial Invoice",
    letterhead: { name: s.name, lines: partyLines(s), accent: ACCENTS.shipper },
    docRef: `Invoice CI-${spec.shipmentRef}`,
  });
  const pickup = atHours(delivery, Math.min(...spec.custody.map((c) => c.fromH)));
  d.title("Commercial Invoice", `Invoice no. CI-${spec.shipmentRef}  |  ${longDate(pickup)}`);
  d.kv([
    ["Seller", `${s.name}, ${s.address.join(", ")}`],
    ["Buyer / consignee", `${spec.consignee.name}, ${spec.consignee.address.join(", ")}`],
    ["Shipment reference", spec.shipmentRef],
    ["Air waybill", `${spec.awbNumber} (${spec.origin.iata} -> ${spec.destination.iata}, ${spec.flight})`],
    ["Incoterm", spec.incoterm],
    ["Payment terms", "60 days net"],
  ]);
  d.heading("Goods");
  d.table(
    [
      { header: "Description", width: 220 },
      { header: "Batch", width: 80 },
      { header: "Qty", width: 50, align: "right" },
      { header: "Unit price", width: 80, align: "right" },
      { header: "Amount", width: 90, align: "right" },
    ],
    [
      [
        `${spec.product.name} - ${spec.product.description}`,
        spec.product.batch,
        spec.product.units.toLocaleString("en-GB"),
        formatEUR(spec.product.unitPriceEur),
        formatEUR(spec.valueEur),
      ],
    ],
  );
  d.kv(
    [
      ["Total invoice value", formatEUR(spec.valueEur)],
      ["Gross weight", `${spec.weightKg.toFixed(1)} kg in ${spec.pieces} temperature-controlled container(s)`],
      ["Storage condition", "+2 °C to +8 °C. Do not freeze."],
    ],
    150,
  );
  d.para("We certify that this invoice is true and correct and that the goods are of the origin stated.", { size: 8.5, font: "italic" });
  d.signature([s.contact ?? "Export Administration", s.name]);
  return d.finish();
}

/* ----------------------------------------------------- Handling / irregularity report */

export async function handlingReportPdf(spec: CaseSpec, delivery: Date) {
  const r = spec.handlingReport!;
  const d = await DocBuilder.create({
    title: r.title,
    letterhead: { name: r.issuer.name, lines: partyLines(r.issuer), accent: ACCENTS.handler },
    docRef: r.reference,
  });
  d.title(r.title, `Ref. ${r.reference}  |  Issued ${isoMinute(atHours(delivery, r.atH))} UTC`);
  d.kv([
    ["Shipment", `${spec.shipmentRef} / AWB ${spec.awbNumber}`],
    ["Flight", spec.flight],
    ["Pieces / weight", `${spec.pieces} / ${spec.weightKg.toFixed(1)} kg`],
  ]);
  d.heading("Record");
  for (const l of r.lines) d.para(resolveTemplate(l, delivery));
  d.signature([r.issuer.contact ?? "Duty manager", r.issuer.name]);
  return d.finish();
}
