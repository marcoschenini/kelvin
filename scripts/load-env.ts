/**
 * Loads .env / .env.local the way `next dev` does, so CLI scripts (seed, agent,
 * eval) talk to the same database as the app, including DB_MODE=supabase.
 * Import it first: lib/db/client reads the environment when it is evaluated.
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", { info: () => {}, error: console.error });
