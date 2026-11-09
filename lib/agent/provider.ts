import "server-only";
import type { LanguageModel } from "ai";

/**
 * Model provider, configured by env:
 *   AI_PROVIDER = anthropic | openrouter   (default anthropic)
 *   AI_MODEL    = model id                 (default claude-opus-5-5)
 *   AI_EFFORT   = low | medium | high | xhigh | max (Anthropic only, default medium)
 * Returns null when no API key is configured: the orchestrator then falls back
 * to the deterministic planner (or Replay mode).
 */

export interface ModelHandle {
  model: LanguageModel;
  id: string;
  provider: "anthropic" | "openrouter";
  providerOptions: Record<string, Record<string, unknown>>;
}

export const DEFAULT_MODEL = "claude-opus-5-5";

export function providerName(): "anthropic" | "openrouter" {
  return process.env.AI_PROVIDER === "openrouter" ? "openrouter" : "anthropic";
}

export function hasModelCredentials(): boolean {
  return providerName() === "openrouter" ? !!process.env.OPENROUTER_API_KEY : !!process.env.ANTHROPIC_API_KEY;
}

export async function getModel(): Promise<ModelHandle | null> {
  if (!hasModelCredentials()) return null;
  const effort = (process.env.AI_EFFORT ?? "medium") as "low" | "medium" | "high" | "xhigh" | "max";
  if (providerName() === "openrouter") {
    const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
    const id = process.env.AI_MODEL ?? `anthropic/${DEFAULT_MODEL}`;
    return { model: createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY })(id), id, provider: "openrouter", providerOptions: {} };
  }
  const { createAnthropic } = await import("@ai-sdk/anthropic");
  const id = process.env.AI_MODEL ?? DEFAULT_MODEL;
  return {
    model: createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(id),
    id,
    provider: "anthropic",
    // Adaptive thinking with an explicit effort (Opus 5.5 defaults to medium); server-side refusal fallback.
    providerOptions: {
      anthropic: {
        thinking: { type: "adaptive" },
        effort,
        fallbacks: "default",
        anthropicBeta: ["server-side-fallback-2026-07-01"],
      },
    },
  };
}
