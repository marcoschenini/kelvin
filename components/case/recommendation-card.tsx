import { AlertTriangle } from "lucide-react";
import { DeadlinePill } from "@/components/kit/deadline-pill";
import { ROUTE_ICON } from "@/components/kit/party-icons";
import type { CaseRecord } from "@/lib/case/record";
import { STATUS_META, type CaseStatus } from "@/lib/domain/case-status";
import { ROUTE_META, type RecoveryRoute } from "@/lib/domain/parties";
import { formatDate, formatDuration, formatEUR, formatTemp } from "@/lib/format";
import type { QaAssessment } from "@/lib/rules/types";
import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "neutral" | "brand";

const ROUTE_OBJECT: Record<RecoveryRoute, string> = {
  carrier: "the carrier",
  forwarder: "the forwarder",
  insurer: "the cargo insurer",
};

const QA_VERDICT: Record<string, { label: string; tone: Tone }> = {
  usable: { label: "Usable", tone: "success" },
  damaged: { label: "Damaged", tone: "warning" },
  unsure: { label: "Needs QA review", tone: "neutral" },
};

const TONE_CHIP: Record<Tone, string> = {
  success: "bg-success-soft text-success-fg ring-success/20",
  warning: "bg-warning-soft text-warning-fg ring-warning/25",
  neutral: "bg-muted text-muted-foreground ring-border",
  brand: "bg-brand-soft text-brand-fg ring-brand/20",
};

const BASIS: Record<QaAssessment["basis"], string> = {
  within_allowance: "within the stability allowance",
  beyond_allowance: "beyond the stability allowance",
  near_limit: "too close to the limit to call automatically",
  no_stability_data: "no stability data on file",
};

/** One line: measured excursion against the allowance, e.g. "13.0 °C peak, 1 h 30 min out of range: beyond the stability allowance (10.0 °C, 30 min)." */
function qualityLine(a: QaAssessment): string {
  const measured = [a.peakC != null ? `${formatTemp(a.peakC)} peak` : null, `${formatDuration(a.minutesOutOfRange)} out of range`].filter(Boolean).join(", ");
  const allowed = a.allowance ? ` (allowed ${formatTemp(a.allowance.maxTempC)}, ${formatDuration(a.allowance.maxMinutesOutOfRange)})` : "";
  return `${measured}: ${BASIS[a.basis]}${allowed}.`;
}

const RULE: Record<Tone, string> = { brand: "bg-brand", success: "bg-success", warning: "bg-warning", neutral: "bg-subtle" };

export interface Recommendation {
  verdict: { label: string; tone: Tone };
  headline: string;
  rationale: string | null;
  amount: { label: string; value: number | null; tone: Tone; parts: { route: RecoveryRoute; role: string; value: number }[]; note: string | null };
  quality: { label: string; tone: Tone; line: string };
  ready: boolean;
}

