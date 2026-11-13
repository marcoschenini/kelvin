import { CircleCheck, CircleHelp, ShieldAlert, UserRound } from "lucide-react";
import { OpenableCitation } from "@/components/documents/citation-viewer";
import { AiBadge, HumanDecisionBadge } from "@/components/kit/badges";
import { SectionHeader } from "@/components/kit/surfaces";
import type { Citation } from "@/lib/domain/citation";
import { formatDateTime, formatDuration, formatTemp } from "@/lib/format";
import type { QaAssessment, QaVerdict } from "@/lib/rules/types";
import { cn } from "@/lib/utils";

const VERDICT: Record<QaVerdict, { label: string; summary: string; chip: string; Icon: typeof CircleCheck }> = {
  usable: { label: "Usable", summary: "Within the stability allowance: no claim.", chip: "bg-success-soft text-success-fg ring-success/20", Icon: CircleCheck },
  damaged: { label: "Damaged", summary: "Beyond the stability allowance: claim path.", chip: "bg-warning-soft text-warning-fg ring-warning/25", Icon: ShieldAlert },
  unsure: { label: "Unsure", summary: "Too close to the limit to call. A human QA decides.", chip: "bg-human-soft text-human-fg ring-human/20", Icon: CircleHelp },
};

function Compare({ label, measured, allowed, over }: { label: string; measured: string; allowed: string; over: boolean | null }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-3">
        <span className="num text-lg font-semibold">{measured}</span>
        <span className="num text-xs text-muted-foreground">allowed {allowed}</span>
      </div>
      {over != null && <div className={cn("mt-1 text-[11px] font-medium", over ? "text-warning-fg" : "text-success-fg")}>{over ? "Above the allowance" : "Within the allowance"}</div>}
    </div>
  );
}

/**
 * What the quality agent decided and why, with the manufacturer's allowance next
 * to the measured excursion. AI styling for the agent, violet for the human gate.
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
    <section aria-label="Quality decision" className={cn("min-w-0 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5", className)}>
      <SectionHeader title="Quality decision" description="The quality agent compares the excursion with the product's stability allowance" icon={ShieldAlert} />
      <div className="mt-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ring-1 ring-inset", v.chip)}>
            <v.Icon className="size-4" aria-hidden="true" />
            {v.label}
          </span>
          <span className="text-sm text-muted-foreground">{v.summary}</span>
          <AiBadge label="Quality agent" className="ml-auto" />
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
        {!a && <p className="text-xs text-muted-foreground">No stability data was found for this product, so the agent cannot clear it.</p>}

        <ul className="flex flex-col gap-1.5 text-sm">
          {assessment.reasons.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="bg-ai mt-2 size-1.5 shrink-0 rounded-full" aria-hidden="true" />
              {r}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="num">Decided {formatDateTime(assessment.at)} UTC</span>
          {citation && <OpenableCitation citation={citation} />}
        </div>

        {assessment.verdict === "unsure" && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-human/20 bg-human-soft/60 p-3 text-sm">
            <UserRound className="size-4 text-human" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              {humanQa ? (
                <>Human QA decided: <span className="font-medium">{humanQa === "released" ? "product released" : "batch rejected"}</span>.</>
              ) : (
                <>Waiting for Quality Assurance. Use the Released / Rejected buttons in the side panel.</>
              )}
            </span>
            <HumanDecisionBadge label="QA decision" />
          </div>
        )}
      </div>
    </section>
  );
}
