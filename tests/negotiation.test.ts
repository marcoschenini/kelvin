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
  await run(id, "investigate"); // the quality agent decides and the claim is prepared in the same run
  await approveAll(id);
  await run(id, "follow_up");
  return id;
}

describe("case B with the insurer", () => {
  it("asks for the invoice, gets it after approval, pays and the case closes as recovered", async () => {
    const id = await toSent("B");
    expect((await status(id)).status).toBe("sent");

    const replies = await m.deliver(db, id, new Date(NOW.getTime() + 60_000));
    // the airline answers both the protective notice and the secondary claim
    expect(replies.map((r) => r.counterparty).sort()).toEqual(["Boreal Air Cargo", "Boreal Air Cargo", "Meridian Marine & Cargo Insurance SE"]);
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
    // insurer €190,000 (primary) + airline €3,771 (secondary)
    expect(final.recoveredEur).toBe(193_771);
  });
});

/** C: the forwarder offers 90 %, the agent appeals once, the forwarder improves to 95 %: now the manager decides. */
async function toSecondOffer() {
  const id = await toSent("C");
  await m.deliver(db, id, new Date(NOW.getTime() + 60_000));
  await run(id, "follow_up");
  return id;
}

describe("case C with the forwarder", () => {
  it("a 90 % offer triggers exactly one appeal with extra evidence, which needs approval", async () => {
    const id = await toSecondOffer();
    expect((await status(id)).status).toBe("in_negotiation");
    const rec = (await status(id)).record as { followUp?: { appeals: { draftId: string }[] }; negotiation?: unknown };
    expect(rec.followUp?.appeals).toHaveLength(1);
    expect(rec.negotiation ?? null).toBeNull();
    const appeal = (await db.select().from(schema.drafts).where(eq(schema.drafts.id, rec.followUp!.appeals[0].draftId)))[0];
    expect(appeal.kind).toBe("reply");
    expect(appeal.status).toBe("awaiting_approval");
    expect(appeal.subject).toMatch(/^Appeal –/);
    expect(appeal.body).toMatch(/\[S\d+\]/);
  });

  it("a second appeal is refused with a ToolGuardError", async () => {
    const id = await toSecondOffer();
    const ctx = {
      db,
      caseId: id,
      runId: "appeal-test",
      kind: "follow_up" as const,
      mode: "deterministic" as const,
      model: null,
      now: NOW,
      rules: await (await import("@/lib/rules/load")).loadRules(db),
      emit: () => {},
      nextSeq: (() => {
        let n = 5000;
        return () => ++n;
      })(),
    };
    await db.insert(schema.agentRuns).values({ id: "appeal-test", caseId: id, kind: "follow_up", mode: "deterministic", status: "completed" });
    const { executeTool } = await import("@/lib/agent/tool");
    const { getTool } = await import("@/lib/agent/tools");
    const reply = (await db.select().from(schema.outboxMessages).where(eq(schema.outboxMessages.caseId, id))).find((x) => x.direction === "in" && /offer/.test(x.body))!;
    const res = await executeTool(getTool("draft_appeal"), { messageId: reply.id }, ctx);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/already been used/);
  });

  it("after the appeal the forwarder offers 95 %; the manager settles and the case closes as settled", async () => {
    const id = await toSecondOffer();
    expect(await approveAll(id)).toBe(1); // the appeal
    await run(id, "follow_up");
    await m.deliver(db, id, new Date(NOW.getTime() + 120_000));
    await run(id, "follow_up");
    const c = await status(id);
    expect(c.status).toBe("in_negotiation");
    const rec = c.record as { negotiation?: { offerEur: number } };
    expect(rec.negotiation?.offerEur).toBe(332_500);
    await expect(m.gates.recordSettlement(db, id, { decision: "accept", actor: m.getPersona("elena") })).rejects.toThrow(/cannot decide/);
    await m.gates.recordSettlement(db, id, { decision: "accept", actor: m.getPersona("tom") });
    const final = await status(id);
    expect(final.status).toBe("closed_settled");
    expect(final.recoveredEur).toBe(332_500);
    expect((final.record as { outcome?: { result: string } }).outcome?.result).toBe("settled");
  });

  it("insisting sends a cited counter-letter after approval and recovers the full amount", async () => {
    const id = await toSecondOffer();
    await approveAll(id);
    await run(id, "follow_up");
    await m.deliver(db, id, new Date(NOW.getTime() + 120_000));
    await run(id, "follow_up");
    await m.gates.recordSettlement(db, id, { decision: "counter", actor: m.getPersona("tom") });
    const counter = (await db.select().from(schema.drafts).where(eq(schema.drafts.caseId, id))).find((d) => d.kind === "reply" && d.status === "awaiting_approval");
    expect(counter?.body).toMatch(/\[S\d+\]/);
    await approveAll(id);
    await run(id, "follow_up");
    await m.deliver(db, id, new Date(NOW.getTime() + 180_000));
    await run(id, "follow_up");
    const final = await status(id);
    expect(final.status).toBe("closed_recovered");
    expect(final.recoveredEur).toBe(350_000);
  });
});

describe("reminders and rejection", () => {
  it("drafts a reminder after 14 days without a reply, only once per mark, and it needs approval", async () => {
    const id = await toSent("C");
    const later = (days: number) => m.runAgent({ db, caseId: id, kind: "follow_up", mode: "deterministic", now: new Date(NOW.getTime() + days * 86_400_000), record: false });
    const countReminders = async () => (await db.select().from(schema.drafts).where(eq(schema.drafts.caseId, id))).filter((d) => d.subject.startsWith("Reminder –"));
    await later(13);
    expect(await countReminders()).toHaveLength(0);
    await later(15);
    const [r1] = await countReminders();
    expect(r1.kind).toBe("reply");
    expect(r1.status).toBe("awaiting_approval");
    await later(16);
    expect(await countReminders()).toHaveLength(1);
    await m.gates.recordApproval(db, id, { draftId: r1.id, decision: "approved", actor: m.getPersona("tom") });
    await later(31);
    expect(await countReminders()).toHaveLength(2);
    expect((await status(id)).record as { followUp?: { remindersSent: number[] } }).toMatchObject({ followUp: { remindersSent: [14, 30] } });
  });

  it("a reply stops the reminders", async () => {
    const id = await toSent("B");
    await m.deliver(db, id, new Date(NOW.getTime() + 60_000));
    await m.runAgent({ db, caseId: id, kind: "follow_up", mode: "deterministic", now: new Date(NOW.getTime() + 20 * 86_400_000), record: false });
    const rem = (await db.select().from(schema.drafts).where(eq(schema.drafts.caseId, id))).filter((d) => d.subject.startsWith("Reminder –"));
    expect(rem).toHaveLength(0);
  });

  it("rejecting the claim letter closes the case as not approved with the reason in the audit log", async () => {
    const id = "demo-c";
    await m.seedDemoCase(db, "C", NOW);
    await run(id, "investigate");
    const claim = (await db.select().from(schema.drafts).where(eq(schema.drafts.caseId, id))).find((d) => d.kind === "claim_letter")!;
    await m.gates.recordApproval(db, id, { draftId: claim.id, decision: "rejected", reason: "Amount needs a second look", actor: m.getPersona("tom") });
    const c = await status(id);
    expect(c.status).toBe("closed_not_approved");
    expect((c.record as { outcome?: { result: string } }).outcome?.result).toBe("not_approved");
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.caseId, id));
    expect(audit.some((a) => a.eventType === "status_changed" && JSON.stringify(a.output).includes("Amount needs a second look"))).toBe(true);
  });
});
