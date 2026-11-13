/**
 * Run the agent on a demo case from the terminal.
 *
 *   npm run agent -- B                         investigate case B (live if a key is set, else deterministic)
 *   npm run agent -- B --qa rejected           …then QA rejects (as Elena Weber) and the claim is prepared
 *   npm run agent -- B --qa rejected --approve …then Tom Becker approves everything and the agent sends it
 *   npm run agent -- A --qa released           …QA releases and the case is closed
 *   flags: --deterministic  --no-seed  --print-letters
 *
 * In local mode stop the dev server first (PGlite is single-process).
 */
import "./load-env";
import { and, asc, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/client";
import { agentRuns, auditEvents, drafts } from "@/lib/db/schema";
import { getPersona } from "@/lib/domain/personas";
import { formatEUR } from "@/lib/format";
import { getRecord } from "@/lib/case/record";
import { recordApproval, recordQaDecision } from "@/lib/case/gates";
import type { AgentEvent, RunKind } from "@/lib/agent/events";
import { runAgent } from "@/lib/agent/orchestrator";
import { seedDemoCase } from "@/seed/seed-db";

const args = process.argv.slice(2);
const code = (args.find((a) => /^[ABC]$/i.test(a)) ?? "B").toUpperCase() as "A" | "B" | "C";
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const color = (c: number, s: string) => `\x1b[${c}m${s}\x1b[0m`;

function printer(e: AgentEvent) {
  switch (e.type) {
    case "run_started":
      console.log(`\n${bold(`▶ ${e.kind}`)} ${dim(`${e.mode}${e.model ? ` · ${e.model}` : ""} · ${e.runId}`)}`);
      break;
    case "text":
      process.stdout.write(dim(e.delta));
      break;
    case "step_started":
      process.stdout.write(`\n  ${color(36, "→")} ${e.tool} `);
      break;
    case "step_finished": {
      const cites = e.citations.map((c) => c.id).filter(Boolean).join(" ");
      console.log(
        e.status === "ok"
          ? `${color(32, "✓")} ${dim(`${e.durationMs} ms`)}\n    ${e.summary}${cites ? dim(`  [${cites}]`) : ""}`
          : `${color(31, "✗")} ${e.error}`,
      );
      break;
    }
    case "status":
      console.log(`\n  ${color(35, "◆")} status ${e.from} → ${bold(e.to)}${e.reason ? dim(`  (${e.reason})`) : ""}`);
      break;
    case "run_finished":
      console.log(`\n${e.status === "completed" ? color(32, "■ done") : color(31, `■ failed: ${e.error}`)} ${dim(`${(e.durationMs / 1000).toFixed(1)} s · case is ${e.finalStatus}`)}\n`);
      break;
  }
}

async function main() {
  const db = await getDb();
  const caseId = `demo-${code.toLowerCase()}`;
  if (!flag("no-seed")) {
    await seedDemoCase(db, code);
    console.log(dim(`Seeded demo case ${code} (${caseId}).`));
  }
  const mode = flag("deterministic") ? ("deterministic" as const) : undefined;
  const run = (kind: RunKind) => runAgent({ db, caseId, kind, mode, onEvent: printer });

  const first = await run("investigate");
  if (first.status === "failed") throw new Error(first.error);

  const qa = opt("qa") as "released" | "rejected" | undefined;
  if (qa) {
    const elena = getPersona("elena");
    await recordQaDecision(db, caseId, {
      decision: qa,
      note: qa === "released" ? "Within the stability budget for this product (SR-114)." : "Outside stability data; batch rejected.",
      actor: elena,
    });
    console.log(`${color(35, "◆")} ${bold("Human decision")}: QA ${qa} by ${elena.name}`);
    await run(qa === "rejected" ? "prepare_claim" : "close");
  }

  if (flag("approve")) {
    const tom = getPersona("tom");
    const waiting = await db.select().from(drafts).where(and(eq(drafts.caseId, caseId), eq(drafts.status, "awaiting_approval")));
    for (const d of waiting.filter((x) => x.kind !== "info_request")) {
      await recordApproval(db, caseId, { draftId: d.id, decision: "approved", actor: tom });
      console.log(`${color(35, "◆")} ${bold("Human decision")}: ${d.kind} to ${d.recipientName} approved by ${tom.name}`);
    }
    await run("follow_up");
  }

  /* --------------------------- report --------------------------- */
  const record = await getRecord(db, caseId);
  console.log(bold("Routes"));
  for (const r of record.ranking ?? []) {
    console.log(
      `  ${r.recommended ? color(32, "★") : " "} ${r.route.padEnd(9)} ${formatEUR(r.recoverableEur).padStart(10)}  p=${r.probability.toFixed(2)}  expected ${formatEUR(r.expectedEur)}${r.blockers.length ? dim(`  — ${r.blockers[0]}`) : ""}`,
    );
  }
  console.log(bold("Deadlines"));
  for (const d of record.deadlines ?? []) console.log(`  ${d.id.padEnd(18)} ${d.dueAt.slice(0, 10)}  ${String(d.daysLeft).padStart(4)} days  ${d.status}`);
  const allDrafts = await db.select().from(drafts).where(eq(drafts.caseId, caseId)).orderBy(asc(drafts.createdAt));
  console.log(bold("Drafts"));
  for (const d of allDrafts) console.log(`  ${d.kind.padEnd(18)} ${d.status.padEnd(18)} → ${d.recipientName} ${d.amountEur ? formatEUR(d.amountEur) : ""}  ${dim(`${(d.citations as unknown[]).length} citations`)}`);
  if (flag("print-letters")) for (const d of allDrafts) console.log(`\n${bold(d.subject)}\n${d.body}\n`);
  const runs = await db.select().from(agentRuns).where(eq(agentRuns.caseId, caseId));
  const audits = await db.select().from(auditEvents).where(eq(auditEvents.caseId, caseId));
  console.log(dim(`\n${runs.length} runs, ${audits.length} audit events. Recordings: ${runs.map((r) => r.recordingPath).filter(Boolean).join(", ")}`));
  await closeDb();
}

main().catch(async (e) => {
  console.error(color(31, e instanceof Error ? (e.stack ?? e.message) : String(e)));
  await closeDb().catch(() => {});
  process.exit(1);
});
