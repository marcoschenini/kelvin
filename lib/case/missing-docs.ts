import type { DocumentKind } from "@/lib/db/schema";
import { isStabilityEmail } from "@/lib/agent/stability-doc";

export type MissingKind = "awb" | "invoice" | "contract" | "policy" | "stability_email";

const REQUIRED: { kind: MissingKind & DocumentKind; label: string }[] = [
  { kind: "awb", label: "Air waybill" },
  { kind: "invoice", label: "Commercial invoice" },
  { kind: "contract", label: "Forwarder contract" },
  { kind: "policy", label: "Cargo insurance policy" },
];

/**
 * Documents a claim needs that are not on the case. Stability data is an email:
 * seeded emails are titled by their subject, uploads as "Email (file.eml)", so an
 * email counts as stability data when its title is a stability subject or mentions "stability".
 */
export function missingDocuments(docs: { kind: DocumentKind; title?: string }[]): { kind: MissingKind; label: string }[] {
  const out: { kind: MissingKind; label: string }[] = REQUIRED.filter((r) => !docs.some((d) => d.kind === r.kind)).map((r) => ({ kind: r.kind, label: r.label }));
  const hasStability = docs.some((d) => d.kind === "email" && !!d.title && (isStabilityEmail(d.title) || /stability/i.test(d.title)));
  if (!hasStability) out.push({ kind: "stability_email", label: "Stability data from the manufacturer" });
  return out;
}
