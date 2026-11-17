import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { APICallError, type LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { DB } from "@/lib/db/client";
import type { ChatEvent } from "@/lib/chat/events";

/**
 * "Ask Kelvin": built-in answers on the analysed demo cases, the intent matcher,
 * and the chat route with no AI, a (mock) AI that calls a tool, and an AI that fails.
 */

process.env.KELVIN_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "kelvin-chat-"));
process.env.DB_MODE = "local";
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENROUTER_API_KEY;
delete process.env.GROQ_API_KEY;

vi.mock("@/lib/chat/llm", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/chat/llm")>();
  return { ...orig, getChatModel: vi.fn(orig.getChatModel) };
});

const NOW = new Date("2026-11-09T10:00:00Z");
let db: DB;
let chat: typeof import("@/lib/chat/answers");
let load: (id: string) => Promise<import("@/lib/chat/context").ChatContext>;

beforeAll(async () => {
  const { getDb } = await import("@/lib/db/client");
  db = await getDb();
  const { resetDemo } = await import("@/seed/seed-db");
  const { runAgent } = await import("@/lib/agent/orchestrator");
  await resetDemo(db, NOW);
  for (const id of ["demo-a", "demo-b", "demo-c"]) await runAgent({ db, caseId: id, kind: "investigate", mode: "deterministic", now: NOW, record: false });
  chat = await import("@/lib/chat/answers");
  const { loadChatContext } = await import("@/lib/chat/context");
  load = (id) => loadChatContext(db, id, NOW);
}, 120_000);

describe("built-in answers", () => {
  it("explains B's payer with the amounts and real sources", async () => {
    const ctx = await load("demo-b");
    const a = chat.whyPayer(ctx);
    expect(a.text).toMatch(/\*\*insurer\*\*/);
    expect(a.text).toContain("€190,000");
    expect(a.text).toContain("€3,771");
    expect(a.text).toContain("custody");
    expect(a.text).not.toMatch(/\.\)\.|\.\./);
    expect(a.citationIds.length).toBeGreaterThan(0);
    for (const id of a.citationIds) {
      expect(ctx.record.citations?.[id]).toBeTruthy();
      expect(a.text).toContain(`[${id}]`);
    }
  });

  it("says there is nothing to claim on A, and names the forwarder on C", async () => {
    expect(chat.whyPayer(await load("demo-a")).text).toMatch(/no payer to claim/i);
    const c = chat.whyPayer(await load("demo-c")).text;
    expect(c).toMatch(/\*\*forwarder\*\*/);
    expect(c).toContain("€350,000");
  });

  it("lists deadlines, custody and quality from the record", async () => {
    const ctx = await load("demo-b");
    expect(chat.deadlines(ctx).text).toMatch(/days (left|overdue)/);
    expect(chat.custody(ctx).text).toContain("Boreal Air Cargo");
    expect(chat.quality(ctx).text).toMatch(/\*\*damaged\*\*/);
    expect(chat.nextAction(ctx).text).toMatch(/approval/i);
  });

  it("simulates a declared value with the real rules, without changing the case", async () => {
    const ctx = await load("demo-b");
    const before = JSON.stringify(ctx.record.ranking);
    const a = chat.whatIf(ctx, { declaredValueEur: 200_000 });
    expect(a.text).toContain("Carrier: €200,000 (currently €3,771)");
    expect(a.text).toContain("**insurer**, €190,000 → **carrier**, €200,000");
    expect(a.text).toContain("simulation");
    expect(JSON.stringify((await load("demo-b")).record.ranking)).toBe(before);
  });

  it("shows lapsed notices when the claim is handled much later", async () => {
    const a = chat.whatIf(await load("demo-b"), { daysLater: 30 });
    expect(a.text).toMatch(/would have lapsed/);
  });

  it("says when only the amount changes, not the payer", async () => {
    const a = chat.whatIf(await load("demo-b"), { valueEur: 80_000 });
    expect(a.text).toContain("Same payer, **insurer**, but the amount changes: €190,000 → **€70,000**");
  });

  it("never invents a claim on a no-claim case, whatever the what-if", async () => {
    const ctx = await load("demo-a");
    for (const w of [{ valueEur: 80_000 }, { declaredValueEur: 200_000 }, { daysLater: 30 }]) {
      const a = chat.whatIf(ctx, w);
      expect(a.text).toContain("**no claim**");
      expect(a.text).not.toMatch(/currently|lapsed|forwarder/i);
    }
  });

  it("refuses to act and says who does", async () => {
    const a = chat.answer(await load("demo-b"), "action");
    expect(a.text).toMatch(/can't do that/);
    expect(a.text).toContain("Tom Becker");
  });
});

