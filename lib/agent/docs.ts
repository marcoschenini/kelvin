import { and, asc, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { documentPages, documents, type DocumentKind, type DocumentRow } from "@/lib/db/schema";
import { extractPdfText, type ExtractedPage } from "@/lib/pdf/extract";
import { readFile } from "@/lib/storage";

/** Document access for tools: lookup by kind, cached page text, structured parsers. */

export async function findDocuments(db: DB, caseId: string, kind?: DocumentKind): Promise<DocumentRow[]> {
  const where = kind ? and(eq(documents.caseId, caseId), eq(documents.kind, kind)) : eq(documents.caseId, caseId);
  return db.select().from(documents).where(where).orderBy(asc(documents.id));
}

export async function findDocument(db: DB, caseId: string, kind: DocumentKind): Promise<DocumentRow | null> {
  return (await findDocuments(db, caseId, kind))[0] ?? null;
}

export async function getDocumentById(db: DB, caseId: string, id: string): Promise<DocumentRow | null> {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.caseId, caseId)));
  return row ?? null;
}

/** Page texts for a PDF, extracted once and cached in document_pages. */
export async function pdfPages(db: DB, doc: DocumentRow): Promise<ExtractedPage[]> {
  const cached = await db
    .select()
    .from(documentPages)
    .where(eq(documentPages.documentId, doc.id))
    .orderBy(asc(documentPages.page));
  if (cached.length) return cached.map((p) => ({ page: p.page, text: p.text }));
  const pages = await extractPdfText(new Uint8Array(await readFile(doc.storagePath)));
  if (pages.length) {
    await db
      .insert(documentPages)
      .values(pages.map((p) => ({ documentId: doc.id, page: p.page, text: p.text })))
      .onConflictDoNothing();
  }
  return pages;
}

export async function docText(doc: DocumentRow): Promise<string> {
  return (await readFile(doc.storagePath)).toString("utf8");
}

/* ------------------------------------------------------------------ parsers */

const money = (s: string) => Number(s.replace(/[^\d.]/g, ""));

export interface AwbFields {
  awbNumber: string | null;
  pieces: number | null;
  grossWeightKg: number | null;
  declaredValueEur: number | null;
  declaredValueRaw: string | null;
  customsValueEur: number | null;
  origin: string | null;
  destination: string | null;
  flight: string | null;
  flightDate: string | null;
}

export function parseAwb(text: string): AwbFields {
  const lines = text.split("\n");
  const after = (label: RegExp) => {
    const i = lines.findIndex((l) => label.test(l));
    return i >= 0 ? (lines[i + 1] ?? "") : "";
  };
  const num = text.match(/\b(\d{3}-\d{4}\s?\d{4})\b/)?.[1] ?? null;
  const goods = text.match(/^(\d+)\s+([\d.]+)\s+K\s+([\d.]+)/m);
  const values = after(/DECLARED VALUE FOR CARRIAGE/).trim().split(/\s+/);
  const declaredRaw = values[0] ?? null;
  const route = after(/AIRPORT OF DEPARTURE/).match(/^([A-Z]{3})\b.*?\b([A-Z]{3})\b.*?([A-Z0-9]{2}\s?\d{2,4})\s*\/\s*(\d{2}[A-Z]{3}\d{2})/);
  return {
    awbNumber: num,
    pieces: goods ? Number(goods[1]) : null,
    grossWeightKg: goods ? Number(goods[2]) : null,
    declaredValueRaw: declaredRaw,
    declaredValueEur: declaredRaw && declaredRaw !== "NVD" && /\d/.test(declaredRaw) ? money(declaredRaw) : null,
    customsValueEur: values[1] && /\d/.test(values[1]) ? money(values[1]) : null,
    origin: route?.[1] ?? null,
    destination: route?.[2] ?? null,
    flight: route?.[3] ?? null,
    flightDate: route?.[4] ?? null,
  };
}

export function parseInvoice(text: string): { totalEur: number | null; invoiceNo: string | null; quote: string | null } {
  const m = text.match(/Total invoice value\s+(?:€|EUR\s?)([\d,.]+)/i);
  return {
    totalEur: m ? money(m[1]) : null,
    invoiceNo: text.match(/Invoice no\.\s*([\w-]+)/i)?.[1] ?? null,
    quote: m ? m[0] : null,
  };
}

export interface ParsedEmail {
  from: string;
  to: string;
  date: string;
  subject: string;
  body: string;
}

export function parseEml(raw: string): ParsedEmail {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/);
  const h = (name: string) => head.match(new RegExp(`^${name}:\\s*(.*)$`, "mi"))?.[1]?.trim() ?? "";
  return { from: h("From"), to: h("To"), date: h("Date"), subject: h("Subject"), body: rest.join("\n\n").trim() };
}
