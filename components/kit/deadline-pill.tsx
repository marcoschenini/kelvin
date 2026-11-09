import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate, formatDaysLeft } from "@/lib/format";
import type { Tone } from "@/lib/domain/case-status";
import { TONE_CHIP } from "./tone";

/** Red only when overdue or under 3 days; amber within a week; calm otherwise. */
export function deadlineTone(daysLeft: number | null | undefined): Tone {
  if (daysLeft == null) return "neutral";
  if (daysLeft < 3) return "danger";
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
  const tone = TONE_CHIP[deadlineTone(daysLeft)];
  const title = [label, date ? formatDate(date) : null].filter(Boolean).join(" · ");
  return (
    <span
      className={cn(
        "num inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        tone.chip,
        daysLeft < 0 && "bg-danger text-white ring-danger",
        className,
      )}
      title={title || undefined}
    >
      <Clock className="size-3" aria-hidden="true" />
      {formatDaysLeft(daysLeft)}
    </span>
  );
}
