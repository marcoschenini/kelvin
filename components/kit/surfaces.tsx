import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/domain/case-status";
import { TONE_TILE } from "./tone";

/** Soft square behind a Lucide icon (diagram style). */
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
  const dims = { sm: "size-8 rounded-lg", md: "size-10 rounded-xl", lg: "size-12 rounded-xl" }[size];
  const icon = { sm: "size-4", md: "size-[18px]", lg: "size-5" }[size];
  return (
    <span className={cn("grid shrink-0 place-items-center", dims, TONE_TILE[tone], className)}>
      <Icon className={icon} aria-hidden="true" />
    </span>
  );
}

/** Card surface used for AI-owned areas: gradient hairline, faint wash, soft glow. */
export function AiSurface({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("border-ai relative rounded-2xl shadow-glow", className)}>
      <div className="bg-ai-wash rounded-[inherit]">{children}</div>
    </div>
  );
}

/** Tinted outcome card: green "No claim", amber "Possible claim" (diagram style). */
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
  const surface = {
    success: "bg-success-soft border-success/20",
    warning: "bg-warning-soft border-warning/25",
    human: "bg-human-soft border-human/20",
    ai: "bg-ai-soft border-ai-from/15",
    neutral: "bg-muted border-border",
  }[tone];
  const iconColor = {
    success: "text-success",
    warning: "text-warning",
    human: "text-human",
    ai: "text-ai-fg",
    neutral: "text-muted-foreground",
  }[tone];
  return (
    <div className={cn("flex items-start gap-4 rounded-xl border p-5", surface, className)}>
      <Icon className={cn("mt-0.5 size-7 shrink-0", iconColor)} strokeWidth={1.75} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold text-foreground">{title}</div>
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
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/60 px-6 py-14 text-center",
        className,
      )}
    >
      <IconTile icon={Icon} tone="ai" size="lg" />
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <div className="flex items-start gap-3">
        {icon && <IconTile icon={icon} size="sm" tone="neutral" />}
        <div>
          <h2 className="text-[15px] leading-tight font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
