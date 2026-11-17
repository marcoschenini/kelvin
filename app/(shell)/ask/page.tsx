import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { ne } from "drizzle-orm";
import { AskPage, type AskCase } from "@/components/chat/ask-page";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { CaseRecord } from "@/lib/case/record";
import { chatModelInfo } from "@/lib/chat/llm";
import { getDb } from "@/lib/db/client";
import { cases } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Ask Kelvin" };

async function Content({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  await connection();
  const [{ case: wanted }, rows] = await Promise.all([
    searchParams,
    (await getDb())
      .select({ id: cases.id, code: cases.code, ref: cases.shipmentRef, title: cases.title, status: cases.status, record: cases.record })
      .from(cases)
      .where(ne(cases.scenario, "eval")),
  ]);
  const list: AskCase[] = rows
    .map((r) => {
      const rec = (r.record ?? {}) as CaseRecord;
      const noClaim = r.status === "no_claim" || r.status === "closed_no_claim" || rec.qaAssessment?.verdict === "usable" || rec.qa?.status === "released";
      return { id: r.id, code: r.code, ref: r.ref, title: r.title, status: r.status, hasClaim: (rec.claimPlan?.length ?? 0) > 0 && !noClaim };
    })
    .sort((a, b) => (a.code ?? "~").localeCompare(b.code ?? "~") || a.ref.localeCompare(b.ref));
  const initial = list.some((c) => c.id === wanted) ? wanted! : "all";
  return <AskPage cases={list} initial={initial} {...chatModelInfo()} />;
}

export default function Page({ searchParams }: PageProps<"/ask">) {
  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Assistant"
        title="Ask Kelvin"
        description="Questions about your cases, answered from the case files and Kelvin's rules. Read-only: it explains and simulates, people approve and send."
      />
      <Suspense
        fallback={
          <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
            <Skeleton className="h-80 rounded-2xl" />
            <Skeleton className="h-[32rem] rounded-2xl" />
          </div>
        }
      >
        <Content searchParams={searchParams as Promise<{ case?: string }>} />
      </Suspense>
    </PageContainer>
  );
}
