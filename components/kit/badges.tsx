import { FileSearch, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/** Navy outline badge marking a step that only a person can take. */
export function HumanDecisionBadge({ className, label = "Human decision" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md bg-card px-2 text-xs font-medium whitespace-nowrap text-human-fg ring-1 ring-human/45 ring-inset",
        className,
      )}
    >
      <UserRound className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Overline in the analysis navy. */
export function AiEyebrow({ className, children = "Analysis" }: { className?: string; children?: React.ReactNode }) {
  return <span className={cn("eyebrow text-ai-fg", className)}>{children}</span>;
}

/** Small outlined label for content Kelvin produced (e.g. "Drafted by Kelvin"). */
export function AiBadge({ className, label = "Analysis" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm px-1.5 text-[10.5px] font-semibold tracking-[0.06em] whitespace-nowrap text-ai-fg uppercase ring-1 ring-ai-fg/30 ring-inset",
        className,
      )}
    >
      {label}
    </span>
  );
}

/** Quiet navy tile for the analysis area. */
export function AiTile({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "size-8", md: "size-10", lg: "size-12" }[size];
  const icon = { sm: "size-4", md: "size-[18px]", lg: "size-5" }[size];
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-md bg-ai-soft text-ai-fg", dims, className)}>
      <FileSearch className={icon} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}