describe("intent matcher", () => {
  it.each([
    ["Why this payer?", "why_payer"],
    ["Perché l'assicurazione e non la compagnia aerea?", "why_payer"],
    ["Quali sono le scadenze?", "deadlines"],
    ["Who held the cargo when it warmed up?", "custody"],
    ["Il prodotto è ancora utilizzabile?", "quality"],
    ["Riassumi il caso", "summary"],
    ["Cosa devo fare adesso?", "next_action"],
    ["ciao", "help"],
    ["How much can we recover?", "why_payer"],
    ["Quanto possiamo recuperare?", "why_payer"],
    ["How long was it out of range?", "custody"],
    ["What is the Montreal Convention limit?", "why_payer"],
    ["What does the policy deductible do?", "why_payer"],
    ["Has the claim letter been sent?", "next_action"],
    ["Who should we claim from for the excursion?", "why_payer"],
    ["Perché paga l'assicurazione se la merce è danneggiata?", "why_payer"],
    ["Send the claim to the insurer", "action"],
    ["Can you draft a letter to the airline?", "action"],
    ["Approve the draft", "action"],
    ["Puoi inviare la lettera?", "action"],
    // The suggestion chips themselves
    ["What are the deadlines?", "deadlines"],
    ["Is the product still usable?", "quality"],
    ["What should I do next?", "next_action"],
    ["Summarize the case", "summary"],
    ["Why no claim?", "why_payer"],
  ])("%s → %s", async (q, intent) => {
    const { matchIntent } = await import("@/lib/chat/intents");
    expect(matchIntent(q).intent).toBe(intent);
  });

  it("parses what-if numbers in English and Italian", async () => {
    const { matchIntent, parseAmount } = await import("@/lib/chat/intents");
    expect(matchIntent("What if the declared value were €200,000?")).toEqual({ intent: "what_if", whatIf: { declaredValueEur: 200_000 } });
    expect(matchIntent("E se il valore dichiarato fosse 200.000 euro?").whatIf).toEqual({ declaredValueEur: 200_000 });
    expect(matchIntent("What if the shipment weighed 500 kg?").whatIf).toEqual({ weightKg: 500 });
    expect(matchIntent("What if we handled it 10 days later?").whatIf).toEqual({ daysLater: 10 });
    expect(matchIntent("E se la merce valesse 80 mila?").whatIf).toEqual({ valueEur: 80_000 });
    expect(parseAmount("€1.5k")).toBe(1500);
    expect(parseAmount("200 000")).toBe(200_000);
    expect(matchIntent("What if the shipment weighed 1,200 kg?").whatIf).toEqual({ weightKg: 1200 });
    expect(matchIntent("What if the goods were worth 1.2 million?").whatIf).toEqual({ valueEur: 1_200_000 });
    expect(matchIntent("E se la merce valesse 2 milioni?").whatIf).toEqual({ valueEur: 2_000_000 });
    expect(matchIntent("What if there was no declared value?").whatIf).toEqual({ declaredValueEur: null });
    expect(matchIntent("What if we wait 20 days?").whatIf).toEqual({ daysLater: 20 });
    expect(matchIntent("E se gestissimo il caso tra 20 giorni?").whatIf).toEqual({ daysLater: 20 });
    expect(matchIntent("What if we handled it 10 days later?").whatIf).toEqual({ daysLater: 10 });
  });
});

/* -------------------------------------------------------------------- route */

async function ask(question: string): Promise<ChatEvent[]> {
  const { POST } = await import("@/app/api/cases/[id]/chat/route");
  const res = await POST(
    new Request("http://test/api/cases/demo-b/chat", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: question }] }) }),
    { params: Promise.resolve({ id: "demo-b" }) } as never,
  );
  expect(res.status).toBe(200);
  return (await res.text())
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as ChatEvent);
}

