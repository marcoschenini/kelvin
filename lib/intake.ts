import "server-only";
import { DEFAULT_PERSONA_ID } from "@/lib/domain/personas";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db/client";
import { auditEvents, cases, documents, type DocumentKind } from "@/lib/db/schema";
import { extractPdfText } from "@/lib/pdf/extract";
import { putFile } from "@/lib/storage";

/** Classifies an uploaded file by extension and, for PDFs, by first-page keywords. */
export async function classifyFile(name: string, bytes: Uint8Array): Promise<{ kind: DocumentKind; pages: number | null; mime: string }> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".csv")) return { kind: "logger", pages: null, mime: "text/csv" };
  if (lower.endsWith(".json")) return { kind: "handling_events", pages: null, mime: "application/json" };
  if (lower.endsWith(".eml") || lower.endsWith(".txt")) return { kind: "email", pages: null, mime: "message/rfc822" };
  if (lower.endsWith(".pdf")) {
    try {
      const pages = await extractPdfText(bytes);
      // Judge by letterhead + title only: body text cross-references other documents.
      const head = (pages[0]?.text ?? "").split("\n").slice(0, 6).join(" ").toLowerCase();
      const kind: DocumentKind = head.includes("commercial invoice")
        ? "invoice"
        : head.includes("air waybill")
          ? "awb"
          : head.includes("agreement")
            ? "contract"
            : /policy|open cover|insurance|underwrit/.test(head)
              ? "policy"
              : /irregularity|movement log|handling report|wms/.test(head)
                ? "handling_report"
                : "other";
      return { kind, pages: pages.length, mime: "application/pdf" };
    } catch {
      return { kind: "other", pages: null, mime: "application/pdf" };
    }
  }
  return { kind: "other", pages: null, mime: "application/octet-stream" };
}

const KIND_TITLE: Record<DocumentKind, string> = {
  logger: "Logger data",
  awb: "Air waybill",
  handling_events: "Handling events",
  handling_report: "Handling report",
  contract: "Forwarder contract",
  policy: "Cargo policy",
  invoice: "Commercial invoice",
  email: "Email",
  evidence_pack: "Evidence pack",
  other: "Document",
};

/** Creates a case from uploaded files. The agent fills in shipment facts when it runs. */
export async function createCaseFromUpload(files: { name: string; bytes: Uint8Array }[], actor: { name: string; title: string }, ownerPersonaId: string = DEFAULT_PERSONA_ID) {
  if (!files.length) throw new Error("No files uploaded");
  const db = await getDb();
  const id = `up-${nanoid(8).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
  const now = new Date();

  const classified = await Promise.all(files.map(async (f) => ({ ...f, ...(await classifyFile(f.name, f.bytes)) })));
  const logger = classified.find((f) => f.kind === "logger");
  const shipmentRef = logger ? (new TextDecoder().decode(logger.bytes).match(/# Shipment:\s*(\S+)/)?.[1] ?? null) : null;

  await db.insert(cases).values({
    id,
    shipmentRef: shipmentRef ?? id.toUpperCase(),
    title: `Uploaded case (${files.length} documents)`,
    scenario: "upload",
    status: "new",
    ownerPersonaId,
    discoveredAt: now,
    record: {},
  });

  const rows = [];
  for (const [i, f] of classified.entries()) {
    const safe = f.name.replace(/[^\w.\-]+/g, "_");
    const storagePath = `cases/${id}/${safe}`;
    await putFile(storagePath, f.bytes);
    rows.push({
      id: `${id}-${f.kind}-${String(i + 1).padStart(2, "0")}`,
      caseId: id,
      kind: f.kind,
      title: f.kind === "other" ? f.name : `${KIND_TITLE[f.kind]} (${f.name})`,
      filename: safe,
      mime: f.mime,
      storagePath,
      sizeBytes: f.bytes.byteLength,
      pages: f.pages,
    });
  }
  await db.insert(documents).values(rows);
  await db.insert(auditEvents).values([
    {
      caseId: id,
      actorType: "human",
      actorName: actor.name,
      actorRole: actor.title,
      eventType: "case_opened",
      input: { source: "upload", files: files.map((f) => f.name) },
    },
    ...rows.map((r) => ({
      caseId: id,
      actorType: "system" as const,
      actorName: "Kelvin intake",
      eventType: "document_received",
      input: { filename: r.filename, kind: r.kind },
      output: { documentId: r.id, bytes: r.sizeBytes, pages: r.pages },
    })),
  ]);
  return { id, documents: rows.length };
}

/** Attaches uploaded files to an existing case (does not start a run). Returns null if the case does not exist. */
export async function addDocumentsToCase(caseId: string, files: { name: string; bytes: Uint8Array }[], actor: { name: string; title: string }) {
  const db = await getDb();
  const [c] = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, caseId));
  if (!c) return null;
  const taken = new Set((await db.select({ f: documents.filename }).from(documents).where(eq(documents.caseId, caseId))).map((d) => d.f));
  const rows = [];
  for (const f of files) {
    const cls = await classifyFile(f.name, f.bytes);
    let safe = f.name.replace(/[^\w.\-]+/g, "_");
    if (taken.has(safe)) safe = `${nanoid(4).toLowerCase().replace(/[^a-z0-9]/g, "x")}-${safe}`;
    taken.add(safe);
    const storagePath = `cases/${caseId}/${safe}`;
    await putFile(storagePath, f.bytes);
    rows.push({
      id: `${caseId}-${cls.kind}-${nanoid(6).toLowerCase().replace(/[^a-z0-9]/g, "x")}`,
      caseId,
      kind: cls.kind,
      title: cls.kind === "other" ? f.name : cls.kind === "email" ? f.name.replace(/\.(eml|txt)$/i, "") : `${KIND_TITLE[cls.kind]} (${f.name})`,
      filename: safe,
      mime: cls.mime,
      storagePath,
      sizeBytes: f.bytes.byteLength,
      pages: cls.pages,
    });
  }
  await db.insert(documents).values(rows);
  await db.insert(auditEvents).values([
    { caseId, actorType: "human", actorName: actor.name, actorRole: actor.title, eventType: "documents_added", input: { files: files.map((f) => f.name) }, output: { note: `Documents added (${rows.length})` } },
    ...rows.map((r) => ({
      caseId,
      actorType: "system" as const,
      actorName: "Kelvin intake",
      eventType: "document_received",
      input: { filename: r.filename, kind: r.kind },
      output: { documentId: r.id, bytes: r.sizeBytes, pages: r.pages },
    })),
  ]);
  return rows.length;
}
