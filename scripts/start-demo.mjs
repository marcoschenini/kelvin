// Runs the production build like the public Vercel demo: empty data dir in the OS temp folder, auto-seeded.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const dataDir = path.join(os.tmpdir(), `kelvin-demo-${Date.now()}`);
const port = process.env.PORT ?? "3200";
console.log(`Kelvin public-demo mode, data in ${dataDir}`);
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", port], {
  stdio: "inherit",
  env: { ...process.env, KELVIN_AUTOSEED: "1", KELVIN_DATA_DIR: dataDir },
});
child.on("exit", (code) => process.exit(code ?? 0));