/** Maps the case record to the recommendation shown at the top of the case. Presentation only: every figure comes from the record. */
export function deriveRecommendation({
  status,
  record,
  qa,
  recoveredEur,
  valueEur,
}: {
  status: CaseStatus;
  record: CaseRecord;
  qa: "pending" | "released" | "rejected";
  recoveredEur: number | null;
  valueEur: number | null;
}): Recommendation {
  const qaA = record.qaAssessment;
  const released = qa === "released" || qaA?.verdict === "usable";
  const top = record.ranking?.find((r) => r.recommended);
  const plan = [...(record.claimPlan ?? [])].sort((a, b) => a.order - b.order);
  const planTotal = plan.reduce((s, i) => s + i.amountEur, 0);

  const base = qaA ? { ...QA_VERDICT[qaA.verdict], line: qualityLine(qaA) } : { label: "Not assessed", tone: "neutral" as Tone, line: "The quality assessment follows the excursion analysis." };
  const quality =
    qa === "released"
      ? { label: "Released", tone: "success" as Tone, line: qaA ? base.line : "Quality Assurance released the product." }
      : qa === "rejected"
        ? { label: qaA?.verdict === "damaged" ? "Damaged" : "Rejected by QA", tone: "warning" as Tone, line: qaA ? base.line : "Quality Assurance rejected the batch." }
        : base;

  if (status.startsWith("closed_")) {
    const o = record.outcome;
    const recovered = recoveredEur ?? o?.recoveredEur ?? null;
    if (status === "closed_no_claim") {
      return {
        verdict: { label: "No claim", tone: "success" },
        headline: "Case closed: no claim",
        rationale: record.closingNote ?? "The product stayed within its stability allowance, so there is no loss to recover.",
        amount: { label: "To recover", value: 0, tone: "success", parts: [], note: valueEur != null ? `Shipment value ${formatEUR(valueEur)} preserved` : null },
        quality,
        ready: true,
      };
    }
    return {
      verdict: { label: "Closed", tone: status === "closed_rejected" || status === "closed_not_approved" ? "neutral" : "success" },
      headline: STATUS_META[status].label.replace("Closed · ", "Case closed: ").replace(/: (\w)/, (_, c: string) => `: ${c.toLowerCase()}`),
      rationale: record.closingNote ?? STATUS_META[status].description,
      amount: {
        label: recovered ? "Recovered" : "Claimed",
        value: recovered ?? o?.claimedEur ?? null,
        tone: recovered ? "success" : "neutral",
        parts: [],
        note: o?.recoveryPct != null ? `${Math.round(o.recoveryPct)}% of the amount claimed` : null,
      },
      quality,
      ready: true,
    };
  }

  if (released && !plan.length) {
    return {
      verdict: { label: "No claim", tone: "success" },
      headline: "No claim: the product can be released",
      rationale: "The excursion stays within the product's stability allowance, so there is no loss to recover.",
      amount: { label: "To recover", value: 0, tone: "success", parts: [], note: valueEur != null ? `Shipment value ${formatEUR(valueEur)} preserved` : null },
      quality,
      ready: true,
    };
  }

  if (plan.length) {
    const [primary, ...rest] = plan;
    return {
      verdict: { label: "Claim", tone: "brand" },
      headline: `Claim ${ROUTE_OBJECT[primary.route]}${rest.length ? `, then ${rest.map((r) => ROUTE_OBJECT[r.route]).join(" and ")}` : ""}`,
      rationale: primary.reason,
      amount: {
        label: plan.length > 1 ? "Total to claim" : "Amount to claim",
        value: planTotal,
        tone: "brand",
        parts: plan.map((p) => ({ route: p.route, role: p.role, value: p.amountEur })),
        note: record.extraCosts?.length ? `Includes ${record.extraCosts.map((c) => c.label.toLowerCase()).join(", ")}` : null,
      },
      quality,
      ready: true,
    };
  }

  if (top) {
    const pending = qa === "pending";
    return {
      verdict: { label: pending ? "Possible claim" : "Claim", tone: pending ? "warning" : "brand" },
      headline: pending ? `Possible claim against ${ROUTE_OBJECT[top.route]}` : `Claim ${ROUTE_OBJECT[top.route]}`,
      rationale: pending ? "Subject to the quality decision: the claim goes ahead only if the batch is rejected." : (top.reasons[0] ?? top.basis),
      amount: {
        label: "Recoverable",
        value: top.recoverableEur,
        tone: pending ? "neutral" : "brand",
        parts: [],
        note: `${Math.round(top.probability * 100)}% likelihood · ${ROUTE_META[top.route].long}`,
      },
      quality,
      ready: true,
    };
  }

  return {
    verdict: { label: "Pending", tone: "neutral" },
    headline: status === "new" ? "Analysis not started" : "Assessment in preparation",
    rationale: status === "new" ? "Start the analysis to rebuild the incident and assess the recovery options." : "The recommendation appears once the shipment records have been reviewed.",
    amount: { label: "Amount", value: null, tone: "neutral", parts: [], note: null },
    quality,
    ready: false,
  };
}

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return <span className={cn("inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold ring-1 ring-inset", TONE_CHIP[tone])}>{children}</span>;
}

/**
 * The output first: outcome, amount, nearest deadline, quality in one line,
 * and the next human action on the right.
 */
