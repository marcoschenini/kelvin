"use client";

import { useState } from "react";
import { ChevronDown, CircleSlash, Info } from "lucide-react";
import { AnimatedNumber } from "@/components/kit/animated-number";
import { AiBadge } from "@/components/kit/badges";
import { DeadlinePill } from "@/components/kit/deadline-pill";
import { ROUTE_ICON } from "@/components/kit/party-icons";
import { OpenableCitation } from "@/components/documents/citation-viewer";
import type { Citation } from "@/lib/domain/citation";
import { ROUTE_META, type RecoveryRoute } from "@/lib/domain/parties";
import { formatDateWithRelative, formatEUR } from "@/lib/format";
import type { Deadline, RankedRoute } from "@/lib/rules/types";
import { cn } from "@/lib/utils";

const ORDER: RecoveryRoute[] = ["carrier", "forwarder", "insurer"];

function RouteCard({ r, citations, qaPending }: { r: RankedRoute; citations: Citation[]; qaPending: boolean }) {
  const [open, setOpen] = useState(r.recommended);
  const Icon = ROUTE_ICON[r.route];
  const blocked = r.probability === 0 || r.recoverableEur === 0;
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl p-4",
        r.recommended ? "border-ai shadow-glow" : "border border-border bg-card",
        blocked && !r.recommended && "bg-muted/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={cn("grid size-9 place-items-center rounded-lg", r.recommended ? "bg-ai text-white" : "bg-muted text-muted-foreground")}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <div>
            <div className="text-sm font-semibold">{ROUTE_META[r.route].label}</div>
            <div className="text-[11px] text-muted-foreground">{ROUTE_META[r.route].long}</div>
          </div>
        </div>
        {r.recommended ? <AiBadge label="Recommended" /> : blocked ? <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><CircleSlash className="size-3" />Not viable</span> : <span className="num text-xs text-muted-foreground">#{r.rank}</span>}
      </div>

      <div>
        <div className="text-[11px] text-muted-foreground">Recoverable if successful</div>
        <AnimatedNumber value={r.recoverableEur} format="eur" className={cn("block text-2xl leading-tight font-semibold tracking-tight", blocked && "text-muted-foreground")} />
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <div className={cn("h-full rounded-full", r.recommended ? "bg-ai" : "bg-subtle")} style={{ width: `${Math.round(r.probability * 100)}%` }} />
          </div>
          <span className="num w-24 text-right text-[11px] text-muted-foreground">{Math.round(r.probability * 100)}% · {formatEUR(r.expectedEur)}</span>
        </div>
        <div className="mt-0.5 text-[10.5px] text-subtle">likelihood · expected value</div>
      </div>

      <dl className="flex flex-col gap-1.5 text-xs">
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
        className="mt-auto inline-flex items-center gap-1 self-start text-xs font-medium text-ai-fg hover:underline"
        aria-expanded={open}
      >
        Why?
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
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      {sorted.map((r) => (
        <RouteCard key={r.route} r={r} citations={citations[r.route] ?? []} qaPending={qaPending} />
      ))}
    </div>
  );
}

export function DeadlineList({ deadlines }: { deadlines: Deadline[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border">
      {deadlines.map((d) => (
        <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{d.label}</span>
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
