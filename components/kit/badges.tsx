import { Sparkles, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

/** Violet badge marking a step that only a person can take. */
export function HumanDecisionBadge({ className, label = "Human decision" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full bg-human-soft px-3 text-xs font-medium text-human-fg ring-1 ring-human/20 ring-inset",
        className,
      )}
    >
      <UserRound className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

/** "AI AGENT" eyebrow in the gradient, as in the agent-schema diagram. */
export function AiEyebrow({ className, children = "AI agent" }: { className?: string; children?: React.ReactNode }) {
  return <span className={cn("eyebrow text-ai", className)}>{children}</span>;
}

/** Small gradient pill for AI-produced content. */
export function AiBadge({ className, label = "AI" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn(
        "bg-ai inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-white",
        className,
      )}
    >
      <Sparkles className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}

/** Rounded-square gradient tile with a sparkle: the diagram's agent icon. */
export function AiTile({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "size-8 rounded-[10px]", md: "size-11 rounded-xl", lg: "size-14 rounded-2xl" }[size];
  const icon = { sm: "size-4", md: "size-5", lg: "size-7" }[size];
  return (
    <span className={cn("bg-ai grid shrink-0 place-items-center text-white shadow-glow", dims, className)}>
      <Sparkles className={icon} aria-hidden="true" />
    </span>
  );
}
