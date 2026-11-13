import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import type { DB } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { DEFAULT_RULES } from "@/lib/rules/config";
import { assessStability } from "@/lib/rules/stability";

/** Quality agent decisions and the closing transitions (record.outcome, audit). */

process.env.KELVIN_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "kelvin-gates-"));

const NOW = new Date("2026-11-09T10:00:00Z");
let db: DB;
let gates: typeof import("@/lib/case/gates");
let rec: typeof import("@/lib/case/record");
let sm: typeof import("@/lib/case/status-machine");
let seed: typeof import("@/seed/seed-db");
let getPersona: typeof import("@/lib/domain/personas").getPersona;

beforeAll(async () => {
  const d = drizzle(new PGlite(), { schema });
  await migrate(d, { migrationsFolder: path.join(process.cwd(), "lib/db/migrations") });
  db = d as unknown as DB;
  gates = await import("@/lib/case/gates");
  rec = await import("@/lib/case/record");
  sm = await import("@/lib/case/status-machine");
  seed = await import("@/seed/seed-db");
  getPersona = (await import("@/lib/domain/personas")).getPersona;
});

const row = async (id: string) => (await db.select().from(schema.cases).where(eq(schema.cases.id, id)))[0];
const audit = (id: string) => db.select().from(schema.auditEvents).where(eq(schema.auditEvents.caseId, id));
const AGENT = { type: "agent" as const, name: "Test agent" };

async function investigating(code: "A" | "B" | "C") {
  const id = `demo-${code.toLowerCase()}`;
  await seed.seedDemoCase(db, code, NOW);
  await sm.transition(db, id, "investigating", AGENT);
  return id;
}

describe("seeded stability emails", () => {
  it("A, B and C each have a Stability data email with the allowance in one sentence", async () => {
    const expected = { A: "up to 25 °C for a cumulative 1440 minutes", B: "up to 10 °C for a cumulative 30 minutes", C: "up to 10 °C for a cumulative 60 minutes" } as const;
    for (const code of ["A", "B", "C"] as const) {
      const id = await investigating(code);
      const docs = await db.select().from(schema.documents).where(eq(schema.documents.caseId, id));
      const stab = docs.find((d) => d.kind === "email" && d.title.startsWith("Stability data"));
      expect(stab, id).toBeTruthy();
      expect(stab!.id).toMatch(new RegExp(`^${id}-email-0[3-4]$`));
      const { readText } = await import("@/lib/storage");
      expect(await readText(stab!.storagePath)).toContain(`Stability allowance: ${expected[code]} outside 2–8 °C.`);
    }
  });
});

describe("recordAgentQaDecision", () => {
  it("usable closes the case with reasoning, outcome and an agent audit event", async () => {
    const id = await investigating("A");
    await gates.recordAgentQaDecision(db, id, assessStability({ peakC: 9.2, minutesOutOfRange: 25, allowance: { maxTempC: 25, maxMinutesOutOfRange: 1440 } }, DEFAULT_RULES));
    const c = await row(id);
    expect(c.status).toBe("closed_no_claim");
    const r = await rec.getRecord(db, id);
    expect(r.qaAssessment?.verdict).toBe("usable");
    expect(r.qaAssessment?.by).toBe("quality_agent");
    expect(r.qa?.status).toBe("released");
    expect(r.outcome).toMatchObject({ result: "no_claim", claimedEur: null, recoveredEur: null });
    const ev = (await audit(id)).find((e) => e.eventType === "qa_assessment")!;
    expect(ev).toMatchObject({ actorType: "agent", actorName: "Quality agent" });
    expect(c.closedReason).toBeTruthy();
  });
  it("damaged goes straight to claim_prepared with qa rejected by the Quality agent", async () => {
    const id = await investigating("B");
    await gates.recordAgentQaDecision(db, id, assessStability({ peakC: 13, minutesOutOfRange: 90, allowance: { maxTempC: 10, maxMinutesOutOfRange: 30 } }, DEFAULT_RULES));
    expect((await row(id)).status).toBe("claim_prepared");
    const r = await rec.getRecord(db, id);
    expect(r.qa).toMatchObject({ status: "rejected", by: "Quality agent" });
    expect(r.qaAssessment?.verdict).toBe("damaged");
  });
  it("unsure waits for a human QA and is never auto-closed; the human can still decide", async () => {
    const id = await investigating("B");
    await gates.recordAgentQaDecision(db, id, assessStability({ peakC: 10, minutesOutOfRange: 29, allowance: { maxTempC: 10, maxMinutesOutOfRange: 30 } }, DEFAULT_RULES));
    expect((await row(id)).status).toBe("awaiting_qa");
    expect((await rec.getRecord(db, id)).qa?.status ?? "pending").toBe("pending");
    await gates.recordQaDecision(db, id, { decision: "released", actor: getPersona("elena") });
    // A human release moves to no_claim; the agent then closes it with the reason (and writes the outcome).
    expect((await row(id)).status).toBe("no_claim");
    await sm.transition(db, id, "closed_no_claim", AGENT, { reason: "closed" });
    expect((await rec.getRecord(db, id)).outcome?.result).toBe("no_claim");
  });
  it("only works while investigating", async () => {
    const id = await investigating("C");
    const a = assessStability({ peakC: 15, minutesOutOfRange: 225, allowance: { maxTempC: 10, maxMinutesOutOfRange: 60 } }, DEFAULT_RULES);
    await gates.recordAgentQaDecision(db, id, a);
    await expect(gates.recordAgentQaDecision(db, id, a)).rejects.toThrow(gates.GateError);
  });
});

