import { CircleCheck, CircleHelp, ShieldAlert, UserRound } from "lucide-react";
import { OpenableCitation } from "@/components/documents/citation-viewer";
import { HumanDecisionBadge } from "@/components/kit/badges";
import { SectionHeader } from "@/components/kit/surfaces";
import type { Citation } from "@/lib/domain/citation";
import { formatDateTime, formatDuration, formatTemp } from "@/lib/format";
import type { QaAssessment, QaVerdict } from "@/lib/rules/types";
import { cn } from "@/lib/utils";

const VERDICT: Record<QaVerdict, { label: string; summary: string; chip: string; Icon: typeof CircleCheck }> = {
  usable: { label: "Usable", summary: "Within the stability allowance: no claim.", chip: "bg-success-soft text-success-fg ring-success/20", Icon: CircleCheck },
  damaged: { label: "Damaged", summary: "Beyond the stability allowance: claim path.", chip: "bg-warning-soft text-warning-fg ring-warning/25", Icon: ShieldAlert },
  unsure: { label: "Needs QA review", summary: "Too close to the limit to call. Quality Assurance decides.", chip: "bg-card text-human-fg ring-human/45", Icon: CircleHelp },
};

function Compare({ label, measured, allowed, over }: { label: string; measured: string; allowed: string; over: boolean | null }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="eyebrow text-[10.5px] text-muted-foreground">{label}</div>
      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <span className="figure text-[1.5rem] leading-tight font-semibold">{measured}</span>
        <span className="num text-xs text-muted-foreground">allowed {allowed}</span>
      </div>
      {over != null && <div className={cn("mt-1 text-[11px] font-medium", over ? "text-warning-fg" : "text-success-fg")}>{over ? "Above the allowance" : "Within the allowance"}</div>}
    </div>
  );
}

/**
 * The quality assessment and its reasoning, with the manufacturer's allowance next
 * to the measured excursion. Navy outline for the human gate.
 */
export function QaDecisionCard({
  assessment,
  humanQa,
  citation,
  className,
}: {
  assessment: QaAssessment & { by: "quality_agent"; at: string; citationId?: string };
  /** The human QA decision, once taken. */
  humanQa: "released" | "rejected" | null;
  citation?: Citation;
  className?: string;
}) {
  const v = VERDICT[assessment.verdict];
  const a = assessment.allowance;
  return (
    <section aria-label="Quality assessment" className={cn("min-w-0 rounded-xl border border-border bg-card p-5 sm:p-7", className)}>
      <SectionHeader eyebrow="Quality" title="Quality assessment" description="The excursion compared with the product's stability allowance" />
      <div className="mt-5 flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold ring-1 ring-inset", v.chip)}>
            <v.Icon className="size-4" aria-hidden="true" />
            {v.label}
          </span>
          <span className="text-sm text-muted-foreground">{v.summary}</span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Compare
            label="Peak temperature"
            measured={assessment.peakC != null ? formatTemp(assessment.peakC) : "—"}
            allowed={a ? `up to ${formatTemp(a.maxTempC)}` : "no data"}
            over={a && assessment.peakC != null ? assessment.peakC > a.maxTempC : null}
          />
          <Compare
            label="Time outside 2–8 °C"
            measured={formatDuration(assessment.minutesOutOfRange)}
            allowed={a ? formatDuration(a.maxMinutesOutOfRange) : "no data"}
            over={a ? assessment.minutesOutOfRange > a.maxMinutesOutOfRange : null}
          />
        </div>
        {!a && <p className="text-xs text-muted-foreground">No stability data was found for this product, so it cannot be cleared automatically.</p>}

        <ul className="flex flex-col gap-1.5 text-sm">
          {assessment.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-foreground/50" aria-hidden="true" />
              {r}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="num">Assessed {formatDateTime(assessment.at)} UTC</span>
          {citation && <OpenableCitation citation={citation} />}
        </div>

        {assessment.verdict === "unsure" && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-human-soft p-3 text-sm">
            <UserRound className="size-4 text-human" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {humanQa ? (
                <>Human QA decided: <span className="font-medium">{humanQa === "released" ? "product released" : "batch rejected"}</span>.</>
              ) : (
                <>Waiting for Quality Assurance. The decision is taken in the Recommendation panel above.</>
              )}
            </span>
            <HumanDecisionBadge label="QA decision" />
          </div>
        )}
      </div>
    </section>
  );
}
