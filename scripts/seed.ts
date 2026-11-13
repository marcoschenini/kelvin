/**
 * npm run seed            -> full demo reset (cases A, B, C anchored to now)
 * npm run seed -- --files -> only write the generated files to .data/preview (no DB)
 *
 * In local mode the dev server holds the database: stop it first, or use
 * Settings -> Reset demo in the app.
 */
import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { closeDb, getDb, DATA_DIR } from "@/lib/db/client";
import { buildCase } from "@/seed/build";
import { DEMO_CASES } from "@/seed/cases/demo";
import { resetDemo } from "@/seed/seed-db";

async function main() {
  const now = new Date();
  if (process.argv.includes("--files")) {
    for (const spec of DEMO_CASES) {
      const g = await buildCase(spec, now);
      const dir = path.join(DATA_DIR, "preview", spec.id);
      fs.mkdirSync(dir, { recursive: true });
      for (const f of g.files) fs.writeFileSync(path.join(dir, f.filename), f.bytes);
      console.log(`${spec.code}  ${spec.id}  ${g.files.length} files -> ${dir}`);
    }
    return;
  }
  const db = await getDb();
  const generated = await resetDemo(db, now);
  for (const g of generated) {
    console.log(
      `${g.spec.code}  ${g.spec.id.padEnd(8)} delivered ${g.deliveredAt.toISOString().slice(0, 16)}  ` +
        `${g.files.length} documents  (${g.files.map((f) => f.kind).join(", ")})`,
    );
  }
  await closeDb();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await closeDb().catch(() => {});
  process.exit(1);
});
