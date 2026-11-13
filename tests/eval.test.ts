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
  it("has at least 20 cases and every one matches its answer key", async () => {
    const d = drizzle(new PGlite(), { schema });
    await migrate(d, { migrationsFolder: path.join(process.cwd(), "lib/db/migrations") });
    const { runEvaluation } = await import("@/lib/eval/harness");
    const { results, summary } = await runEvaluation(d as unknown as DB, { mode: "deterministic" });
    const wrong = results.filter((r) => !r.correct).map((r) => `${r.caseId}: ${JSON.stringify(r.checks)} ${r.actual.errors.join("; ")}`);
    expect(results.length).toBeGreaterThanOrEqual(20);
    expect(wrong).toEqual([]);
    expect(summary.routeAccuracy).toBe(1);
    expect(summary.deadlineAccuracy).toBe(1);
    expect(summary.citationCoverage).toBe(1);
  }, 240_000);
});
