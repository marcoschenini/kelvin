import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import type { DB } from "@/lib/db/client";

/**
 * End-to-end agent runs (deterministic planner) on the three demo cases,
 * against an in-memory database and a temporary file store.
 */

process.env.KELVIN_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "kelvin-test-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;

let db: DB;
let mod: {
  runAgent: typeof import("@/lib/agent/orchestrator").runAgent;
  seedDemoCase: typeof import("@/seed/seed-db").seedDemoCase;
  recordQaDecision: typeof import("@/lib/case/gates").recordQaDecision;
  recordApproval: typeof import("@/lib/case/gates").recordApproval;
  getRecord: typeof import("@/lib/case/record").getRecord;
  executeTool: typeof import("@/lib/agent/tool").executeTool;
  getTool: typeof import("@/lib/agent/tools").getTool;
  getPersona: typeof import("@/lib/domain/personas").getPersona;
  loadRules: typeof import("@/lib/rules/load").loadRules;
};

const NOW = new Date("2026-11-09T10:00:00Z");

beforeAll(async () => {
  const client = new PGlite();
  const d = drizzle(client, { schema });
  await migrate(d, { migrationsFolder: path.join(process.cwd(), "lib/db/migrations") });
  db = d as unknown as DB;
  mod = {
    runAgent: (await import("@/lib/agent/orchestrator")).runAgent,
    seedDemoCase: (await import("@/seed/seed-db")).seedDemoCase,
    recordQaDecision: (await import("@/lib/case/gates")).recordQaDecision,
    recordApproval: (await import("@/lib/case/gates")).recordApproval,
    getRecord: (await import("@/lib/case/record")).getRecord,
    executeTool: (await import("@/lib/agent/tool")).executeTool,
    getTool: (await import("@/lib/agent/tools")).getTool,
    getPersona: (await import("@/lib/domain/personas")).getPersona,
    loadRules: (await import("@/lib/rules/load")).loadRules,
  };
});

const run = (caseId: string, kind: "investigate" | "prepare_claim" | "close" | "follow_up") =>
  mod.runAgent({ db, caseId, kind, mode: "deterministic", now: NOW, record: false });

async function caseRow(id: string) {
  const [row] = await db.select().from(schema.cases).where(eq(schema.cases.id, id));
  return row;
}
async function caseDrafts(id: string) {
  return db.select().from(schema.drafts).where(eq(schema.drafts.caseId, id));
}

describe("case B: quality agent, claim plan and protective notice", () => {
  it("investigates, attributes the excursion to the airline, drafts the protective notice and the quality agent finds the product damaged", async () => {
    await mod.seedDemoCase(db, "B", NOW);
    const r = await run("demo-b", "investigate");
    expect(r.status).toBe("completed");
    // The quality agent decides without a human click and the claim is prepared in the same run.
    expect((await caseRow("demo-b")).status).toBe("awaiting_approval");
    const rec = await mod.getRecord(db, "demo-b");
    expect(rec.qaAssessment?.verdict).toBe("damaged");
    expect(rec.qaAssessment?.citationId).toBeTruthy();
    expect(rec.custody?.attribution?.role).toBe("airline");
    expect(rec.ranking?.find((x) => x.recommended)?.route).toBe("insurer");
    expect(rec.claimPlan?.map((c) => [c.route, c.role])).toEqual([
      ["insurer", "primary"],
      ["carrier", "secondary"],
    ]);
    expect(rec.claimPlan?.[0].amountEur).toBe(190_000);
    expect(rec.claimPlan?.[1].amountEur).toBeCloseTo(3_771, 0); // 26 SDR/kg × 120 kg × 1.2088 = €3,771.46
    const notices = (await caseDrafts("demo-b")).filter((d) => d.kind === "protective_notice");
    expect(notices.map((n) => n.route)).toEqual(["carrier"]);
    expect(notices[0].status).toBe("awaiting_approval");
  });

  it("refuses to send anything without approval", async () => {
    const [notice] = (await caseDrafts("demo-b")).filter((d) => d.kind === "protective_notice");
    const ctx = {
      db,
      caseId: "demo-b",
      runId: "test",
      kind: "follow_up" as const,
      mode: "deterministic" as const,
      model: null,
      now: NOW,
      rules: await mod.loadRules(db),
      emit: () => {},
      nextSeq: (() => {
        let n = 1000;
        return () => ++n;
      })(),
    };
    await db.insert(schema.agentRuns).values({ id: "test", caseId: "demo-b", kind: "follow_up", mode: "deterministic", status: "completed" });
    const res = await mod.executeTool(mod.getTool("send_via_outbox"), { draftId: notice.id }, ctx);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/Not approved/);
    expect(await db.select().from(schema.outboxMessages).where(eq(schema.outboxMessages.caseId, "demo-b"))).toHaveLength(0);
  });

  it("the quality agent cannot be called twice and a human cannot override it", async () => {
    await expect(mod.recordQaDecision(db, "demo-b", { decision: "released", actor: mod.getPersona("elena") })).rejects.toThrow(/only possible while awaiting QA/);
  });

  it("prepares a fully cited primary claim and a secondary claim to the airline", async () => {
    const claims = (await caseDrafts("demo-b")).filter((d) => d.kind === "claim_letter");
    const primary = claims.find((d) => d.route === "insurer")!;
    const secondary = claims.find((d) => d.route === "carrier")!;
    expect(primary.amountEur).toBe(190_000);
    expect(secondary.amountEur).toBeCloseTo(3_771, 0);
    expect(secondary.recipientName).toMatch(/Boreal/);
    expect(secondary.status).toBe("awaiting_approval");
    const cits = primary.citations as { kind: string }[];
    expect(cits.length).toBeGreaterThan(8);
    expect(cits.filter((c) => c.kind === "assumption")).toHaveLength(0);
    expect((secondary.citations as { kind: string }[]).filter((c) => c.kind === "assumption")).toHaveLength(0);
    const docs = await db.select().from(schema.documents).where(and(eq(schema.documents.caseId, "demo-b"), eq(schema.documents.kind, "evidence_pack")));
    expect(docs).toHaveLength(1);
  });

  it("sends only after the manager approves, with the approval on every outgoing message", async () => {
    const tom = mod.getPersona("tom");
    const elena = mod.getPersona("elena");
    const waiting = (await caseDrafts("demo-b")).filter((d) => d.status === "awaiting_approval");
    await expect(mod.recordApproval(db, "demo-b", { draftId: waiting[0].id, decision: "approved", actor: elena })).rejects.toThrow(/cannot approve/);
    for (const d of waiting) await mod.recordApproval(db, "demo-b", { draftId: d.id, decision: "approved", actor: tom });
    const r = await run("demo-b", "follow_up");
    expect(r.finalStatus).toBe("sent");
    const out = await db.select().from(schema.outboxMessages).where(eq(schema.outboxMessages.caseId, "demo-b"));
    expect(out).toHaveLength(3);
    expect(out.every((m) => m.approvalDecisionId && m.simulated)).toBe(true);
  });

  it("logs every tool call to the audit trail, including the quality agent's reasoning", async () => {
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.caseId, "demo-b"));
    const tools = new Set(audit.filter((a) => a.eventType === "tool_call").map((a) => a.tool));
    for (const t of ["parse_logger", "build_custody_timeline", "check_contract", "check_policy", "compute_liability", "compute_deadlines", "rank_routes", "draft_protective_notice", "assess_quality", "draft_claim_letter", "build_evidence_pack", "send_via_outbox"]) {
      expect(tools.has(t)).toBe(true);
    }
    expect(audit.some((a) => a.eventType === "qa_assessment" && a.actorName === "Quality agent")).toBe(true);
    expect(audit.filter((a) => a.eventType === "approval_decision").length).toBe(3);
  });
});

