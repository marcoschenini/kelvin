import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { asc, desc, eq } from "drizzle-orm";
import { EvalView, type EvalRunInfo } from "@/components/eval/eval-view";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { hasModelCredentials } from "@/lib/agent/provider";
import { getDb } from "@/lib/db/client";
import { evalResults, evalRuns, type EvalRunRow } from "@/lib/db/schema";
import type { EvalCaseResult, EvalSummary } from "@/lib/eval/harness";

export const metadata: Metadata = { title: "Evaluation" };

const info = (r: EvalRunRow): EvalRunInfo => ({
  id: r.id,
  mode: r.mode,
  model: r.model,
  status: r.status,
  finishedAt: r.finishedAt?.toISOString() ?? null,
  summary: r.status === "completed" ? (r.summary as unknown as EvalSummary) : null,
});

async function Content() {
  await connection();
  const db = await getDb();
  const runs = await db.select().from(evalRuns).orderBy(desc(evalRuns.startedAt)).limit(8);
  const latest = runs.find((r) => r.status === "completed") ?? null;
  const rows = latest ? await db.select().from(evalResults).where(eq(evalResults.runId, latest.id)).orderBy(asc(evalResults.caseId)) : [];
  const results: EvalCaseResult[] = rows.map((r) => ({
    caseId: r.caseId,
    title: r.title,
    tests: r.tests,
    key: r.key as unknown as EvalCaseResult["key"],
    actual: r.actual as unknown as EvalCaseResult["actual"],
    checks: r.checks as EvalCaseResult["checks"],
    correct: r.correct,
    citationCoverage: r.citationCoverage,
    durationMs: r.durationMs,
  }));
  return <EvalView run={latest ? info(latest) : null} results={results} history={runs.map(info)} liveAvailable={hasModelCredentials()} />;
}

export default function EvalPage() {
  return (
    <PageContainer className="flex flex-col gap-8">
      <PageHeader
        title="Evaluation"
        description="24 synthetic shipments with hand-written answer keys: does Kelvin pick the right payer, the right deadlines, and cite its sources?"
      />
      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <Skeleton className="h-9 w-64" />
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        }
      >
        <Content />
      </Suspense>
    </PageContainer>
  );
}
