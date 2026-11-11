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

/** Full claim lifecycles with simulated counterparties: B ends recovered, C settled or recovered. */

process.env.KELVIN_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "kelvin-neg-"));
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;

const NOW = new Date("2026-11-09T10:00:00Z");
let db: DB;
let m: {
  runAgent: typeof import("@/lib/agent/orchestrator").runAgent;
  seedDemoCase: typeof import("@/seed/seed-db").seedDemoCase;
  gates: typeof import("@/lib/case/gates");
  deliver: typeof import("@/lib/counterparties/scripted").deliverDueReplies;
  getPersona: typeof import("@/lib/domain/personas").getPersona;
};

beforeAll(async () => {
  const d = drizzle(new PGlite(), { schema });
  await migrate(d, { migrationsFolder: path.join(process.cwd(), "lib/db/migrations") });
  db = d as unknown as DB;
  m = {
    runAgent: (await import("@/lib/agent/orchestrator")).runAgent,
    seedDemoCase: (await import("@/seed/seed-db")).seedDemoCase,
    gates: await import("@/lib/case/gates"),
    deliver: (await import("@/lib/counterparties/scripted")).deliverDueReplies,
    getPersona: (await import("@/lib/domain/personas")).getPersona,
  };
});

const run = (caseId: string, kind: "investigate" | "prepare_claim" | "follow_up") =>
  m.runAgent({ db, caseId, kind, mode: "deterministic", now: NOW, record: false });
const status = async (id: string) => (await db.select().from(schema.cases).where(eq(schema.cases.id, id)))[0];
const approveAll = async (id: string) => {
  const waiting = await db
    .select()
    .from(schema.drafts)
    .where(and(eq(schema.drafts.caseId, id), eq(schema.drafts.status, "awaiting_approval")));
  for (const d of waiting.filter((x) => x.kind !== "info_request")) {
    await m.gates.recordApproval(db, id, { draftId: d.id, decision: "approved", actor: m.getPersona("tom") });
  }
  return waiting.length;
};

async function toSent(code: "B" | "C") {
  const id = `demo-${code.toLowerCase()}`;
  await m.seedDemoCase(db, code, NOW);
  await run(id, "investigate");
  await m.gates.recordQaDecision(db, id, { decision: "rejected", actor: m.getPersona("elena") });
  await run(id, "prepare_claim");
  await approveAll(id);
  await run(id, "follow_up");
  return id;
}

describe("case B with the insurer", () => {
  it("asks for the invoice, gets it after approval, pays and the case closes as recovered", async () => {
    const id = await toSent("B");
    expect((await status(id)).status).toBe("sent");

    const replies = await m.deliver(db, id, new Date(NOW.getTime() + 60_000));
    expect(replies.map((r) => r.counterparty).sort()).toEqual(["Boreal Air Cargo", "Meridian Marine & Cargo Insurance SE"]);
    await run(id, "follow_up");
    expect((await status(id)).status).toBe("in_negotiation");

    const reply = (await db.select().from(schema.drafts).where(eq(schema.drafts.caseId, id))).find((d) => d.kind === "reply");
    expect(reply?.status).toBe("awaiting_approval");
    expect(reply?.annexes.some((a) => a.startsWith("CI-"))).toBe(true);
    // Nothing goes out before approval
    await m.deliver(db, id, new Date(NOW.getTime() + 120_000));
    expect((await status(id)).status).toBe("in_negotiation");

    expect(await approveAll(id)).toBe(1);
    await run(id, "follow_up");
    await m.deliver(db, id, new Date(NOW.getTime() + 180_000));
    await run(id, "follow_up");
    const final = await status(id);
    expect(final.status).toBe("closed_recovered");
    expect(final.recoveredEur).toBe(190_000);
  });
});

describe("case C with the forwarder", () => {
  it("offers 90 %; the manager settles and the case closes as settled", async () => {
    const id = await toSent("C");
    await m.deliver(db, id, new Date(NOW.getTime() + 60_000));
    await run(id, "follow_up");
    const c = await status(id);
    expect(c.status).toBe("in_negotiation");
    const rec = c.record as { negotiation?: { offerEur: number } };
    expect(rec.negotiation?.offerEur).toBe(315_000);
    await expect(m.gates.recordSettlement(db, id, { decision: "accept", actor: m.getPersona("elena") })).rejects.toThrow(/cannot decide/);
    await m.gates.recordSettlement(db, id, { decision: "accept", actor: m.getPersona("tom") });
    const final = await status(id);
    expect(final.status).toBe("closed_settled");
    expect(final.recoveredEur).toBe(315_000);
  });

  it("insisting sends a cited counter-letter after approval and recovers the full amount", async () => {
    const id = await toSent("C");
    await m.deliver(db, id, new Date(NOW.getTime() + 60_000));
    await run(id, "follow_up");
    await m.gates.recordSettlement(db, id, { decision: "counter", actor: m.getPersona("tom") });
    const counter = (await db.select().from(schema.drafts).where(eq(schema.drafts.caseId, id))).find((d) => d.kind === "reply" && d.status === "awaiting_approval");
    expect(counter?.body).toMatch(/\[S\d+\]/);
    await approveAll(id);
    await run(id, "follow_up");
    await m.deliver(db, id, new Date(NOW.getTime() + 120_000));
    await run(id, "follow_up");
    const final = await status(id);
    expect(final.status).toBe("closed_recovered");
    expect(final.recoveredEur).toBe(350_000);
  });
});
