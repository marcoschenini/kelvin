import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import { DeadlinePill } from "@/components/kit/deadline-pill";
import { RouteChip } from "@/components/kit/route-chip";
import { StatusChip } from "@/components/kit/status-chip";
import { PersonaAvatar } from "@/components/shell/persona-switcher";
import { Skeleton } from "@/components/ui/skeleton";
import { getPersona } from "@/lib/domain/personas";
import { formatEUR } from "@/lib/format";
import type { CaseListItem } from "@/lib/queries/cases";
import { cn } from "@/lib/utils";

const GRID = "grid grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1fr)_16px] items-center gap-4";

export function RouteLabel({ origin, destination, className }: { origin: string | null; destination: string | null; className?: string }) {
  if (!origin || !destination) return <span className={cn("text-subtle", className)}>—</span>;
  return (
    <span className={cn("num inline-flex items-center gap-1.5 font-medium", className)}>
      {origin}
      <ArrowRight className="size-3.5 text-subtle" aria-label="to" />
      {destination}
    </span>
  );
}

/** Small screens: one card per case instead of the wide table. */
function CaseCards({ items }: { items: CaseListItem[] }) {
  return (
    <ul role="list" aria-label="Cases" className="flex flex-col gap-3 lg:hidden">
      {items.map((c) => {
        const owner = getPersona(c.ownerPersonaId);
        return (
          <li key={c.id}>
            <Link
              href={`/cases/${c.id}`}
              data-case-row
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card transition-colors active:bg-muted/50"
            >
              <span className="flex items-start gap-3">
                {c.code && c.scenario === "demo" && (
                  <span className="num grid size-9 shrink-0 place-items-center rounded-lg bg-ai-soft text-sm font-semibold text-ai-fg">{c.code}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="num block truncate text-[15px] font-semibold">{c.shipmentRef}</span>
                  <span className="block truncate text-xs text-muted-foreground">{c.product ?? c.title}</span>
                </span>
                <ChevronRight className="mt-1 size-4 shrink-0 text-subtle" aria-hidden="true" />
              </span>
              <span className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                <RouteLabel origin={c.origin} destination={c.destination} />
                <span className="num font-medium">{c.valueEur != null ? formatEUR(c.valueEur) : "—"}</span>
                <StatusChip status={c.status} size="sm" />
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {c.status === "new" || (c.status === "investigating" && c.daysLeft == null) ? (
                  <span className="text-xs text-subtle">Deadline not yet computed</span>
                ) : (
                  <DeadlinePill daysLeft={c.daysLeft} date={c.nearestDeadlineAt} label={c.nearestDeadlineLabel ?? undefined} />
                )}
                {c.recommendedRoute && <RouteChip route={c.recommendedRoute} recommended />}
                <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                  <PersonaAvatar persona={owner} className="size-5 text-[8px]" />
                  {owner.name}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function CaseList({ items }: { items: CaseListItem[] }) {
  return (
    <>
    <CaseCards items={items} />
    <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-card lg:block">
      <div
        className={cn(GRID, "border-b border-border bg-muted/40 px-5 py-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase")}
        aria-hidden="true"
      >
        <span>Shipment</span>
        <span>Route</span>
        <span className="text-right">Value</span>
        <span>Status</span>
        <span>Owner</span>
        <span>Deadline</span>
        <span>Recommended</span>
        <span />
      </div>
      <ul role="list" aria-label="Cases" className="divide-y divide-border">
        {items.map((c) => {
          const owner = getPersona(c.ownerPersonaId);
          return (
            <li key={c.id}>
              <Link
                href={`/cases/${c.id}`}
                data-case-row
                className={cn(
                  GRID,
                  "group px-5 py-3.5 transition-colors hover:bg-muted/50 focus-visible:bg-ai-soft focus-visible:outline-none",
                )}
              >
                <span className="flex min-w-0 items-center gap-3">
                  {c.code && c.scenario === "demo" && (
                    <span className="num grid size-8 shrink-0 place-items-center rounded-lg bg-ai-soft text-xs font-semibold text-ai-fg">
                      {c.code}
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="num block truncate text-[14px] font-semibold">{c.shipmentRef}</span>
                    <span className="block truncate text-xs text-muted-foreground">{c.product ?? c.title}</span>
                  </span>
                </span>
                <RouteLabel origin={c.origin} destination={c.destination} className="text-[13px]" />
                <span className="num text-right text-[13px] font-medium">{c.valueEur != null ? formatEUR(c.valueEur) : "—"}</span>
                <span>
                  <StatusChip status={c.status} size="sm" />
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <PersonaAvatar persona={owner} className="size-6 text-[9px]" />
                  <span className="truncate text-[13px]">{owner.name}</span>
                </span>
                <span>
                  {c.status === "new" || (c.status === "investigating" && c.daysLeft == null) ? (
                    <span className="text-xs whitespace-nowrap text-subtle">Not yet computed</span>
                  ) : (
                    <DeadlinePill daysLeft={c.daysLeft} date={c.nearestDeadlineAt} label={c.nearestDeadlineLabel ?? undefined} />
                  )}
                </span>
                <span>
                  <RouteChip route={c.recommendedRoute} recommended />
                </span>
                <ChevronRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
    </>
  );
}

export function CaseListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <>
    <div className="flex flex-col gap-3 lg:hidden" aria-busy="true" aria-label="Loading cases">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-card">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-5 w-40 rounded-full" />
        </div>
      ))}
    </div>
    <div className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-card lg:block" aria-busy="true" aria-label="Loading cases">
      <div className="border-b border-border bg-muted/40 px-5 py-3">
        <Skeleton className="h-3 w-40" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className={cn(GRID, "border-b border-border px-5 py-4 last:border-0")}>
          <span className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-lg" />
            <span className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-36" />
            </span>
          </span>
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="ml-auto h-3.5 w-16" />
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-20" />
          <span />
        </div>
      ))}
    </div>
    </>
  );
}