const usage = { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } };
const stream = (chunks: LanguageModelV3StreamPart[]) => ({ stream: simulateReadableStream({ chunks }) });

describe("chat route", () => {
  it("answers from the built-in answers when no AI key is set", async () => {
    const ev = await ask("Why this payer?");
    expect(ev[0]).toEqual({ type: "meta", mode: "rules", model: null });
    expect(ev.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("")).toContain("€190,000");
    const cits = ev.find((e) => e.type === "citations") as { items: Record<string, unknown> };
    expect(Object.keys(cits.items).length).toBeGreaterThan(0);
    expect(ev.at(-1)).toEqual({ type: "done", mode: "rules" });
  });

  it("lets the AI call a read-only tool, and keeps only citations a tool returned", async () => {
    const llm = await import("@/lib/chat/llm");
    const ctx = await load("demo-b");
    const returned = chat.whyPayer(ctx).citationIds[0];
    // A real source that explain_recommendation did not return: the model must not pin it on its text.
    const notReturned = Object.keys(ctx.record.citations ?? {}).find((id) => !chat.whyPayer(ctx).citationIds.includes(id))!;
    const model = new MockLanguageModelV3({
      doStream: [
        stream([
          { type: "stream-start", warnings: [] },
          { type: "tool-call", toolCallId: "t1", toolName: "explain_recommendation", input: "{}" },
          { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
        ]),
        stream([
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "x" },
          { type: "text-delta", id: "x", delta: `L'assicurazione paga **€190.000** [${returned}] [${notReturned}] [S999].` },
          { type: "text-end", id: "x" },
          { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
        ]),
      ],
    });
    vi.mocked(llm.getChatModel).mockResolvedValueOnce({ model, id: "mock-model" });
    const ev = await ask("Perché l'assicurazione?");
    expect(ev[0]).toEqual({ type: "meta", mode: "ai", model: "mock-model" });
    expect(ev).toContainEqual({ type: "tool", name: "explain_recommendation" });
    // The tool ran against the real case: its result went back to the model.
    const secondPrompt = JSON.stringify(model.doStreamCalls[1].prompt);
    expect(secondPrompt).toContain("190,000");
    const cits = ev.find((e) => e.type === "citations") as { items: Record<string, unknown> };
    expect(Object.keys(cits.items)).toEqual([returned]);
    expect(ev.at(-1)).toEqual({ type: "done", mode: "ai" });
  });

  it("rejects bad input with 400 and an unknown case with 404, without throwing", async () => {
    const { POST } = await import("@/app/api/cases/[id]/chat/route");
    const post = (id: string, body: unknown) =>
      POST(new Request(`http://test/api/cases/${id}/chat`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) } as never);
    expect((await post("demo-b", { messages: [] })).status).toBe(400);
    expect((await post("demo-b", { messages: [{ role: "assistant", content: "hi" }] })).status).toBe(400);
    expect((await post("demo-b", { messages: [{ role: "user", content: "x".repeat(2001) }] })).status).toBe(400);
    expect((await post("nope", { messages: [{ role: "user", content: "Why this payer?" }] })).status).toBe(404);
    // A long earlier answer is trimmed, not rejected.
    const long = { messages: [{ role: "user", content: "Summarize" }, { role: "assistant", content: "y".repeat(9000) }, { role: "user", content: "Why this payer?" }] };
    expect((await post("demo-b", long)).status).toBe(200);
  });

  it("falls back to the built-in answer when the AI fails before writing", async () => {
    const llm = await import("@/lib/chat/llm");
    const model = new MockLanguageModelV3({
      doStream: async () => {
        throw new APICallError({ message: "rate limited", url: "https://api.groq.com", requestBodyValues: {}, statusCode: 429, isRetryable: false });
      },
    });
    vi.mocked(llm.getChatModel).mockResolvedValueOnce({ model, id: "mock-model" });
    const ev = await ask("What are the deadlines?");
    expect(ev.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("")).toMatch(/Deadlines, nearest first/);
    expect(ev.at(-1)).toEqual({ type: "done", mode: "rules", fallback: "the free AI quota is used up for now" });
  });
});
