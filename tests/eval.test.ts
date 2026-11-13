import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
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
