import "server-only";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { Citation } from "@/lib/domain/citation";
import { formatDate, formatDateTime, formatDuration, formatEUR, formatTemp } from "@/lib/format";
import type { CaseRecord } from "@/lib/case/record";
import { A4, DocBuilder, winAnsi } from "@/seed/pdf/kit";

/**
 * Evidence pack: one exportable PDF with the case summary, the temperature ×
 * custody chart (drawn natively), the logger extract, the citation index, the
 * cited source pages and the claim letter.
 */

export interface EvidenceInput {
  caseRef: string;
  title: string;
  record: CaseRecord;
  readings: { row: number; at: Date; t: number }[];
  letter: { subject: string; body: string; recipient: string; amountEur: number | null } | null;
  citations: Citation[];
  /** Source PDFs whose cited pages are appended */
  sources: { documentId: string; title: string; bytes: Uint8Array; pages: number[] }[];
  generatedAt: Date;
}

const ROLE_COLOR = {
  shipper: rgb(0.58, 0.64, 0.72),
  forwarder: rgb(0.03, 0.57, 0.7),
  airline: rgb(0.39, 0.4, 0.95),
  consignee: rgb(0.28, 0.33, 0.41),
} as const;

export async function buildEvidencePack(input: EvidenceInput): Promise<{ bytes: Uint8Array; pages: number }> {
  const r = input.record;
  const d = await DocBuilder.create({
    title: "Evidence pack",
    letterhead: { name: "Kelvin - Claim evidence pack", lines: [`${input.caseRef} | ${input.title}`, `Generated ${formatDateTime(input.generatedAt)} UTC. Decision support only, not legal advice.`], accent: rgb(0.31, 0.27, 0.9) },
    docRef: `Evidence pack ${input.caseRef}`,
  });

  /* ---------- summary ---------- */
  const ex = r.excursions?.find((e) => e.direction === "high") ?? r.excursions?.[0];
  const top = r.ranking?.find((x) => x.recommended);
  d.title("Evidence pack", `Shipment ${input.caseRef}`);
  d.heading("Summary");
  d.kv([
    ["Air waybill", `${r.shipment?.awbNumber ?? "-"}  (${r.shipment?.origin ?? ""} -> ${r.shipment?.destination ?? ""}, ${r.shipment?.flight ?? ""})`],
    ["Value / weight", `${r.shipment?.valueEur != null ? formatEUR(r.shipment.valueEur) : "-"} / ${r.shipment?.weightKg ?? "-"} kg, declared value for carriage ${r.shipment?.declaredValueEur != null ? formatEUR(r.shipment.declaredValueEur) : "NVD"}`],
    ["Excursion", ex ? `${formatDuration(ex.minutes)} above 8 °C, peak ${formatTemp(ex.peakC)}, ${formatDateTime(ex.start)}-${formatDateTime(ex.end)} UTC [${ex.citationId}]` : "none"],
    ["Custody at excursion", r.custody?.attribution ? `${r.custody.attribution.custodian} (${r.custody.attribution.role}) - ${r.custody.attribution.location}` : "-"],
    ["QA disposition", r.qa?.status ?? "pending"],
    ["Recommended route", top ? `${top.route} - ${formatEUR(top.recoverableEur)}` : "-"],
  ]);

  /* ---------- chart ---------- */
  d.heading("Temperature and custody");
  d.ensure(230);
  const page = d.page;
  const X0 = 64 + 34;
  const W = A4.w - 128 - 40;
  const H = 150;
  const Y0 = d.y - H;
  const rows = input.readings;
  const tMin = rows[0].at.getTime();
  const tMax = rows[rows.length - 1].at.getTime();
  const vMin = Math.min(0, ...rows.map((x) => x.t)) ;
  const vMax = Math.max(16, ...rows.map((x) => x.t));
  const px = (t: number) => X0 + ((t - tMin) / (tMax - tMin)) * W;
  const py = (v: number) => Y0 + ((v - vMin) / (vMax - vMin)) * H;
  // 2–8 °C band
  page.drawRectangle({ x: X0, y: py(2), width: W, height: py(8) - py(2), color: rgb(0.88, 0.95, 0.99) });
  page.drawRectangle({ x: X0, y: Y0, width: W, height: H, borderColor: rgb(0.85, 0.87, 0.9), borderWidth: 0.6 });
  for (const v of [0, 2, 8, 12, 16]) {
    if (v > vMax) continue;
    page.drawText(`${v}°`, { x: X0 - 22, y: py(v) - 3, size: 7, font: d.font, color: rgb(0.4, 0.45, 0.52) });
    page.drawLine({ start: { x: X0, y: py(v) }, end: { x: X0 + W, y: py(v) }, thickness: 0.3, color: rgb(0.9, 0.91, 0.93) });
  }
  // excursion highlight
  for (const e of r.excursions ?? []) {
    const x1 = px(new Date(e.start).getTime());
    const x2 = px(new Date(e.end).getTime());
    page.drawRectangle({ x: x1, y: Y0, width: Math.max(1.5, x2 - x1), height: H, color: rgb(1, 0.93, 0.8), opacity: 0.8 });
  }
  // line
  for (let i = 1; i < rows.length; i++) {
    page.drawLine({
      start: { x: px(rows[i - 1].at.getTime()), y: py(rows[i - 1].t) },
      end: { x: px(rows[i].at.getTime()), y: py(rows[i].t) },
      thickness: 1,
      color: rows[i].t > 8 ? rgb(0.85, 0.47, 0.02) : rgb(0.31, 0.27, 0.9),
    });
  }
  // custody bands
  const bandY = Y0 - 22;
  for (const s of r.custody?.segments ?? []) {
    const x1 = Math.max(X0, px(new Date(s.from).getTime()));
    const x2 = Math.min(X0 + W, px(new Date(s.to).getTime()));
    if (x2 <= x1) continue;
    page.drawRectangle({ x: x1, y: bandY, width: x2 - x1, height: 12, color: ROLE_COLOR[s.role] ?? rgb(0.6, 0.6, 0.6) });
  }
  let lx = X0;
  for (const role of ["shipper", "forwarder", "airline", "consignee"] as const) {
    page.drawRectangle({ x: lx, y: bandY - 16, width: 8, height: 8, color: ROLE_COLOR[role] });
    page.drawText(role, { x: lx + 11, y: bandY - 15, size: 7.5, font: d.font, color: rgb(0.28, 0.33, 0.41) });
    lx += 72;
  }
  page.drawText(`${formatDateTime(rows[0].at)} UTC`, { x: X0, y: Y0 - 48, size: 7, font: d.font, color: rgb(0.4, 0.45, 0.52) });
  const endLabel = `${formatDateTime(rows[rows.length - 1].at)} UTC`;
  page.drawText(endLabel, { x: X0 + W - d.font.widthOfTextAtSize(endLabel, 7), y: Y0 - 48, size: 7, font: d.font, color: rgb(0.4, 0.45, 0.52) });
  d.y = Y0 - 64;

  /* ---------- logger extract ---------- */
  if (ex) {
    d.heading(`Logger extract (rows ${ex.rowStart}-${ex.rowEnd}) [${ex.citationId}]`);
    const slice = rows.filter((x) => x.row >= ex.rowStart - 2 && x.row <= ex.rowEnd + 2);
    d.table(
      [
        { header: "Row", width: 40 },
        { header: "Timestamp (UTC)", width: 140 },
        { header: "Temp (°C)", width: 60, align: "right" },
        { header: "", width: 120 },
      ],
      slice.map((x) => [String(x.row), x.at.toISOString().replace("T", " ").slice(0, 16), x.t.toFixed(1), x.t > 8 ? "above range" : ""]),
      { size: 7.5 },
    );
  }

  /* ---------- citation index ---------- */
  d.heading("Citation index");
  d.table(
    [
      { header: "Id", width: 34 },
      { header: "Source", width: 150 },
      { header: "Quote / detail", width: 290 },
    ],
    input.citations.map((c) => [c.id ?? "-", c.label, (c.quote ?? c.title ?? "").slice(0, 220)]),
    { size: 7.5 },
  );

  /* ---------- letter ---------- */
  if (input.letter) {
    d.newPage();
    d.heading(`Claim letter to ${input.letter.recipient}`);
    d.para(input.letter.subject, { font: "bold" });
    for (const p of input.letter.body.split(/\n\s*\n/)) d.para(p, { size: 9 });
  }

  /* ---------- correspondence placeholder + appended pages ---------- */
  const base = await d.finish();
  const out = await PDFDocument.load(base.bytes);
  const font = await out.embedFont(StandardFonts.HelveticaBold);
  for (const s of input.sources) {
    if (!s.pages.length) continue;
    const src = await PDFDocument.load(s.bytes);
    const idx = s.pages.map((p) => p - 1).filter((p) => p >= 0 && p < src.getPageCount());
    const copied = await out.copyPages(src, idx);
    copied.forEach((pg, i) => {
      out.addPage(pg);
      pg.drawRectangle({ x: 0, y: A4.h - 20, width: A4.w, height: 20, color: rgb(0.31, 0.27, 0.9) });
      pg.drawText(winAnsi(`Annex - ${s.title}, page ${idx[i] + 1}`), { x: 12, y: A4.h - 14, size: 8, font, color: rgb(1, 1, 1) });
    });
  }
  const bytes = await out.save();
  return { bytes, pages: out.getPageCount() };
}

export function evidenceSummaryLine(r: CaseRecord): string {
  const ex = r.excursions?.[0];
  return ex ? `${formatTemp(ex.peakC)} peak, ${formatDuration(ex.minutes)} above range, ${formatDate(ex.start)}` : "No excursion";
}
