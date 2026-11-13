/**
 * npm run eval                 run all evaluation cases (live if a model key is set, else deterministic)
 * npm run eval -- --deterministic
 * npm run eval -- --limit 5
 * Stop the dev server first in local mode (PGlite is single-process).
 */
import { closeDb, getDb } from "@/lib/db/client";
import { runEvaluation } from "@/lib/eval/harness";

const args = process.argv.slice(2);
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : undefined;
const pct = (v: number) => `${Math.round(v * 100)}%`;

async function main() {
  const db = await getDb();
  const { summary } = await runEvaluation(db, {
    mode: args.includes("--deterministic") ? "deterministic" : undefined,
    limit,
    onEvent: (e) => {
      if (e.type === "started") console.log(`Evaluating ${e.total} cases (${e.mode}${e.model ? ` · ${e.model}` : ""})`);
      if (e.type === "case") {
        const r = e.result;
        const bad = Object.entries(r.checks).filter(([, ok]) => !ok).map(([k]) => k);
        console.log(`${r.correct ? "✓" : "✗"} ${r.caseId} ${r.title.padEnd(52)} ${String(r.durationMs).padStart(6)} ms ${bad.length ? `wrong: ${bad.join(", ")} (route ${r.actual.route} vs ${r.key.route}; notices ${r.actual.notices} vs ${r.key.notices})` : ""}${r.actual.errors.length ? ` errors: ${r.actual.errors.join("; ")}` : ""}`);
      }
    },
  });
  console.log(
    `\nRoute ${pct(summary.routeAccuracy)} · deadlines ${pct(summary.deadlineAccuracy)} · claim ${pct(summary.claimAccuracy)} · custody ${pct(summary.custodyAccuracy)} · notices ${pct(summary.noticeAccuracy)} · citations ${summary.citationCoverage == null ? "n/a" : pct(summary.citationCoverage)} · ${Math.round(summary.avgMsPerCase)} ms/case · ${summary.correct}/${summary.cases} fully correct`,
  );
  await closeDb();
}
main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
