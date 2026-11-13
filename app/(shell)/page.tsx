import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Radio } from "lucide-react";
import { LiveMap } from "@/components/live/live-map";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Live shipments" };

export default function LiveShipmentsPage() {
  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <span className="eyebrow inline-flex items-center gap-1.5 text-success-fg">
            <Radio className="size-3.5" aria-hidden="true" />
            Live
          </span>
        }
        title="Shipments in transit"
        description="Every cold-chain shipment on the move, who holds it right now, and what its logger reads."
        actions={
          <Link href="/cases" className={cn(buttonVariants({ variant: "outline" }))}>
            Claims cases
            <ArrowRight data-icon="inline-end" />
          </Link>
        }
      />
      <LiveMap />
    </PageContainer>
  );
}
