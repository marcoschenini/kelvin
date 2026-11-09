import type { Tone } from "@/lib/domain/case-status";

/** Soft tinted chip: tinted surface, AA text, dot colour. */
export const TONE_CHIP: Record<Tone, { chip: string; dot: string }> = {
  neutral: { chip: "bg-muted text-muted-foreground ring-border", dot: "bg-subtle" },
  ai: { chip: "bg-ai-soft text-ai-fg ring-ai-from/15", dot: "bg-ai" },
  success: { chip: "bg-success-soft text-success-fg ring-success/20", dot: "bg-success" },
  warning: { chip: "bg-warning-soft text-warning-fg ring-warning/25", dot: "bg-warning" },
  danger: { chip: "bg-danger-soft text-danger-fg ring-danger/25", dot: "bg-danger" },
  human: { chip: "bg-human-soft text-human-fg ring-human/20", dot: "bg-human" },
  cold: { chip: "bg-cold-soft text-ai-fg ring-cold/25", dot: "bg-cold" },
};

/** Icon tile colours (diagram-style soft square behind a Lucide icon). */
export const TONE_TILE: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  ai: "bg-ai-soft text-ai-fg",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  human: "bg-human-soft text-human",
  cold: "bg-cold-soft text-cold",
};
