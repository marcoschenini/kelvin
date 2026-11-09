import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { settings } from "@/lib/db/schema";
import { mergeRules, type RulesConfig } from "./config";

export const RULES_SETTINGS_KEY = "rules";

/** Defaults merged with any override saved in Settings. */
export async function loadRules(db: DB): Promise<RulesConfig> {
  const [row] = await db.select().from(settings).where(eq(settings.key, RULES_SETTINGS_KEY));
  return mergeRules(row?.value);
}

export async function saveRulesOverride(db: DB, override: Partial<RulesConfig>): Promise<void> {
  await db
    .insert(settings)
    .values({ key: RULES_SETTINGS_KEY, value: override })
    .onConflictDoUpdate({ target: settings.key, set: { value: override, updatedAt: new Date() } });
}
