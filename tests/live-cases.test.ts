import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import type { DB } from "@/lib/db/client";
import { FLEET } from "@/lib/live/fleet";
import { missingDocuments } from "@/lib/case/missing-docs";

process.env.KELVIN_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "kelvin-live-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;

let db: DB;
const TRIP = 12345;
const DELIVERED = new Date("2026-11-09T10:00:00Z");
const bad = FLEET.find((s) => s.profile?.kind === "excursion")!;
const fine = FLEET.find((s) => !s.profile)!;

beforeAll(async () => {
  const d = drizzle(new PGlite(), { schema });
  await migrate(d, { migrationsFolder: path.join(process.cwd(), "lib/db/migrations") });
  db = d as unknown as DB;
});

describe("live cases", () => {
  it("is idempotent and null for in-range trips or unknown ships", async () => {
    const { createLiveCase, liveCaseId } = await import("@/lib/live/live-cases");
    const a = await createLiveCase(db, bad.id, TRIP, DELIVERED);
    expect(a).toEqual({ caseId: liveCaseId(bad.id, TRIP), created: true });
    expect(a!.caseId).not.toContain("live-live");
    expect(await createLiveCase(db, bad.id, TRIP, DELIVERED)).toEqual({ caseId: a!.caseId, created: false });
    expect(await createLiveCase(db, fine.id, TRIP, DELIVERED)).toBeNull();
    expect(await createLiveCase(db, "nope", TRIP, DELIVERED)).toBeNull();
    const [row] = await db.select().from(schema.cases).where(eq(schema.cases.id, a!.caseId));
    expect(row.scenario).toBe("live");
    expect(row.deliveredAt?.toISOString()).toBe(DELIVERED.toISOString());
  });

  it("generated logger CSV matches tripExcursion", async () => {
    const { tripExcursion, createLiveCase } = await import("@/lib/live/live-cases");
    const { parseLogger } = await import("@/lib/agent/tools/investigate");
    const { executeTool } = await import("@/lib/agent/tool");
    const r = (await createLiveCase(db, bad.id, TRIP, DELIVERED))!;
    const exc = tripExcursion(bad, TRIP)!;
    expect(exc.peakC).toBeGreaterThan(8);
    const ctx = { db, caseId: r.caseId, runId: "r1", rules: (await import("@/lib/rules/config")).DEFAULT_RULES, nextSeq: (() => { let n = 0; return () => ++n; })(), emit: () => {} } as unknown as Parameters<typeof executeTool>[2];
    await db.insert(schema.agentRuns).values({ id: "r1", caseId: r.caseId, kind: "investigate", mode: "deterministic", status: "running" } as never).catch(() => {});
    const res = await executeTool(parseLogger, {}, ctx);
    expect(res.ok).toBe(true);
    if (res.ok) {
      const ex = (res.output as { excursions: { peakC: number; minutes: number }[] }).excursions;
      expect(Math.max(...ex.map((e) => e.peakC))).toBe(exc.peakC);
      expect(ex.reduce((s, e) => s + e.minutes, 0)).toBe(exc.minutesOutOfRange);
    }
  });

  it("a deterministic run on a logger + handling events only does not throw", async () => {
    const { createLiveCase } = await import("@/lib/live/live-cases");
    const { runAgent } = await import("@/lib/agent/orchestrator");
    const r = (await createLiveCase(db, bad.id, 999, DELIVERED))!;
    const out = await runAgent({ db, caseId: r.caseId, kind: "investigate", mode: "deterministic", now: DELIVERED, record: false });
    expect(out.status).toBe("completed");
    const [row] = await db.select().from(schema.cases).where(eq(schema.cases.id, r.caseId));
    expect(row.status).not.toBe("new");
    const { getRecord } = await import("@/lib/case/record");
    const rec = await getRecord(db, r.caseId);
    expect(rec.excursions?.length).toBeGreaterThan(0);
    expect(rec.custody?.attribution).toBeTruthy();
    expect(rec.missing?.length).toBeGreaterThan(0);
  });

  it("syncLiveCases opens cases for recent excursion trips only, once", async () => {
    const { syncLiveCases } = await import("@/lib/live/live-cases");
    const now = Date.UTC(2026, 10, 12);
    const n = await syncLiveCases(db, now, 72);
    expect(n).toBeGreaterThan(0);
    
    expect(await syncLiveCases(db, now, 72)).toBe(0);
  });
});

