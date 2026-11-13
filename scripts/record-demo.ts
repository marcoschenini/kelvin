/**
 * Regenerates the deterministic demo recordings in demo/recordings/.
 *
 *   npx tsx --conditions=react-server scripts/record-demo.ts
 *
 * Plays the three demo cases through the deterministic planner (A: the quality
 * agent closes the case; B and C: the claim is prepared in the investigate run;
 * B: the manager approves and the agent sends). Existing demo recordings are
 * replaced. In local mode stop the dev server first (PGlite is single-process).
 */
import fs from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/lib/db/client";
import { drafts } from "@/lib/db/schema";
import { getPersona } from "@/lib/domain/personas";
import { recordApproval } from "@/lib/case/gates";
import { DEMO_RECORDINGS_DIR } from "@/lib/agent/recorder";
import { runAgent } from "@/lib/agent/orchestrator";
import { seedDemoCase } from "@/seed/seed-db";

async function main() {
  const db = await getDb();
  await fs.rm(DEMO_RECORDINGS_DIR, { recursive: true, force: true });
  for (const code of ["A", "B", "C"] as const) {
    const caseId = `demo-${code.toLowerCase()}`;
    await seedDemoCase(db, code);
    const run = (kind: "investigate" | "follow_up") => runAgent({ db, caseId, kind, mode: "deterministic" });
    const r = await run("investigate");
    console.log(`${caseId} investigate: ${r.status}, case is ${r.finalStatus}`);
    if (code === "B") {
      const waiting = await db.select().from(drafts).where(and(eq(drafts.caseId, caseId), eq(drafts.status, "awaiting_approval")));
      for (const d of waiting.filter((x) => x.kind !== "info_request")) await recordApproval(db, caseId, { draftId: d.id, decision: "approved", actor: getPersona("tom") });
      const f = await run("follow_up");
      console.log(`${caseId} follow_up: ${f.status}, case is ${f.finalStatus}`);
    }
  }
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  await closeDb().catch(() => {});
  process.exit(1);
});
