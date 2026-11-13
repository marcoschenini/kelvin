import type { CaseRow } from "@/lib/db/schema";
import type { Citation } from "@/lib/domain/citation";
import type { RecoveryRoute } from "@/lib/domain/parties";
import { formatDate, formatDuration, formatEUR, formatTemp, formatTime } from "@/lib/format";
import type { CaseRecord } from "@/lib/case/record";
import type { Deadline, RankedRoute } from "@/lib/rules/types";
import type { Counterparty } from "./parties";

/**
 * Letter templates. Every factual paragraph carries [S#] tags pointing at the
 * case's citation registry. The live agent may write its own body instead; the
 * same validator checks both.
 */

const t = (id: string | undefined) => (id ? ` [${id}]` : "");
const ts = (...ids: (string | undefined)[]) => ids.filter(Boolean).map((id) => ` [${id}]`).join("");

interface LetterContext {
  record: CaseRecord;
  row: CaseRow;
  to: Counterparty;
  signer: { name: string; title: string };
  today: Date;
}

function header(ctx: LetterContext) {
  const s = ctx.record.shipment ?? {};
  return `Air waybill ${s.awbNumber ?? ctx.row.awbNumber ?? "n/a"} | Flight ${s.flight ?? "n/a"} ${s.origin ?? ctx.row.origin ?? ""}–${s.destination ?? ctx.row.destination ?? ""} | Shipment ${ctx.row.shipmentRef}`;
}

function span(start: string, end: string) {
  const a = new Date(start);
  const b = new Date(end);
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
    ? `on ${formatDate(a)} between ${formatTime(a)} and ${formatTime(b)} UTC`
    : `between ${formatDate(a)} ${formatTime(a)} and ${formatDate(b)} ${formatTime(b)} UTC`;
}

function facts(ctx: LetterContext) {
  const r = ctx.record;
  const ex = r.excursions?.find((e) => e.direction === "high") ?? r.excursions?.[0];
  const attr = r.custody?.attribution;
  const s = r.shipment ?? {};
  const delivered = ctx.row.deliveredAt ?? (s.deliveredAt ? new Date(s.deliveredAt) : null);
  const parts: string[] = [];
  parts.push(
    `The consignment of ${ctx.row.product ?? "pharmaceutical products"} (${s.weightKg ?? ctx.row.weightKg ?? "?"} kg) was carried under the air waybill above and received by the consignee on ${delivered ? formatDate(delivered) : "the date of delivery"}.${ts(s.citations?.awb, attr?.citationIds?.[1])}`,
  );
  if (ex) {
    parts.push(
      `The accompanying data logger recorded a temperature excursion outside the required +2 °C to +8 °C: ${formatDuration(ex.minutes)} above 8 °C ${span(ex.start, ex.end)}, with a peak of ${formatTemp(ex.peakC)}.${t(ex.citationId)}`,
    );
  }
  if (attr) {
    parts.push(
      `At that time the consignment was in the custody of ${attr.custodian} at ${attr.location}: ${attr.activity.charAt(0).toLowerCase()}${attr.activity.slice(1)}.${ts(...attr.citationIds.slice(1))}`,
    );
  }
  return parts;
}

function closing(ctx: LetterContext) {
  return `Yours faithfully,\n${ctx.signer.name}\n${ctx.signer.title}, on behalf of ${ctx.row.shipperName ?? "the shipper"}`;
}

