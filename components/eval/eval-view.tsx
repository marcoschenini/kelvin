"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleCheck, Clock, FileCheck2, FlaskConical, Loader2, Play, Route, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { EvalCaseResult, EvalEvent, EvalSummary } from "@/lib/eval/harness";
import { ROUTE_META, type RecoveryRoute } from "@/lib/domain/parties";
import { formatDateTime, formatMs } from "@/lib/format";
import { cn } from "@/lib/utils";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)}%`);
const routeLabel = (r: RecoveryRoute | null) => (r ? ROUTE_META[r].label : "No claim");

function Metric({ label, value, sub, icon: Icon, good }: { label: string; value: string; sub?: string; icon: typeof Route; good?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg bg-ai-soft text-ai-fg">
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <div className={cn("num mt-2 text-[1.75rem] leading-none font-semibold tracking-tight", good && "text-success-fg")}>{value}</div>
      {sub && <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function Tick({ ok }: { ok: boolean | null | undefined }) {
  if (ok == null) return <span className="text-subtle">—</span>;
  return ok ? (
    <Check className="size-4 text-success" aria-label="correct" />
  ) : (
    <X className="size-4 text-danger" aria-label="wrong" />
  );
}

export interface EvalRunInfo {
  id: string;
  mode: string;
  model: string | null;
  status: string;
  finishedAt: string | null;
  summary: EvalSummary | null;
}

export function EvalView({ run, results, history, liveAvailable }: { run: EvalRunInfo | null; results: EvalCaseResult[]; history: EvalRunInfo[]; liveAvailable: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState<null | { total: number; mode: string }>(null);
  const [live, setLive] = useState<EvalCaseResult[]>([]);

  async function start(mode: "deterministic" | "live") {
    setRunning({ total: 0, mode });
    setLive([]);
    try {
      const res = await fetch("/api/eval", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) });
      if (!res.ok || !res.body) throw new Error(`Evaluation failed to start (${res.status})`);
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
          if (!line) continue;
          const e = JSON.parse(line) as EvalEvent;
          if (e.type === "started") setRunning({ total: e.total, mode: e.mode });
          else if (e.type === "case") setLive((l) => [...l, e.result]);
          else if (e.type === "done") toast.success("Evaluation finished", { description: `${e.summary.correct}/${e.summary.cases} cases fully correct` });
          else if (e.type === "error") toast.error("Evaluation failed", { description: e.error });
        }
      }
    } catch (err) {
      toast.error("Evaluation failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setRunning(null);
      router.refresh();
    }
  }

  const rows = running ? live : results;
  const s = running ? null : run?.summary;
  const wrong = rows.filter((r) => !r.correct);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ai" onClick={() => start("deterministic")} disabled={!!running}>
          {running?.mode === "deterministic" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Play data-icon="inline-start" />}
          Run evaluation (24 cases)
        </Button>
        {liveAvailable && (
          <Button variant="outline" onClick={() => start("live")} disabled={!!running}>
            {running?.mode === "live" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
            Live model, first 4 cases
          </Button>
        )}
        <span className="text-sm text-muted-foreground">
          {running
            ? `Running case ${Math.min(live.length + 1, running.total || 24)} of ${running.total || 24}…`
            : run?.finishedAt
              ? `Last run ${formatDateTime(run.finishedAt)} UTC · ${run.mode === "live" ? (run.model ?? "live model") : "deterministic planner"}`
              : "No evaluation run yet."}
        </span>
      </div>

      {running && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="bg-ai h-full rounded-full transition-[width] duration-300" style={{ width: `${(live.length / (running.total || 24)) * 100}%` }} />
        </div>
      )}

      {s && (
        <>
          <section aria-label="Headline metrics" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Metric label="Route accuracy" value={pct(s.routeAccuracy)} sub="Recommended payer matches the answer key" icon={Route} good={s.routeAccuracy === 1} />
            <Metric label="Deadline accuracy" value={pct(s.deadlineAccuracy)} sub="Every notice date matches" icon={Clock} good={s.deadlineAccuracy === 1} />
            <Metric label="Citation coverage" value={pct(s.citationCoverage)} sub="Factual paragraphs in letters with a source" icon={FileCheck2} good={s.citationCoverage === 1} />
            <Metric label="Average time per case" value={formatMs(s.avgMsPerCase)} sub="Investigation, QA, claim or close" icon={FlaskConical} />
          </section>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
            <span>
              Fully correct <span className="num font-semibold text-foreground">{s.correct}/{s.cases}</span>
            </span>
            <span>
              Claim yes/no <span className="num font-semibold text-foreground">{pct(s.claimAccuracy)}</span>
            </span>
            <span>
              Custody at excursion <span className="num font-semibold text-foreground">{pct(s.custodyAccuracy)}</span>
            </span>
            <span>
              Protective notices <span className="num font-semibold text-foreground">{pct(s.noticeAccuracy)}</span>
            </span>
            {s.qaAgentAccuracy != null && (
              <span>
                Quality agent <span className="num font-semibold text-foreground">{pct(s.qaAgentAccuracy)}</span>
              </span>
            )}
          </div>
        </>
      )}

      {rows.length > 0 && (
        <section aria-labelledby="wrong-heading" className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <h2 id="wrong-heading" className="text-[15px] font-semibold">
            Wrong answers
          </h2>
          {wrong.length === 0 ? (
            <p className="mt-2 flex items-center gap-2 text-sm text-success-fg">
              <CircleCheck className="size-4" aria-hidden="true" />
              None in this run: every case matches its answer key.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {wrong.map((r) => (
                <li key={r.caseId} className="rounded-xl border border-danger/25 bg-danger-soft/50 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {r.caseId} · {r.title}
                    </span>
                    <Link href={`/cases/${r.caseId}`} className="text-xs font-medium text-ai-fg hover:underline">
                      Open run
                    </Link>
                  </div>
                  <ul className="mt-1 text-xs text-muted-foreground">
                    {!r.checks.route && <li>Route: Kelvin chose {routeLabel(r.actual.route)}, expected {routeLabel(r.key.route)}</li>}
                    {!r.checks.claim && <li>Claim: Kelvin {r.actual.claim ? "drafted" : "did not draft"} a claim, expected {r.key.claim ? "a claim" : "none"}</li>}
                    {!r.checks.custody && <li>Custody: {r.actual.custody ?? "none"}, expected {r.key.custody ?? "none"}</li>}
                    {!r.checks.notices && <li>Protective notices: {r.actual.notices.join(", ") || "none"}, expected {r.key.notices.join(", ") || "none"}</li>}
                    {!r.checks.deadlines && <li>Deadlines: {JSON.stringify(r.actual.deadlines)} vs {JSON.stringify(r.key.deadlines)}</li>}
                    {r.actual.errors.map((e) => (
                      <li key={e}>Error: {e}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {rows.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-muted/40 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                <tr>
                  <th className="px-4 py-2.5">Case</th>
                  <th className="px-3 py-2.5">Expected</th>
                  <th className="px-3 py-2.5">Kelvin</th>
                  <th className="px-3 py-2.5 text-center">Route</th>
                  <th className="px-3 py-2.5 text-center">Claim</th>
                  <th className="px-3 py-2.5 text-center">Notices</th>
                  <th className="px-3 py-2.5 text-center">Deadlines</th>
                  <th className="px-3 py-2.5 text-right">Citations</th>
                  <th className="px-3 py-2.5 text-right">Time</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.caseId} className={cn(!r.correct && "bg-danger-soft/40")}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">
                        <span className="num text-muted-foreground">{r.caseId.replace("eval-", "#")}</span> {r.title}
                      </div>
                      <div className="text-xs text-muted-foreground">{r.tests}</div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{routeLabel(r.key.route)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{routeLabel(r.actual.route)}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex justify-center">
                        <Tick ok={r.checks.route} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex justify-center">
                        <Tick ok={r.checks.claim} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex justify-center">
                        <Tick ok={r.checks.notices} />
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex justify-center">
                        <Tick ok={r.checks.deadlines} />
                      </span>
                    </td>
                    <td className="num px-3 py-2.5 text-right">{pct(r.citationCoverage)}</td>
                    <td className="num px-3 py-2.5 text-right text-muted-foreground">{formatMs(r.durationMs)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/cases/${r.caseId}`} className="text-xs font-medium whitespace-nowrap text-ai-fg hover:underline">
                        Open run
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {history.length > 1 && (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <h2 className="text-[15px] font-semibold">Recent runs</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <span className="num text-muted-foreground">{h.finishedAt ? formatDateTime(h.finishedAt) : "running"}</span>
                <span>{h.mode === "live" ? (h.model ?? "live") : "deterministic"}</span>
                {h.summary && (
                  <span className="num text-muted-foreground">
                    route {pct(h.summary.routeAccuracy)} · deadlines {pct(h.summary.deadlineAccuracy)} · {h.summary.correct}/{h.summary.cases} correct
                  </span>
                )}
                {h.status === "failed" && <span className="text-danger-fg">failed</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-muted-foreground">
        The answer keys are written by hand from the domain rules, not produced by Kelvin. The deterministic planner measures the tools and rules
        (document parsing, custody, caps, deadlines, ranking); a live-model run also measures the agent&apos;s own tool use and letters.
      </p>
    </div>
  );
}
