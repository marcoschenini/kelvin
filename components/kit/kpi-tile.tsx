import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/domain/case-status";
import { AnimatedNumber } from "./animated-number";
import { IconTile } from "./surfaces";

export function KpiTile({
  label,
  value,
  format = "number",
  hint,
  icon,
  tone = "neutral",
  emphasis,
  className,
}: {
  label: string;
  /** null renders an em dash (nothing to measure yet). */
  value: number | null;
  format?: "number" | "eur" | "pct" | "days";
  hint?: React.ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  /** Colours the value itself, e.g. red when deadlines are at risk. */
  emphasis?: "danger" | "success";
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-5 shadow-card", className)}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        <IconTile icon={icon} tone={tone} size="sm" />
      </div>
      {value == null ? (
        <span className="num mt-2 block text-[1.75rem] leading-none font-semibold tracking-[-0.02em] text-subtle" aria-label="Not available yet">
          —
        </span>
      ) : (
      <AnimatedNumber
        value={value}
        format={format}
        className={cn(
          "mt-2 block text-[1.75rem] leading-none font-semibold tracking-[-0.02em]",
          emphasis === "danger" && "text-danger-fg",
          emphasis === "success" && "text-success-fg",
        )}
      />
      )}
      {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
