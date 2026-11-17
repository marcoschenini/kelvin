import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/domain/case-status";
import { AnimatedNumber } from "./animated-number";

/** KPI tile: overline label, serif figure, one-line hint. No icon bubbles: the figure is the content. */
export function KpiTile({
  label,
  value,
  format = "number",
  hint,
  emphasis,
  className,
}: {
  label: string;
  /** null renders an em dash (nothing to measure yet). */
  value: number | null;
  format?: "number" | "eur" | "pct" | "days";
  hint?: React.ReactNode;
  /** Accepted for compatibility; not drawn. */
  icon?: LucideIcon;
  tone?: Tone;
  /** Colours the value itself, e.g. amber when deadlines are at risk. */
  emphasis?: "danger" | "success" | "warning" | "brand";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col rounded-xl border border-border bg-card px-5 pt-4 pb-5", className)}>
      <span className="eyebrow text-muted-foreground">{label}</span>
      {value == null ? (
        <span className="figure mt-3 block text-[2.125rem] leading-none font-semibold text-subtle" aria-label="Not available yet">
          —
        </span>
      ) : (
        <AnimatedNumber
          value={value}
          format={format}
          className={cn(
            "figure mt-3 block text-[2.125rem] leading-none font-semibold text-foreground",
            emphasis === "danger" && "text-danger-fg",
            emphasis === "warning" && "text-warning-fg",
            emphasis === "success" && "text-success-fg",
            emphasis === "brand" && "text-brand-fg",
          )}
        />
      )}
      {hint && <div className="mt-2.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