describe("case C: protective notice on day 2", () => {
  it("recommends the forwarder for the invoice value and drafts a protective notice on day 2", async () => {
    await mod.seedDemoCase(db, "C", NOW);
    await run("demo-c", "investigate");
    const rec = await mod.getRecord(db, "demo-c");
    expect(rec.custody?.attribution?.role).toBe("forwarder");
    const top = rec.ranking?.find((x) => x.recommended);
    expect(top?.route).toBe("forwarder");
    expect(top?.recoverableEur).toBe(350_000);
    expect((await caseDrafts("demo-c")).filter((d) => d.kind === "protective_notice").map((d) => d.route)).toEqual(["forwarder"]);
    const row = await caseRow("demo-c");
    expect(row.nearestDeadlineLabel).toMatch(/forwarder/i);
  });
});

describe("case C: quality agent and forwarder claim", () => {
  it("the quality agent finds the product damaged and the claim plan has no secondary", async () => {
    const rec = await mod.getRecord(db, "demo-c");
    expect(rec.qaAssessment?.verdict).toBe("damaged");
    expect(rec.claimPlan?.map((c) => [c.route, c.role, c.amountEur])).toEqual([["forwarder", "primary", 350_000]]);
    expect((await caseRow("demo-c")).status).toBe("awaiting_approval");
  });
});

describe("case A: no claim", () => {
  it("the quality agent releases the product and closes the case with the reasoning, no human click", async () => {
    await mod.seedDemoCase(db, "A", NOW);
    const r = await run("demo-a", "investigate");
    expect(r.finalStatus).toBe("closed_no_claim");
    expect((await caseDrafts("demo-a")).filter((d) => d.kind === "protective_notice")).toHaveLength(0);
    const rec = await mod.getRecord(db, "demo-a");
    expect(rec.qaAssessment?.verdict).toBe("usable");
    expect(rec.outcome?.result).toBe("no_claim");
    expect((await caseRow("demo-a")).closedReason).toMatch(/stability allowance/i);
    expect(await db.select().from(schema.decisions).where(eq(schema.decisions.caseId, "demo-a"))).toHaveLength(0);
  });

  it("refuses a claim run on a closed case", async () => {
    const r = await run("demo-a", "prepare_claim");
    expect(r.status).toBe("failed");
    expect(r.error).toMatch(/after QA rejects/);
  });
});

describe("concurrency", () => {
  it("refuses a second run while one is in progress", async () => {
    await db.insert(schema.agentRuns).values({ id: "busy", caseId: "demo-c", kind: "investigate", mode: "deterministic", status: "running" });
    await expect(run("demo-c", "investigate")).rejects.toThrow(/already working/);
    await db.update(schema.agentRuns).set({ status: "failed" }).where(eq(schema.agentRuns.id, "busy"));
  });
});
