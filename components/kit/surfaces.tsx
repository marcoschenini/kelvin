import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/domain/case-status";
import { TONE_TILE } from "./tone";

/** Hairline square behind a Lucide icon; the tone colours the icon only. */
export function IconTile({
  icon: Icon,
  tone = "ai",
  size = "md",
  className,
}: {
  icon: LucideIcon;
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = { sm: "size-8", md: "size-10", lg: "size-12" }[size];
  const icon = { sm: "size-4", md: "size-[18px]", lg: "size-5" }[size];
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-md border border-border bg-card", dims, TONE_TILE[tone], className)}>
      <Icon className={icon} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

/** Plain card surface for analysis areas (hairline, no wash). */
export function AiSurface({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("relative rounded-xl border border-border bg-card", className)}>{children}</div>;
}

/** Outcome card with a coloured rule on the left: green "No claim", amber "Possible claim". */
export function OutcomeCard({
  tone,
  icon: Icon,
  title,
  description,
  className,
  children,
}: {
  tone: Extract<Tone, "success" | "warning" | "human" | "ai" | "neutral">;
  icon: LucideIcon;
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const rule = {
    success: "before:bg-success",
    warning: "before:bg-warning",
    human: "before:bg-human",
    ai: "before:bg-ai",
    neutral: "before:bg-subtle",
  }[tone];
  const iconColor = {
    success: "text-success",
    warning: "text-warning",
    human: "text-human",
    ai: "text-ai-fg",
    neutral: "text-muted-foreground",
  }[tone];
  return (
    <div
      className={cn(
        "relative flex items-start gap-4 overflow-hidden rounded-xl border border-border bg-card p-5 before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        rule,
        className,
      )}
    >
      <Icon className={cn("mt-0.5 size-6 shrink-0", iconColor)} strokeWidth={1.75} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="font-heading text-[17px] font-semibold text-foreground">{title}</div>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        {children}
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center", className)}>
      <IconTile icon={Icon} tone="neutral" size="lg" />
      <h3 className="mt-4 text-lg font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Section title: serif heading with a muted description. The icon is accepted for compatibility but not drawn. */
export function SectionHeader({
  title,
  description,
  action,
  className,
  eyebrow,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
  eyebrow?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1 text-muted-foreground">{eyebrow}</div>}
        <h2 className="text-[1.2rem] leading-tight font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
