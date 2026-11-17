import { getDb } from "@/lib/db/client";
import { answer } from "@/lib/chat/answers";
import { loadChatContext, type ChatContext } from "@/lib/chat/context";
import { matchIntent } from "@/lib/chat/intents";
import { CHAT_SYSTEM, chatTools } from "@/lib/chat/llm";
import { ChatBody, chatResponse, trimHistory } from "@/lib/chat/stream";

export const maxDuration = 60;

/**
 * POST { messages } → answers the last question about one case, streamed as NDJSON.
 * With GROQ_API_KEY: a language model with read-only tools over Kelvin's own answers.
 * Without it, or if the model fails before writing anything: the built-in answers.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/cases/[id]/chat">) {
  const { id } = await ctx.params;
  const parsed = ChatBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  let caseCtx: ChatContext;
  try {
    caseCtx = await loadChatContext(await getDb(), id);
  } catch (e) {
    if (e instanceof Error && /not found/i.test(e.message)) return Response.json({ error: "Case not found" }, { status: 404 });
    console.error("[chat] could not load case", id, e);
    return Response.json({ error: "Kelvin could not load this case. Try again." }, { status: 500 });
  }
  const messages = trimHistory(parsed.data.messages);
  const question = messages[messages.length - 1].content;
  return chatResponse({
    req,
    messages,
    label: `case ${id}`,
    system: CHAT_SYSTEM,
    tools: (onCited) => chatTools(caseCtx, onCited),
    registry: caseCtx.record.citations ?? {},
    builtIn: () => {
      const m = matchIntent(question);
      return answer(caseCtx, m.intent, m.whatIf);
    },
  });
}
