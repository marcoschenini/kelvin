import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";

/** Safety rules enforced by the database itself, not only by application code. */

let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  const client = new PGlite();
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "lib/db/migrations") });
  await db.insert(schema.cases).values({ id: "t1", shipmentRef: "T-1", title: "Test", scenario: "eval" });
});

describe("outbox", () => {
  it("rejects an outgoing message without an approval decision", async () => {
    await expect(
      db.insert(schema.outboxMessages).values({
        id: "m1",
        caseId: "t1",
        direction: "out",
        counterparty: "carrier",
        fromAddress: "a@x.example",
        toAddress: "b@x.example",
        subject: "Claim",
        body: "…",
      }),
    ).rejects.toThrow();
  });

  it("accepts it once an approval decision exists", async () => {
    await db.insert(schema.decisions).values({
      id: "d1",
      caseId: "t1",
      gate: "approval",
      decision: "approved",
      actorName: "Tom Becker",
      actorRole: "Claims Manager",
    });
    await db.insert(schema.outboxMessages).values({
      id: "m2",
      caseId: "t1",
      direction: "out",
      approvalDecisionId: "d1",
      counterparty: "carrier",
      fromAddress: "a@x.example",
      toAddress: "b@x.example",
      subject: "Claim",
      body: "…",
    });
    const rows = await db.select().from(schema.outboxMessages);
    expect(rows).toHaveLength(1);
  });

  it("accepts incoming replies without approval", async () => {
    await db.insert(schema.outboxMessages).values({
      id: "m3",
      caseId: "t1",
      direction: "in",
      counterparty: "carrier",
      fromAddress: "b@x.example",
      toAddress: "a@x.example",
      subject: "Re: Claim",
      body: "…",
    });
  });
});

describe("audit_events", () => {
  it("is append-only", async () => {
    const [row] = await db
      .insert(schema.auditEvents)
      .values({ caseId: "t1", actorType: "system", actorName: "test", eventType: "x" })
      .returning();
    // Drizzle wraps the Postgres error; the trigger message is on `cause`.
    const reason = (p: Promise<unknown>) =>
      p.then(
        () => "no error",
        (e: Error & { cause?: Error }) => e.cause?.message ?? e.message,
      );
    expect(await reason(db.update(schema.auditEvents).set({ eventType: "y" }).where(eq(schema.auditEvents.id, row.id)))).toMatch(
      /append-only \(UPDATE rejected\)/,
    );
    expect(await reason(db.delete(schema.auditEvents).where(eq(schema.auditEvents.id, row.id)))).toMatch(
      /append-only \(DELETE rejected\)/,
    );
  });
});