describe("manager rejects a claim letter", () => {
  async function awaitingApproval() {
    const id = await investigating("B");
    await sm.transition(db, id, "claim_prepared", AGENT);
    await sm.transition(db, id, "awaiting_approval", AGENT);
    await db.insert(schema.drafts).values([
      { id: `${id}-d1`, caseId: id, kind: "claim_letter", route: "insurer", recipientName: "Meridian", recipientEmail: "c@example.com", subject: "Claim", body: "x", amountEur: 190_000, status: "awaiting_approval" },
      { id: `${id}-d2`, caseId: id, kind: "protective_notice", route: "carrier", recipientName: "Boreal", recipientEmail: "b@example.com", subject: "Notice", body: "x", status: "awaiting_approval" },
    ]);
    await db.update(schema.cases).set({ claimAmountEur: 190_000, recommendedRoute: "insurer" }).where(eq(schema.cases.id, id));
    return id;
  }
  it("closes as closed_not_approved with the reason in the audit log and outcome", async () => {
    const id = await awaitingApproval();
    await gates.recordApproval(db, id, { draftId: `${id}-d1`, decision: "rejected", reason: "Amount not supported", actor: getPersona("tom") });
    expect((await row(id)).status).toBe("closed_not_approved");
    const r = await rec.getRecord(db, id);
    expect(r.outcome).toMatchObject({ result: "not_approved", claimedEur: 190_000, recoveredEur: null });
    const ev = (await audit(id)).filter((e) => e.eventType === "status_changed").pop()!;
    expect(JSON.stringify(ev.output)).toContain("Amount not supported");
    expect(ev.actorType).toBe("human");
  });
  it("rejecting a protective notice only rejects that draft", async () => {
    const id = await awaitingApproval();
    await gates.recordApproval(db, id, { draftId: `${id}-d2`, decision: "rejected", reason: "Not needed", actor: getPersona("tom") });
    expect((await row(id)).status).toBe("awaiting_approval");
  });
  it("only a manager can reject", async () => {
    const id = await awaitingApproval();
    await expect(gates.recordApproval(db, id, { draftId: `${id}-d1`, decision: "rejected", reason: "x", actor: getPersona("elena") })).rejects.toThrow(gates.GateError);
  });
});

describe("closing transitions write the outcome", () => {
  it("settled: recovered amount, recovery % and payer", async () => {
    const id = await investigating("B");
    for (const s of ["claim_prepared", "awaiting_approval", "sent"] as const) await sm.transition(db, id, s, AGENT);
    await db.update(schema.cases).set({ claimAmountEur: 190_000, recommendedRoute: "insurer" }).where(eq(schema.cases.id, id));
    await sm.transition(db, id, "closed_settled", AGENT, { patch: { recoveredEur: 95_000 } });
    expect((await rec.getRecord(db, id)).outcome).toMatchObject({ result: "settled", claimedEur: 190_000, recoveredEur: 95_000, recoveryPct: 50, payer: "insurer" });
  });
  it("recovered without an explicit amount counts the full claim", async () => {
    const id = await investigating("C");
    for (const s of ["claim_prepared", "awaiting_approval", "sent"] as const) await sm.transition(db, id, s, AGENT);
    await db.update(schema.cases).set({ claimAmountEur: 350_000, recommendedRoute: "forwarder" }).where(eq(schema.cases.id, id));
    await sm.transition(db, id, "closed_recovered", AGENT);
    expect((await rec.getRecord(db, id)).outcome).toMatchObject({ result: "recovered", recoveryPct: 100, payer: "forwarder" });
  });
});
