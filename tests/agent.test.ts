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

describe("case B: insurer + protective notice to the airline", () => {
  it("investigates, attributes the excursion to the airline and drafts a protective notice", async () => {
    await mod.seedDemoCase(db, "B", NOW);
    const r = await run("demo-b", "investigate");
    expect(r.status).toBe("completed");
    expect((await caseRow("demo-b")).status).toBe("awaiting_qa");
    const rec = await mod.getRecord(db, "demo-b");
    expect(rec.custody?.attribution?.role).toBe("airline");
    expect(rec.ranking?.find((x) => x.recommended)?.route).toBe("insurer");
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

  it("blocks the claim letter until QA rejects, then prepares a fully cited claim", async () => {
    const elena = mod.getPersona("elena");
    const tom = mod.getPersona("tom");
    await expect(mod.recordQaDecision(db, "demo-b", { decision: "rejected", actor: tom })).rejects.toThrow(/cannot make the QA decision/);
    await mod.recordQaDecision(db, "demo-b", { decision: "rejected", note: "Outside stability data", actor: elena });
    const r = await run("demo-b", "prepare_claim");
    expect(r.finalStatus).toBe("awaiting_approval");
    const [letter] = (await caseDrafts("demo-b")).filter((d) => d.kind === "claim_letter");
    expect(letter.route).toBe("insurer");
    expect(letter.amountEur).toBe(190_000);
    const cits = letter.citations as { kind: string }[];
    expect(cits.length).toBeGreaterThan(8);
    expect(cits.filter((c) => c.kind === "assumption")).toHaveLength(0);
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
    expect(out).toHaveLength(2);
    expect(out.every((m) => m.approvalDecisionId && m.simulated)).toBe(true);
  });

  it("logs every tool call to the audit trail", async () => {
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.caseId, "demo-b"));
    const tools = new Set(audit.filter((a) => a.eventType === "tool_call").map((a) => a.tool));
    for (const t of ["parse_logger", "build_custody_timeline", "check_contract", "check_policy", "compute_liability", "compute_deadlines", "rank_routes", "draft_protective_notice", "draft_claim_letter", "build_evidence_pack", "send_via_outbox"]) {
      expect(tools.has(t)).toBe(true);
    }
    expect(audit.some((a) => a.eventType === "qa_decision" && a.actorName === "Elena Weber")).toBe(true);
    expect(audit.filter((a) => a.eventType === "approval_decision").length).toBe(2);
  });
});

describe("case C: full claim against the forwarder", () => {
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

describe("case A: no claim", () => {
  it("closes with the reason logged once QA releases", async () => {
    await mod.seedDemoCase(db, "A", NOW);
    await run("demo-a", "investigate");
    expect((await caseDrafts("demo-a")).filter((d) => d.kind === "protective_notice")).toHaveLength(0);
    await mod.recordQaDecision(db, "demo-a", { decision: "released", note: "Within stability budget", actor: mod.getPersona("elena") });
    expect((await caseRow("demo-a")).status).toBe("no_claim");
    const r = await run("demo-a", "close");
    expect(r.finalStatus).toBe("closed_no_claim");
    expect((await caseRow("demo-a")).closedReason).toMatch(/QA released/);
  });

  it("refuses a claim run on a released case", async () => {
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