export function RecommendationCard({
  rec,
  deadline,
  action,
  actionTitle = "Next action",
}: {
  rec: Recommendation;
  deadline: { label: string | null; at: Date | string | null; daysLeft: number | null };
  action: React.ReactNode;
  actionTitle?: string;
}) {
  const overdue = deadline.daysLeft != null && deadline.daysLeft < 0;
  return (
    <section aria-labelledby="recommendation-title" className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="grid grid-cols-1 lg:grid-cols-12">
        <div className="relative p-6 lg:col-span-8 lg:p-8">
          <span className={cn("absolute inset-y-0 left-0 w-[3px]", RULE[rec.verdict.tone])} aria-hidden="true" />
          <div className="flex flex-wrap items-center gap-3">
            <span className={cn("eyebrow", rec.verdict.tone === "brand" ? "text-brand-fg" : "text-muted-foreground")}>Recommendation</span>
            <Chip tone={rec.verdict.tone}>{rec.verdict.label}</Chip>
          </div>
          <h2 id="recommendation-title" className="mt-3 text-[1.75rem] leading-[1.15] font-semibold text-foreground sm:text-[2rem]">
            {rec.headline}
          </h2>
          {rec.rationale && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted-foreground">{rec.rationale}</p>}

          <dl className="mt-7 grid grid-cols-1 gap-6 border-t border-border pt-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border">
            <div className="sm:pr-6">
              <dt className="eyebrow text-muted-foreground">{rec.amount.label}</dt>
              <dd className={cn("figure mt-2 text-[2.25rem] leading-none font-semibold", rec.amount.tone === "brand" ? "text-brand-fg" : rec.amount.tone === "success" ? "text-success-fg" : "text-foreground")}>
                {rec.amount.value == null ? "—" : formatEUR(rec.amount.value)}
              </dd>
              {rec.amount.parts.length > 1 && (
                <dd className="mt-3 flex flex-col gap-1 text-xs">
                  {rec.amount.parts.map((p) => {
                    const Icon = ROUTE_ICON[p.route];
                    return (
                      <span key={`${p.route}-${p.role}`} className="flex items-center gap-1.5">
                        <Icon className="size-3.5 text-subtle" aria-hidden="true" />
                        <span className="text-muted-foreground capitalize">{p.role}</span>
                        <span className="font-medium">{ROUTE_META[p.route].label}</span>
                        <span className="num ml-auto font-medium">{formatEUR(p.value)}</span>
                      </span>
                    );
                  })}
                </dd>
              )}
              {rec.amount.note && <dd className="mt-2 text-xs text-muted-foreground">{rec.amount.note}</dd>}
            </div>
            <div className="sm:px-6">
              <dt className="eyebrow text-muted-foreground">Nearest deadline</dt>
              {deadline.at && deadline.daysLeft != null ? (
                <>
                  <dd className={cn("figure mt-2 text-[1.5rem] leading-tight font-semibold", overdue ? "text-danger-fg" : "text-foreground")}>
                    {overdue && <AlertTriangle className="mr-1.5 inline size-5 align-[-2px]" aria-hidden="true" />}
                    {formatDate(deadline.at)}
                  </dd>
                  <dd className="mt-2">
                    <DeadlinePill daysLeft={deadline.daysLeft} date={deadline.at} label={deadline.label ?? undefined} />
                  </dd>
                  {deadline.label && <dd className="mt-1.5 text-xs text-muted-foreground">{deadline.label}</dd>}
                </>
              ) : (
                <dd className="mt-2 text-sm text-muted-foreground">No open deadline</dd>
              )}
            </div>
            <div className="sm:pl-6">
              <dt className="eyebrow text-muted-foreground">Quality assessment</dt>
              <dd className="mt-2">
                <Chip tone={rec.quality.tone}>{rec.quality.label}</Chip>
              </dd>
              {rec.quality.line && <dd className="mt-2 text-sm leading-snug text-foreground/85">{rec.quality.line}</dd>}
            </div>
          </dl>
        </div>

        <div className="flex flex-col gap-4 border-t border-border bg-muted/60 p-6 lg:col-span-4 lg:border-t-0 lg:border-l lg:p-8">
          <span className="eyebrow text-muted-foreground">{actionTitle}</span>
          {action}
        </div>
      </div>
    </section>
  );
}
