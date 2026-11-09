"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { auditEvents } from "@/lib/db/schema";
import { saveRulesOverride } from "@/lib/rules/load";

const RulesForm = z.object({
  eurPerSdr: z.coerce.number().positive().max(10),
  sdrAsOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  earlyNoticeThresholdDays: z.coerce.number().int().min(0).max(30),
  atRiskDays: z.coerce.number().int().min(0).max(30),
});

export async function saveRulesAction(_prev: unknown, form: FormData): Promise<{ ok: boolean; error?: string }> {
  const parsed = RulesForm.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, error: "Check the values: rate > 0, date as YYYY-MM-DD, days 0–30." };
  const v = parsed.data;
  const db = await getDb();
  await saveRulesOverride(db, {
    sdr: { eurPerSdr: v.eurPerSdr, asOf: v.sdrAsOf, source: "Set in Settings" },
    earlyNoticeThresholdDays: v.earlyNoticeThresholdDays,
    atRiskDays: v.atRiskDays,
  });
  await db.insert(auditEvents).values({ actorType: "human", actorName: "Settings", eventType: "rules_updated", input: v });
  revalidatePath("/settings");
  return { ok: true };
}