export function protectiveNotice(ctx: LetterContext & { route: RecoveryRoute; deadline: Deadline | null }) {
  const r = ctx.record;
  const c = r.contract?.clauses ?? {};
  const subjectBase =
    ctx.route === "carrier"
      ? "Notice of damage under Article 31 of the Montreal Convention"
      : ctx.route === "forwarder"
        ? `Notice of claim under clause ${c.notice?.clause ?? "7.1"} of agreement ${r.contract?.reference ?? ""}`.trim()
        : "Notification of potential loss";
  const subject = `${subjectBase} – ${ctx.row.shipmentRef}`;
  const basis =
    ctx.route === "carrier"
      ? `This notice is given in writing within the time limit of Article 31(2) of the Montreal Convention 1999 (14 days from receipt), as also stated on the air waybill.${t(r.shipment?.citations?.awb)}`
      : ctx.route === "forwarder"
        ? `This notice is given under clause ${c.notice?.clause ?? "7.1"} of our agreement, which allows a notice to reserve our rights pending our quality assessment without stating the final amount.${t(c.notice?.citationId)}`
        : `This notification is given under the claims clause of the policy.${t(r.policy?.clauses.notification?.citationId)}`;
  const breach =
    ctx.route === "forwarder" && c.hub_storage
      ? [`Clause ${c.hub_storage.clause} of our agreement requires the goods to be stored exclusively in qualified cold rooms at your hubs and not staged in ambient areas for more than 30 minutes.${t(c.hub_storage.citationId)}`]
      : [];
  const body = [
    "Dear Sir or Madam,",
    `${subjectBase}\n${header(ctx)}`,
    `We hereby give written notice of damage to the consignment described above.`,
    ...facts(ctx),
    ...breach,
    `The product is under quality assessment. Pending its outcome we reserve all rights to claim compensation for the loss suffered and hold you responsible for the consequences of this excursion. The amount of the claim will follow.`,
    basis,
    `Please preserve all handling, storage and temperature records for this shipment and acknowledge receipt of this notice.`,
    closing(ctx),
  ].join("\n\n");
  return { subject, body };
}

/** Secondary claim: the part of the loss the primary route leaves uncovered. */
export interface SecondaryClaim {
  amountEur: number;
  /** Who is claimed first, e.g. "the cargo insurer" */
  primaryLabel: string;
}

