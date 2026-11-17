import { getDb } from "@/lib/db/client";
import { PORTFOLIO_SYSTEM, portfolioTools } from "@/lib/chat/llm";
import { loadPortfolio, portfolioBuiltIn } from "@/lib/chat/portfolio";
import { ChatBody, chatResponse, trimHistory } from "@/lib/chat/stream";

export const maxDuration = 60;

/**
 * POST { messages } → answers a question across all cases (the Ask Kelvin page,
 * "All cases"), streamed as NDJSON. Same modes and fallback as the case chat.
 */
export async function POST(req: Request) {
  const parsed = ChatBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  const db = await getDb();
  let ctx: Awaited<ReturnType<typeof loadPortfolio>>;
  try {
    ctx = await loadPortfolio(db);
  } catch (e) {
    console.error("[chat] could not load cases", e);
    return Response.json({ error: "Kelvin could not load the cases. Try again." }, { status: 500 });
  }
  const messages = trimHistory(parsed.data.messages);
  const question = messages[messages.length - 1].content;
  // Built-in answers may need a case's full context, so they are computed up front.
  const builtIn = await portfolioBuiltIn(db, ctx, question);
  return chatResponse({
    req,
    messages,
    label: "all cases",
    system: PORTFOLIO_SYSTEM,
    tools: () => portfolioTools(db, ctx),
    registry: null,
    builtIn: () => builtIn,
  });
}
