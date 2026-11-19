import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { Inbox, Play, Plus } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { CaseList, CaseListSkeleton } from "@/components/case/case-list";
import { TrackRecord } from "@/components/case/track-record";
import { KpiTile } from "@/components/kit/kpi-tile";
import { EmptyState } from "@/components/kit/surfaces";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { computeKpis, listCases } from "@/lib/queries/cases";
import { DEFAULT_RULES } from "@/lib/rules/config";
import { cn } from "@/lib/utils";

async function InboxContent() {
  await connection();
  const items = await listCases();
  const k = computeKpis(items);
  return (
    <>
      <section aria-label="Key figures" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4 [&>div]:rounded-none [&>div]:border-0">
        <KpiTile compact label="Open cases" value={k.openCases} hint={k.awaitingHuman ? `${k.awaitingHuman} awaiting a human decision` : "Across all routes"} />
        <KpiTile
          compact
          label="Deadlines at risk"
          value={k.deadlinesAtRisk}
          hint={`Due in under ${DEFAULT_RULES.atRiskDays} days`}
          emphasis={k.deadlinesAtRisk > 0 ? "warning" : undefined}
        />
        <KpiTile compact label="At stake" value={k.atStakeEur} format="eur" hint="Value of open shipments" />
        <KpiTile
          compact
          label="Recovered"
          value={k.recoveredEur}
          format="eur"
          hint={k.recoveryRatePct != null ? `${k.recoveryRatePct}% of claimed, closed cases` : "From closed claims"}
          emphasis={k.recoveredEur > 0 ? "success" : undefined}
        />
      </section>

      {items.length ? (
        <CaseList items={items} />
      ) : (
        <EmptyState
          icon={Inbox}
          title="No cases yet"
          description="Load the three demo shipments or upload a logger file, waybill and contract to open a case."
          action={
            <Link href="/cases/new" className={cn(buttonVariants({ variant: "ai" }))}>
              <Play data-icon="inline-start" />
              Load demo cases
            </Link>
          }
        />
      )}
      {items.length > 0 && <TrackRecord rows={k.trackRecord} />}
    </>
  );
}

function InboxSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card p-5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="mt-4 h-7 w-28" />
            <Skeleton className="mt-3 h-3 w-32" />
          </div>
        ))}
      </div>
      <CaseListSkeleton />
    </>
  );
}

export const metadata = { title: "Cases" };

export default function CasesInboxPage() {
  return (
    <PageContainer className="flex flex-col gap-8">
      <PageHeader
        eyebrow="Claims operations"
        title="Cases"
        description="Temperature excursions from alert to recovered money."
        actions={
          <>
            <Link href="/cases/new" className={cn(buttonVariants({ variant: "outline" }))}>
              <Plus data-icon="inline-start" />
              New case
            </Link>
            <Link href="/cases/new#demo" className={cn(buttonVariants({ variant: "ai" }))}>
              <Play data-icon="inline-start" />
              Run demo
            </Link>
          </>
        }
      />
      <Suspense fallback={<InboxSkeleton />}>
        <InboxContent />
      </Suspense>
    </PageContainer>
  );
}