describe("missingDocuments", () => {
  it("lists absent documents", () => {
    expect(missingDocuments([]).map((m) => m.kind)).toEqual(["awb", "invoice", "contract", "policy", "stability_email"]);
    const all = missingDocuments([
      { kind: "awb" },
      { kind: "invoice" },
      { kind: "contract" },
      { kind: "policy" },
      { kind: "email", title: "Stability data Orenvacept" },
    ]);
    expect(all).toEqual([]);
    expect(missingDocuments([{ kind: "email", title: "Re: Extra costs" }]).some((m) => m.kind === "stability_email")).toBe(true);
    expect(missingDocuments([{ kind: "awb" }, { kind: "email", title: "Email (stability-data.eml)" }]).map((m) => m.kind)).toEqual(["invoice", "contract", "policy"]);
  });
});

describe("hardening", () => {
  it("concurrent createLiveCase: exactly one creates, no throw, no duplicate rows", async () => {
    const { createLiveCase, liveCaseId } = await import("@/lib/live/live-cases");
    const rs = await Promise.all([1, 2, 3].map(() => createLiveCase(db, bad.id, 777, DELIVERED)));
    expect(rs.filter((r) => r?.created).length).toBe(1);
    const id = liveCaseId(bad.id, 777);
    expect((await db.select().from(schema.documents).where(eq(schema.documents.caseId, id))).length).toBe(2);
    expect((await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.caseId, id))).length).toBe(3);
  });

  it("syncLiveCases opens at most one case per ship", async () => {
    const { syncLiveCases } = await import("@/lib/live/live-cases");
    const fresh = drizzle(new PGlite(), { schema });
    await migrate(fresh, { migrationsFolder: path.join(process.cwd(), "lib/db/migrations") });
    const n = await syncLiveCases(fresh as unknown as DB, Date.UTC(2026, 10, 12), 24 * 30);
    const rows = await fresh.select().from(schema.cases);
    expect(rows.length).toBe(n);
    expect(new Set(rows.map((r) => r.shipmentRef)).size).toBe(rows.length);
    expect(rows[0]?.title).toMatch(/, delivered /);
  });

  it("autoStart does not loop on prepare_claim without new documents", async () => {
    const { decideAutoStart } = await import("@/lib/case/auto-start");
    const base = { busy: false, status: "claim_prepared", qa: "pending" as const, closed: false, hasClaimLetterAwaitingApproval: false, hasApprovedDrafts: false, hasUnhandled: false };
    const t = (n: number) => new Date(n);
    expect(decideAutoStart({ ...base, runs: [], docs: [{ createdAt: t(1) }] })).toBe("prepare_claim");
    const done = [{ kind: "prepare_claim", status: "completed", finishedAt: t(10) }];
    expect(decideAutoStart({ ...base, runs: done, docs: [{ createdAt: t(1) }] })).toBeNull();
    expect(decideAutoStart({ ...base, runs: done, docs: [{ createdAt: t(11) }] })).toBe("prepare_claim");
    // New documents after the last investigation are read first, then the claim is prepared again.
    const investigated = [{ kind: "investigate", status: "completed", finishedAt: t(5) }, ...done];
    expect(decideAutoStart({ ...base, runs: investigated, docs: [{ createdAt: t(11) }] })).toBe("investigate");
    const reinvestigated = [{ kind: "investigate", status: "completed", finishedAt: t(12) }, ...done];
    expect(decideAutoStart({ ...base, runs: reinvestigated, docs: [{ createdAt: t(11) }] })).toBe("prepare_claim");
  });

  it("missingDocuments returns typed kinds", () => {
    const k: ReturnType<typeof missingDocuments>[number]["kind"] = "awb";
    expect(k).toBe("awb");
  });
});
