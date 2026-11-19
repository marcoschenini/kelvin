import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import type { DB } from "@/lib/db/client";

process.env.KELVIN_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "kelvin-eval-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;

describe("evaluation set", () => {
  it("has 27 cases (24 original keys plus 3 workflow v2 keys) and every one matches its answer key", async () => {
    const d = drizzle(new PGlite(), { schema });
    await migrate(d, { migrationsFolder: path.join(process.cwd(), "lib/db/migrations") });
    const { runEvaluation } = await import("@/lib/eval/harness");
    const { results, summary } = await runEvaluation(d as unknown as DB, { mode: "deterministic" });
    const wrong = results.filter((r) => !r.correct).map((r) => `${r.caseId}: ${JSON.stringify(r.checks)} ${r.actual.errors.join("; ")}`);
    expect(results.length).toBe(27);
    expect(wrong).toEqual([]);
    expect(summary.routeAccuracy).toBe(1);
    expect(summary.deadlineAccuracy).toBe(1);
    expect(summary.qaAgentAccuracy).toBe(1);
    expect(summary.citationCoverage).toBe(1);
    // near-limit case: the quality agent is unsure and a human QA decides
    expect(results.find((r) => r.caseId === "eval-25")?.actual.qaAgent).toBe("unsure");
    // extra costs raise the claim: €350,000 goods + €20,000 documented costs
    expect(results.find((r) => r.caseId === "eval-26")?.actual.claimAmountEur).toBe(370_000);
    // part-payment: exactly one appeal
    expect(results.find((r) => r.caseId === "eval-27")?.actual.appeals).toBe(1);
  }, 240_000);
});

describe("single evaluation run guard", () => {
  async function fresh() {
    const d = drizzle(new PGlite(), { schema });
    await migrate(d, { migrationsFolder: path.join(process.cwd(), "lib/db/migrations") });
    return d as unknown as DB;
  }

  it("rejects a second concurrent start and allows one after the first finishes", async () => {
    const db = await fresh();
    const { runEvaluation, EvalBusyError } = await import("@/lib/eval/harness");
    const first = runEvaluation(db, { mode: "deterministic", limit: 1 });
    const second = runEvaluation(db, { mode: "deterministic", limit: 1 });
    const [a, b] = await Promise.allSettled([first, second]);
    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("rejected");
    expect((b as PromiseRejectedResult).reason).toBeInstanceOf(EvalBusyError);
    await expect(runEvaluation(db, { mode: "deterministic", limit: 1 })).resolves.toBeDefined();
  }, 120_000);

  it("a stale running row does not block and is marked failed; a fresh one blocks", async () => {
    const db = await fresh();
    const { claimEvalRun, EvalBusyError, EVAL_STALE_MS } = await import("@/lib/eval/harness");
    await db.insert(schema.evalRuns).values({ id: "old", mode: "deterministic", status: "running", total: 1, startedAt: new Date(Date.now() - EVAL_STALE_MS - 1000) });
    const c = await claimEvalRun(db, { mode: "deterministic", limit: 1 });
    const old = await db.select().from(schema.evalRuns).where(eq(schema.evalRuns.id, "old"));
    expect(old[0].status).toBe("failed");
    await expect(claimEvalRun(db, { mode: "deterministic" })).rejects.toBeInstanceOf(EvalBusyError);
    expect(c.runId).toMatch(/^eval-/);
  });

  it("a run whose event sink throws (aborted stream) ends failed, not running", async () => {
    const db = await fresh();
    const { runEvaluation } = await import("@/lib/eval/harness");
    await expect(
      runEvaluation(db, { mode: "deterministic", limit: 2, onEvent: (e) => { if (e.type === "case") throw new Error("aborted"); } }),
    ).rejects.toThrow("aborted");
    const rows = await db.select().from(schema.evalRuns);
    expect(rows.map((r) => r.status)).toEqual(["failed"]);
  }, 120_000);
});
