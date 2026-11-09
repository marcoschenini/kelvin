import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "@/lib/db/client";
import type { AgentEvent, Recording, RunKind, RunMode } from "./events";

/**
 * Records every run's event stream with timing. Demo cases also get a stable
 * copy in /demo/recordings (live runs replace it; deterministic runs only fill
 * a gap) so Replay mode works without network.
 */
export const DEMO_RECORDINGS_DIR = path.join(process.cwd(), "demo", "recordings");

export function createRecorder(meta: { caseId: string; kind: RunKind; mode: RunMode; model: string | null }) {
  const started = Date.now();
  const events: Recording["events"] = [];
  return {
    push(event: AgentEvent) {
      events.push({ t: Date.now() - started, event });
    },
    async save(runId: string, opts: { demo: boolean }): Promise<string> {
      const rec: Recording = { version: 1, ...meta, recordedAt: new Date().toISOString(), events };
      const json = JSON.stringify(rec, null, 1);
      const runPath = path.join(DATA_DIR, "recordings", `${runId}.json`);
      await fs.mkdir(path.dirname(runPath), { recursive: true });
      await fs.writeFile(runPath, json);
      if (opts.demo) {
        const demoPath = path.join(DEMO_RECORDINGS_DIR, `${meta.caseId}-${meta.kind}.json`);
        const exists = await fs
          .access(demoPath)
          .then(() => true)
          .catch(() => false);
        if (meta.mode === "live" || !exists) {
          await fs.mkdir(DEMO_RECORDINGS_DIR, { recursive: true });
          await fs.writeFile(demoPath, json);
          return demoPath;
        }
      }
      return runPath;
    },
  };
}
