import type { Tone } from "@/lib/domain/case-status";

/** Soft tinted chip: tinted surface, AA text, dot colour. Human decisions are a navy outline. */
export const TONE_CHIP: Record<Tone, { chip: string; dot: string }> = {
  neutral: { chip: "bg-muted text-muted-foreground ring-border", dot: "bg-subtle" },
  ai: { chip: "bg-ai-soft text-ai-fg ring-ai-fg/15", dot: "bg-ai" },
  success: { chip: "bg-success-soft text-success-fg ring-success/20", dot: "bg-success" },
  warning: { chip: "bg-warning-soft text-warning-fg ring-warning/25", dot: "bg-warning" },
  danger: { chip: "bg-danger-soft text-danger-fg ring-danger/30", dot: "bg-danger" },
  human: { chip: "bg-card text-human-fg ring-human/45", dot: "bg-human" },
  cold: { chip: "bg-cold-soft text-cold ring-cold/20", dot: "bg-cold" },
};

/** Icon colours on a neutral square (no coloured bubbles). */
export const TONE_TILE: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  ai: "text-ai-fg",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  human: "text-human",
  cold: "text-cold",
};
