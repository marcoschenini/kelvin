"use client";

import type { AgentEvent, RunKind } from "@/lib/agent/events";

/** Starts an agent run and yields its NDJSON events as they arrive. */
export async function* streamRun(caseId: string, kind: RunKind, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
  const res = await fetch(`/api/cases/${caseId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
    signal,
  });
  if (!res.ok || !res.body) throw new Error(`Run failed to start (${res.status})`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as AgentEvent;
    }
  }
}
