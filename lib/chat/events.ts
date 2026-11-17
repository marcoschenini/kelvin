import type { Citation } from "@/lib/domain/citation";

/** Events streamed by POST /api/cases/[id]/chat (NDJSON, one per line). */
export type ChatEvent =
  | { type: "meta"; mode: "ai" | "rules"; model: string | null }
  /** The model is reading something (tool name), shown as a quiet status line */
  | { type: "tool"; name: string }
  | { type: "text"; delta: string }
  /** Sources cited in the answer, id → citation, for the clickable chips */
  | { type: "citations"; items: Record<string, Citation> }
  /** fallback: the AI was unavailable and the built-in answer was used instead */
  | { type: "done"; mode: "ai" | "rules"; fallback?: string }
  | { type: "error"; error: string };

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
