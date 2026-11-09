import type { DocumentKind } from "@/lib/db/schema";
import { emailEml, handlingEventsJson } from "./handling";
import { loggerCsv } from "./logger";
import { contractPdf } from "./pdf/contract";
import { policyPdf } from "./pdf/policy";
import { awbPdf, handlingReportPdf, invoicePdf } from "./pdf/shipping";
import type { CaseSpec } from "./spec";
import { atHours, deliveryInstant, resolveTemplate } from "./time";

export interface GeneratedFile {
  /** Deterministic: stable across re-seeds, so recordings and citations stay valid */
  id: string;
  kind: DocumentKind;
  title: string;
  filename: string;
  mime: string;
  bytes: Uint8Array;
  pages: number | null;
}

export interface GeneratedCase {
  spec: CaseSpec;
  deliveredAt: Date;
  discoveredAt: Date;
  files: GeneratedFile[];
}

const enc = new TextEncoder();

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

/** Turns a spec into the full document set, anchored to `now`. Pure: no I/O. */
export async function buildCase(spec: CaseSpec, now: Date): Promise<GeneratedCase> {
  const delivery = deliveryInstant(now, spec.deliveredDaysAgo);
  const missing = new Set(spec.missing ?? []);
  const files: GeneratedFile[] = [];
  const add = (f: Omit<GeneratedFile, "id"> & { id?: string }) =>
    files.push({ ...f, id: f.id ?? `${spec.id}-${f.kind}` });

  const { csv } = loggerCsv(spec, delivery);
  add({ kind: "logger", title: `Logger ${spec.loggerId}`, filename: `logger-${spec.loggerId}.csv`, mime: "text/csv", bytes: enc.encode(csv), pages: null });

  if (!missing.has("awb")) {
    const awb = await awbPdf(spec, delivery);
    add({ kind: "awb", title: `Air waybill ${spec.awbNumber}`, filename: `AWB-${spec.awbNumber.replace(/\s/g, "")}.pdf`, mime: "application/pdf", bytes: awb.bytes, pages: awb.pages });
  }

  add({
    kind: "handling_events",
    title: "Handling events (track & trace)",
    filename: "handling-events.json",
    mime: "application/json",
    bytes: enc.encode(handlingEventsJson(spec, delivery)),
    pages: null,
  });

  if (spec.handlingReport && !missing.has("handling_report")) {
    const r = await handlingReportPdf(spec, delivery);
    add({ kind: "handling_report", title: spec.handlingReport.title, filename: `${spec.handlingReport.reference}.pdf`, mime: "application/pdf", bytes: r.bytes, pages: r.pages });
  }

  if (!missing.has("contract")) {
    const c = await contractPdf(spec);
    add({ kind: "contract", title: `Forwarder contract ${spec.contract.reference}`, filename: `${spec.contract.reference}.pdf`, mime: "application/pdf", bytes: c.bytes, pages: c.pages });
  }

  if (!missing.has("policy")) {
    const p = await policyPdf(spec);
    add({ kind: "policy", title: `Cargo policy ${spec.policy.policyNumber}`, filename: `${spec.policy.policyNumber}.pdf`, mime: "application/pdf", bytes: p.bytes, pages: p.pages });
  }

  if (!missing.has("invoice")) {
    const inv = await invoicePdf(spec, delivery);
    add({ kind: "invoice", title: `Commercial invoice CI-${spec.shipmentRef}`, filename: `CI-${spec.shipmentRef}.pdf`, mime: "application/pdf", bytes: inv.bytes, pages: inv.pages });
  }

  spec.emails.forEach((e, i) => {
    const resolved = { ...e, subject: resolveTemplate(e.subject, delivery), body: resolveTemplate(e.body, delivery) };
    const n = String(i + 1).padStart(2, "0");
    add({
      id: `${spec.id}-email-${n}`,
      kind: "email",
      title: resolved.subject,
      filename: `email-${n}-${slug(resolved.subject)}.eml`,
      mime: "message/rfc822",
      bytes: enc.encode(emailEml(spec, resolved, delivery, i + 1)),
      pages: null,
    });
  });

  return { spec, deliveredAt: delivery, discoveredAt: atHours(delivery, spec.discoveredAfterH), files };
}
