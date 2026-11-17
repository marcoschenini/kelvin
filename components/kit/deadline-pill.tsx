import { AlertTriangle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatDaysLeft } from "@/lib/format";
import type { Tone } from "@/lib/domain/case-status";
import { TONE_CHIP } from "./tone";

/**
 * Dark red only when overdue (always with an icon and the word "Overdue"); amber within a week; calm otherwise.
 * Red never carries meaning on its own.
 */
export function deadlineTone(daysLeft: number | null | undefined): Tone {
  if (daysLeft == null) return "neutral";
  if (daysLeft < 0) return "danger";
  if (daysLeft <= 7) return "warning";
  return "neutral";
}

export function DeadlinePill({
  daysLeft,
  date,
  label,
  className,
}: {
  daysLeft: number | null;
  date?: Date | string | null;
  /** e.g. "Montreal notice" */
  label?: string;
  className?: string;
}) {
  if (daysLeft == null) {
    return <span className={cn("text-xs text-subtle", className)}>No open deadline</span>;
  }
  const overdue = daysLeft < 0;
  const tone = TONE_CHIP[deadlineTone(daysLeft)];
  const title = [label, date ? formatDate(date) : null].filter(Boolean).join(" · ");
  const Icon = overdue ? AlertTriangle : Clock;
  return (
    <span
      className={cn(
        "num inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        tone.chip,
        overdue && "bg-danger text-white ring-danger dark:text-background",
        daysLeft >= 0 && daysLeft < 3 && "font-semibold",
        className,
      )}
      title={title || undefined}
    >
      <Icon className="size-3" aria-hidden="true" />
      {overdue ? `Overdue · ${formatDaysLeft(daysLeft).replace(" overdue", "")}` : formatDaysLeft(daysLeft)}
    </span>
  );
}
