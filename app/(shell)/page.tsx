import Link from "next/link";
import { AlarmClock, Euro, FolderOpen, HandCoins, Inbox, Play, Plus } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { KpiTile } from "@/components/kit/kpi-tile";
import { EmptyState } from "@/components/kit/surfaces";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
            <Link href="/cases/new?demo=1" className={cn(buttonVariants({ variant: "ai" }))}>
              <Play data-icon="inline-start" />
              Run demo
            </Link>
          </>
        }
      />

      <section aria-label="Key figures" className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiTile label="Open cases" value={0} icon={FolderOpen} tone="ai" hint="Across all routes" />
        <KpiTile label="At stake" value={0} format="eur" icon={Euro} tone="warning" hint="Value of open shipments" />
        <KpiTile label="Recovered" value={0} format="eur" icon={HandCoins} tone="success" hint="Closed this quarter" />
        <KpiTile label="Deadlines at risk" value={0} icon={AlarmClock} tone="danger" hint="Notice due in under 3 days" />
      </section>

      <EmptyState
        icon={Inbox}
        title="No cases yet"
        description="Load the three demo shipments or upload a logger file, waybill and contract to open a case."
        action={
          <Link href="/cases/new?demo=1" className={cn(buttonVariants({ variant: "ai" }))}>
            <Play data-icon="inline-start" />
            Load demo cases
          </Link>
        }
      />
    </PageContainer>
  );
}