export function claimLetter(ctx: LetterContext & { route: RankedRoute; qaCitationId?: string; secondary?: SecondaryClaim }) {
  const r = ctx.record;
  const c = r.contract?.clauses ?? {};
  const p = r.policy?.clauses ?? {};
  const route = ctx.route;
  const amount = ctx.secondary?.amountEur ?? route.recoverableEur;
  const extra = r.extraCosts ?? [];
  const subject = `${ctx.secondary ? "Secondary claim" : "Claim"} for temperature damage – ${ctx.row.shipmentRef} – ${formatEUR(amount)}`;
  const invoice = r.shipment?.citations?.invoice;
  const qa = `Our Quality Assurance has rejected the affected batch as a consequence of this excursion; the goods cannot be used.${t(ctx.qaCitationId)}`;
  const basis: string[] = [];
  if (route.route === "forwarder") {
    if (c.hub_storage) basis.push(`Under clause ${c.hub_storage.clause} of agreement ${r.contract?.reference ?? ""} the goods had to be stored exclusively in qualified cold rooms at your hubs and not staged in ambient areas for more than 30 minutes. They were instead left in an area that is not temperature controlled.${t(c.hub_storage.citationId)}`);
    if (c.liability_basis) basis.push(`Under clause ${c.liability_basis.clause} you are liable for damage resulting from a temperature excursion while the goods are in your custody.${t(c.liability_basis.citationId)}`);
    if (c.damaged_goods) basis.push(`Under clause ${c.damaged_goods.clause}, goods rejected by our Quality Assurance as a result of an excursion are deemed damaged.${t(c.damaged_goods.citationId)}`);
    if (c.liability_cap) basis.push(`Clause ${c.liability_cap.clause} limits your liability for a breach of clause 3 to the value of the loss, which is ${formatEUR(route.capEur ?? r.shipment?.valueEur ?? amount)}${extra.length ? " including the documented extra costs" : ""}.${ts(c.liability_cap.citationId, invoice)}`);
  } else if (route.route === "insurer") {
    if (p.temperature_cover) basis.push(`Clause ${p.temperature_cover.clause} of policy ${r.policy?.policyNumber ?? ""} covers physical loss or damage caused by a deviation from the stated temperature range, as recorded by the data logger.${t(p.temperature_cover.citationId)}`);
    if (p.damage_definition) basis.push(`Under clause ${p.damage_definition.clause} goods rejected by our Quality Assurance as a consequence of the deviation are deemed damaged.${t(p.damage_definition.citationId)}`);
    if (p.minimum_duration) basis.push(`The deviation lasted well over the minimum duration in clause ${p.minimum_duration.clause}.${t(p.minimum_duration.citationId)}`);
    basis.push(`The insured value is ${formatEUR(r.shipment?.valueEur ?? 0)}; after the deductible of ${formatEUR(route.deductibleEur ?? 0)} the amount payable is ${formatEUR(amount)}.${ts(invoice, p.settlement?.citationId, p.deductible?.citationId)}`);
    if (p.preservation) basis.push(`In line with clause ${p.preservation.clause}, we have preserved our rights against the carrier by written notice of damage, so that your subrogated rights remain intact.${t(p.preservation.citationId)}`);
  } else {
    basis.push(`Under the Montreal Convention 1999 the carrier is liable for damage to cargo sustained during carriage by air (Art. 18). Without a special declaration of value, liability is limited to ${route.basis}${t(r.shipment?.citations?.awb)}`);
  }
  const costsParagraph = extra.length
    ? `The loss comprises the goods and documented extra costs: ${extra.map((c) => `${c.label.toLowerCase()} ${formatEUR(c.eur)}${t(c.citationHint)}`).join("; ")}.`
    : null;
  const secondaryParagraph = ctx.secondary
    ? `This claim is for the part of the loss that is not covered by ${ctx.secondary.primaryLabel}: the deductible and the uninsured share. It is brought in addition to, and not instead of, our claim against ${ctx.secondary.primaryLabel}; any amount received from there will be credited.`
    : null;
  const annexes = [
    "Data logger file and excursion extract",
    "Air waybill",
    "Commercial invoice",
    "Quality Assurance disposition",
    ...(r.custody?.attribution ? ["Custody timeline and handling records"] : []),
    ...(route.route === "forwarder" ? ["Logistics services agreement (cited clauses)"] : route.route === "insurer" ? ["Insurance policy (cited clauses)", "Notice of damage to the carrier"] : []),
    "Evidence pack (Kelvin)",
  ];
  const body = [
    "Dear Sir or Madam,",
    `${ctx.secondary ? "Secondary claim" : "Claim"} for temperature damage\n${header(ctx)}`,
    ...facts(ctx),
    qa,
    ...(costsParagraph ? [costsParagraph] : []),
    ...(secondaryParagraph ? [secondaryParagraph] : []),
    ...basis,
    `We therefore claim ${formatEUR(amount)} and ask you to confirm acceptance within 30 days. All our rights remain reserved.`,
    `Annexes:\n${annexes.map((a, i) => `${i + 1}. ${a}`).join("\n")}`,
    closing(ctx),
  ].join("\n\n");
  return { subject, body, annexes };
}

/* ------------------------------------------------------------ validation */

const SKIP = /^(Dear |Yours |Kind regards|Sincerely|Annexes:|(Secondary c|C)laim for temperature damage|Notice of |Notification of )/;

/**
 * Checks a letter's [S#] tags against the registry. Factual paragraphs without
 * any tag become amber "Assumption" citations so a reviewer sees them.
 */
export function validateLetter(body: string, registry: Record<string, Citation>) {
  const ids = [...new Set([...body.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]))];
  const used = ids.filter((id) => registry[id]).map((id) => registry[id]);
  const unknown = ids.filter((id) => !registry[id]);
  const paragraphs = body.split(/\n\s*\n/).map((p) => p.trim());
  const uncited = paragraphs.filter(
    (p) => p.length > 60 && !SKIP.test(p) && !/\[S\d+\]/.test(p) && !/^(We therefore claim|This claim is for the part of the loss|The product is under quality assessment|Please preserve|We hereby give)/.test(p),
  );
  const assumptions: Citation[] = uncited.map((p) => ({
    kind: "assumption",
    label: `Assumption: ${p.split(/\s+/).slice(0, 5).join(" ")}…`,
    title: `No source cited for: "${p.slice(0, 160)}"`,
    quote: p.slice(0, 200),
  }));
  const factual = paragraphs.filter((p) => p.length > 60 && !SKIP.test(p)).length;
  return { used, unknown, uncited, assumptions, coverage: factual ? (factual - uncited.length) / factual : 1 };
}
