import { eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { auditEvents, cases, documents, type NewCaseRow } from "@/lib/db/schema";
import { putFile, removePrefix } from "@/lib/storage";
import { buildCase, type GeneratedCase } from "./build";
import { DEMO_CASES } from "./cases/demo";
import type { CaseSpec } from "./spec";

/** Inserts one generated case: files to storage, rows to the database, intake audit events. */
async function insertCase(db: DB, g: GeneratedCase) {
  const { spec } = g;
  for (const f of g.files) await putFile(`cases/${spec.id}/${f.filename}`, f.bytes);

  const row: NewCaseRow = {
    id: spec.id,
    shipmentRef: spec.shipmentRef,
    title: spec.title,
    scenario: spec.scenario,
    code: spec.code,
    product: spec.product.name,
    awbNumber: spec.awbNumber,
    origin: spec.origin.iata,
    destination: spec.destination.iata,
    valueEur: spec.valueEur,
    weightKg: spec.weightKg,
    declaredValueEur: spec.declaredValueEur,
    shipperName: spec.shipper.name,
    consigneeName: spec.consignee.name,
    status: "new",
    ownerPersonaId: "tom",
    deliveredAt: g.deliveredAt,
    discoveredAt: g.discoveredAt,
    record: {},
    createdAt: g.discoveredAt,
    updatedAt: g.discoveredAt,
  };
  await db.insert(cases).values(row);
  await db.insert(documents).values(
    g.files.map((f) => ({
      id: f.id,
      caseId: spec.id,
      kind: f.kind,
      title: f.title,
      filename: f.filename,
      mime: f.mime,
      storagePath: `cases/${spec.id}/${f.filename}`,
      sizeBytes: f.bytes.byteLength,
      pages: f.pages,
      createdAt: g.discoveredAt,
    })),
  );
  await db.insert(auditEvents).values([
    {
      caseId: spec.id,
      at: g.discoveredAt,
      actorType: "system",
      actorName: "Kelvin intake",
      eventType: "case_opened",
      input: { source: spec.scenario === "demo" ? "demo seed" : "eval seed", alert: "logger alarm" },
      output: { shipmentRef: spec.shipmentRef, documents: g.files.length },
    },
    ...g.files.map((f) => ({
      caseId: spec.id,
      at: g.discoveredAt,
      actorType: "system" as const,
      actorName: "Kelvin intake",
      eventType: "document_received",
      input: { filename: f.filename, kind: f.kind },
      output: { documentId: f.id, bytes: f.bytes.byteLength, pages: f.pages },
    })),
  ]);
}

/**
 * Removes a case and everything attached to it. audit_events is append-only, so
 * its trigger is disabled for the duration of this explicit reset only.
 */
async function deleteCases(db: DB, ids: string[]) {
  if (!ids.length) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`ALTER TABLE audit_events DISABLE TRIGGER audit_events_no_update`);
    await tx.delete(auditEvents).where(inArray(auditEvents.caseId, ids));
    await tx.execute(sql`ALTER TABLE audit_events ENABLE TRIGGER audit_events_no_update`);
    await tx.delete(cases).where(inArray(cases.id, ids)); // cascades to documents, runs, drafts, outbox…
  });
  for (const id of ids) await removePrefix(`cases/${id}`);
}

/** (Re)seeds the given specs anchored to `now`. Existing rows for the same ids are replaced. */
export async function seedCases(db: DB, specs: CaseSpec[], now = new Date()) {
  await deleteCases(
    db,
    specs.map((s) => s.id),
  );
  const out: GeneratedCase[] = [];
  for (const spec of specs) {
    const g = await buildCase(spec, now);
    await insertCase(db, g);
    out.push(g);
  }
  return out;
}

export async function seedDemoCase(db: DB, code: "A" | "B" | "C", now = new Date()) {
  const spec = DEMO_CASES.find((c) => c.code === code);
  if (!spec) throw new Error(`Unknown demo case ${code}`);
  const [g] = await seedCases(db, [spec], now);
  return g;
}

/** Full demo reset: wipes every table (TRUNCATE skips the append-only row trigger) and re-seeds A, B, C. */
export async function resetDemo(db: DB, now = new Date()) {
  await db.execute(
    sql`TRUNCATE outbox_messages, decisions, drafts, agent_steps, agent_runs, document_pages, documents, audit_events, cases RESTART IDENTITY CASCADE`,
  );
  await removePrefix("cases");
  const generated = await seedCases(db, DEMO_CASES, now);
  await db.insert(auditEvents).values({
    caseId: null,
    actorType: "system",
    actorName: "Kelvin",
    eventType: "demo_reset",
    output: { cases: generated.map((g) => g.spec.id), anchor: now.toISOString() },
  });
  return generated;
}

export async function caseExists(db: DB, id: string) {
  const rows = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, id));
  return rows.length > 0;
}
