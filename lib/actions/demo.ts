"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";
import { PERSONA_COOKIE, getPersona } from "@/lib/domain/personas";
import { resetDemo, seedDemoCase } from "@/seed/seed-db";

async function actor() {
  const jar = await cookies();
  return getPersona(jar.get(PERSONA_COOKIE)?.value);
}

/** Load (or reload) one demo case and open it. */
export async function loadDemoCaseAction(code: "A" | "B" | "C") {
  if (!["A", "B", "C"].includes(code)) throw new Error("Unknown demo case");
  const db = await getDb();
  const g = await seedDemoCase(db, code);
  const who = await actor();
  await db.insert(auditEvents).values({
    caseId: g.spec.id,
    actorType: "human",
    actorName: who.name,
    actorRole: who.title,
    eventType: "demo_case_loaded",
    input: { code },
  });
  redirect(`/cases/${g.spec.id}`);
}

/** Wipe everything and re-seed demo cases A, B and C anchored to now. */
export async function resetDemoAction() {
  const db = await getDb();
  await resetDemo(db);
  redirect("/");
}
