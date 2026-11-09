import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { AlarmClock, Euro, FolderOpen, HandCoins, Inbox, Play, Plus } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { CaseList, CaseListSkeleton } from "@/components/case/case-list";
import { KpiTile } from "@/components/kit/kpi-tile";
import { EmptyState } from "@/components/kit/surfaces";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { computeKpis, listCases } from "@/lib/queries/cases";
import { cn } from "@/lib/utils";

async function InboxContent() {
  await connection();
  const items = await listCases();
  const k = computeKpis(items);
  return (
    <>
      <section aria-label="Key figures" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiTile
          label="Open cases"
          value={k.openCases}
          icon={FolderOpen}
          tone="ai"
          hint={k.awaitingHuman ? `${k.awaitingHuman} awaiting a human decision` : "Across all routes"}
        />
        <KpiTile label="At stake" value={k.atStakeEur} format="eur" icon={Euro} tone="warning" hint="Value of open shipments" />
        <KpiTile
          label="Recovered"
          value={k.recoveredEur}
          format="eur"
          icon={HandCoins}
          tone="success"
          hint="From closed claims"
          emphasis={k.recoveredEur > 0 ? "success" : undefined}
        />
        <KpiTile
          label="Deadlines at risk"
          value={k.deadlinesAtRisk}
          icon={AlarmClock}
          tone="danger"
          hint="Notice due in under 3 days"
          emphasis={k.deadlinesAtRisk > 0 ? "danger" : undefined}
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
    </>
  );
}

function InboxSkeleton() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 shadow-card">
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

export default function CasesInboxPage() {
  return (
    <PageContainer className="flex flex-col gap-8">
      <PageHeader
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
