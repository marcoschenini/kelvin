"use client";

import { useState } from "react";
import { ChevronDown, CircleSlash, Info } from "lucide-react";
import { AnimatedNumber } from "@/components/kit/animated-number";
import { DeadlinePill } from "@/components/kit/deadline-pill";
import { ROUTE_ICON } from "@/components/kit/party-icons";
import { OpenableCitation } from "@/components/documents/citation-viewer";
import type { Citation } from "@/lib/domain/citation";
import { ROUTE_META, type RecoveryRoute } from "@/lib/domain/parties";
import { formatDateWithRelative, formatEUR } from "@/lib/format";
import type { ClaimPlanItem, Deadline, ExtraCost, RankedRoute } from "@/lib/rules/types";
import { cn } from "@/lib/utils";

const ORDER: RecoveryRoute[] = ["carrier", "forwarder", "insurer"];

function RouteCard({ r, citations, qaPending }: { r: RankedRoute; citations: Citation[]; qaPending: boolean }) {
  const [open, setOpen] = useState(r.recommended);
  const Icon = ROUTE_ICON[r.route];
  const blocked = r.probability === 0 || r.recoverableEur === 0;
  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 overflow-hidden rounded-xl border bg-card p-5",
        r.recommended ? "border-ai-fg/40" : "border-border",
        blocked && !r.recommended && "bg-muted/50",
      )}
    >
      {r.recommended && <span className="absolute inset-x-0 top-0 h-[3px] bg-ai" aria-hidden="true" />}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Icon className={cn("size-5 shrink-0", r.recommended ? "text-ai-fg" : "text-subtle")} strokeWidth={1.75} aria-hidden="true" />
          <div>
            <div className="font-heading text-[17px] leading-tight font-semibold">{ROUTE_META[r.route].label}</div>
            <div className="text-[11px] text-muted-foreground">{ROUTE_META[r.route].long}</div>
          </div>
        </div>
        {r.recommended ? <span className="eyebrow rounded-sm bg-ai px-1.5 py-0.5 text-[10px] text-white dark:text-background">Recommended</span> : blocked ? <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><CircleSlash className="size-3" />Not viable</span> : <span className="num text-xs text-muted-foreground">#{r.rank}</span>}
      </div>

      {blocked ? (
        <div>
          <div className="eyebrow text-[10.5px] text-muted-foreground">Recoverable</div>
          <div className="figure mt-1 block text-[1.75rem] leading-tight font-semibold text-muted-foreground">{formatEUR(0)}</div>
          <div className="mt-2 text-[11px] text-muted-foreground">Route closed. Without the blocker: up to {formatEUR(r.recoverableEur)}.</div>
        </div>
      ) : (
        <div>
          <div className="eyebrow text-[10.5px] text-muted-foreground">Recoverable if successful</div>
          <AnimatedNumber value={r.recoverableEur} format="eur" className={cn("figure mt-1 block text-[1.75rem] leading-tight font-semibold")} />
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className={cn("h-full rounded-full", r.recommended ? "bg-ai" : "bg-subtle")} style={{ width: `${Math.round(r.probability * 100)}%` }} />
            </div>
            <span className="num w-24 text-right text-[11px] text-muted-foreground">{Math.round(r.probability * 100)}% · {formatEUR(r.expectedEur)}</span>
          </div>
          <div className="mt-0.5 text-[10.5px] text-subtle">likelihood · expected value</div>
        </div>
      )}

      <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">{r.deductibleEur != null ? "Deductible" : "Cap"}</dt>
          <dd className="num text-right font-medium">{r.deductibleEur != null ? formatEUR(r.deductibleEur) : r.capEur != null ? formatEUR(r.capEur) : "—"}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-muted-foreground">Notice due</dt>
          <dd>
            {r.noticeDeadline ? (
              <span className="flex items-center gap-1.5">
                <span className="num text-[11px] text-muted-foreground">{formatDateWithRelative(r.noticeDeadline.dueAt).split(" (")[0]}</span>
                <DeadlinePill daysLeft={r.noticeDeadline.daysLeft} date={r.noticeDeadline.dueAt} />
              </span>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>

      {r.blockers.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
          {r.blockers.slice(0, 2).map((b) => (
            <li key={b} className="flex gap-1.5">
              <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
              {b}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mt-auto inline-flex items-center gap-1 self-start rounded-sm text-xs font-medium text-ai-fg hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-expanded={open}
      >
        Basis and sources
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-border pt-3 text-xs">
          <p className="text-foreground/90">{r.basis}</p>
          {r.reasons.length > 0 && <p className="text-muted-foreground">{r.reasons.join(". ")}.</p>}
          {qaPending && r.conditions[0] && <p className="text-human-fg">{r.conditions[0]}</p>}
          {citations.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {citations.map((c, i) => (
                <OpenableCitation key={`${c.id}-${i}`} citation={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RecoveryRoutes({
  ranking,
  citations,
  qaPending,
}: {
  ranking: RankedRoute[];
  citations: Record<RecoveryRoute, Citation[]>;
  qaPending: boolean;
}) {
  const sorted = ORDER.map((route) => ranking.find((r) => r.route === route)).filter((r): r is RankedRoute => !!r);
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {sorted.map((r) => (
        <RouteCard key={r.route} r={r} citations={citations[r.route] ?? []} qaPending={qaPending} />
      ))}
    </div>
  );
}

export function DeadlineList({ deadlines }: { deadlines: Deadline[] }) {
  return (
    <ul className="mt-2 flex flex-col divide-y divide-border border-y border-border">
      {deadlines.map((d) => (
        <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-foreground">{d.label}</span>
            <span className="block truncate text-xs text-muted-foreground" title={d.basis}>
              {d.basis}
            </span>
          </span>
          <span className="num hidden text-right text-xs text-muted-foreground sm:block">{formatDateWithRelative(d.dueAt)}</span>
          <DeadlinePill daysLeft={d.daysLeft} date={d.dueAt} />
        </li>
      ))}
    </ul>
  );
}

/** The claim plan: who is claimed against, in which order, and for how much. */
export function ClaimPlan({ plan, extraCosts }: { plan: ClaimPlanItem[]; extraCosts: ExtraCost[] }) {
  const items = [...plan].sort((a, b) => a.order - b.order);
  const total = items.reduce((s, i) => s + i.amountEur, 0);
  return (
    <section className="mb-8" aria-label="Claim plan">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-border pb-3">
        <div>
          <h3 className="eyebrow font-sans text-muted-foreground">Claim plan</h3>
          <p className="mt-1 text-sm text-muted-foreground">{items.length > 1 ? "Primary claim first, then a secondary claim for the uninsured part." : "One claim."}</p>
        </div>
        <span className="text-sm text-muted-foreground">
          Total <span className="figure ml-1 text-xl font-semibold text-brand-fg">{formatEUR(total)}</span>
        </span>
      </div>
      <ol className="divide-y divide-border border-b border-border">
        {items.map((i) => {
          const Icon = ROUTE_ICON[i.route];
          return (
            <li key={`${i.route}-${i.order}`} className="flex items-start gap-4 py-3.5">
              <span className="figure grid size-7 shrink-0 place-items-center rounded-full border border-ai-fg/40 text-sm font-semibold text-ai-fg" aria-label={`Step ${i.order}`}>
                {i.order}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[15px] font-semibold">
                  <Icon className="size-4 text-subtle" strokeWidth={1.75} aria-hidden="true" />
                  {ROUTE_META[i.route].label}
                  <span className="eyebrow rounded-sm px-1.5 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border ring-inset">{i.role}</span>
                </span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{i.reason}</span>
              </span>
              <span className="figure text-lg font-semibold">{formatEUR(i.amountEur)}</span>
            </li>
          );
        })}
      </ol>
      {extraCosts.length > 0 && (
        <p className="num mt-3 text-xs text-muted-foreground">
          Includes extra costs: {extraCosts.map((c) => `${c.label} ${formatEUR(c.eur)}`).join(", ")}.
        </p>
      )}
    </section>
  );
}
