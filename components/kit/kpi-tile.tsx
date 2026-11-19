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
  compact,
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
  /** Smaller figure and padding, for a single row above a list. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col surface px-5 pt-4 pb-5", compact && "px-4 pt-3 pb-3.5", className)}>
      <span className="eyebrow text-muted-foreground">{label}</span>
      {value == null ? (
        <span className={cn("figure mt-3 block text-[2.125rem] leading-none font-semibold text-subtle", compact && "mt-2 text-[1.625rem]")} aria-label="Not available yet">
          —
        </span>
      ) : (
        <AnimatedNumber
          value={value}
          format={format}
          className={cn(
            "figure mt-3 block text-[2.125rem] leading-none font-semibold text-foreground",
            compact && "mt-2 text-[1.625rem]",
            emphasis === "danger" && "text-danger-fg",
            emphasis === "warning" && "text-warning-fg",
            emphasis === "success" && "text-success-fg",
            emphasis === "brand" && "text-brand-fg",
          )}
        />
      )}
      {hint && <div className={cn("mt-2.5 text-xs text-muted-foreground", compact && "mt-1.5")}>{hint}</div>}
    </div>
  );
}
