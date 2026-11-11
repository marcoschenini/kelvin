import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * Database access.
 *
 *  DB_MODE=local    (default) embedded Postgres via PGlite, stored in .data/pglite
 *  DB_MODE=supabase hosted Postgres via DATABASE_URL (Supabase pooler)
 *
 * Both share one Drizzle schema and one set of SQL migrations, applied lazily on
 * first use. PGlite is single-process: a lock file stops a CLI script and the dev
 * server from opening the same data directory at once.
 */

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

/** On Vercel only /tmp is writable: the public demo keeps its database there. */
export const DATA_DIR = path.resolve(
  process.env.KELVIN_DATA_DIR ?? (process.env.VERCEL ? "/tmp/kelvin" : path.join(process.cwd(), ".data")),
);

/** Public demo: seed cases A, B and C automatically when the database starts empty. */
export function autoSeedEnabled(): boolean {
  return process.env.KELVIN_AUTOSEED === "1" || (!!process.env.VERCEL && process.env.KELVIN_AUTOSEED !== "0");
}
const MIGRATIONS_DIR = path.join(process.cwd(), "lib", "db", "migrations");

type Handle = { db: DB; close: () => Promise<void> };

const g = globalThis as unknown as { __kelvinDb?: Promise<Handle> };

export function dbMode(): "local" | "supabase" {
  return process.env.DB_MODE === "supabase" ? "supabase" : "local";
}

function acquireLock(dir: string) {
  const lock = path.join(dir, "kelvin.lock");
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, "utf8"));
    let alive = false;
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {
        alive = false;
      }
    }
    if (alive) {
      throw new Error(
        `The local database is in use by process ${pid} (probably the dev server). ` +
          `Stop it, or use the in-app Settings → Reset demo instead.`,
      );
    }
  }
  fs.writeFileSync(lock, String(process.pid));
  const release = () => {
    try {
      if (fs.existsSync(lock) && fs.readFileSync(lock, "utf8") === String(process.pid)) fs.unlinkSync(lock);
    } catch {
      /* ignore */
    }
  };
  process.once("exit", release);
  return release;
}

async function openLocal(): Promise<Handle> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const dir = path.join(DATA_DIR, "pglite");
  fs.mkdirSync(dir, { recursive: true });
  const release = acquireLock(DATA_DIR);
  const client = new PGlite(dir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  if (autoSeedEnabled()) {
    const { cases } = schema;
    const existing = await db.select({ id: cases.id }).from(cases).limit(1);
    if (!existing.length) {
      const { resetDemo } = await import("@/seed/seed-db");
      await resetDemo(db as unknown as DB);
    }
  }
  return {
    db: db as unknown as DB,
    close: async () => {
      await client.close();
      release();
    },
  };
}

async function openSupabase(): Promise<Handle> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DB_MODE=supabase requires DATABASE_URL");
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { prepare: false, max: 5 });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return { db: db as unknown as DB, close: () => client.end() };
}

export async function getDb(): Promise<DB> {
  if (!g.__kelvinDb) {
    g.__kelvinDb = (dbMode() === "supabase" ? openSupabase() : openLocal()).catch((e) => {
      g.__kelvinDb = undefined;
      throw e;
    });
  }
  return (await g.__kelvinDb).db;
}

/** For CLI scripts: release the handle so the process can exit. */
export async function closeDb(): Promise<void> {
  if (!g.__kelvinDb) return;
  const h = await g.__kelvinDb;
  g.__kelvinDb = undefined;
  await h.close();
}

export { schema };
