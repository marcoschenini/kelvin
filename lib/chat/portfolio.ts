import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { cases, drafts, type CaseRow } from "@/lib/db/schema";
import type { CaseRecord } from "@/lib/case/record";
import { STATUS_META, type CaseStatus } from "@/lib/domain/case-status";
import { ROUTE_META, type RecoveryRoute } from "@/lib/domain/parties";
import { formatDate, formatEUR } from "@/lib/format";
import { answer, type Answer, type Intent, type WhatIf } from "./answers";
import { loadChatContext } from "./context";
import { matchIntent } from "./intents";

/**
 * "Ask Kelvin" across all cases (the Ask Kelvin page, "All cases"): what needs
 * attention, what is at stake, upcoming deadlines, and questions about one case by
 * name ("why does case B go to the insurer?"), answered with that case's answers.
 * Read-only, like the case chat. Answers here carry no source chips: citation ids are
 * per case, so they are stripped (open the case to see its sources).
 */

export interface PortfolioCase {
  id: string;
  code: string | null;
  ref: string;
  title: string;
  status: string;
  valueEur: number | null;
  recommendedRoute: string | null;
  claimAmountEur: number | null;
  record: CaseRecord;
  deliveredAt?: number | null;
}

export interface PortfolioContext {
  cases: PortfolioCase[];
  waiting: { caseId: string; kind: string; recipientName: string; amountEur: number | null }[];
  now: Date;
}

const toCase = (r: CaseRow): PortfolioCase => ({
  id: r.id,
  code: r.code,
  ref: r.shipmentRef,
  title: r.title,
  status: r.status,
  valueEur: r.valueEur,
  recommendedRoute: r.recommendedRoute,
  claimAmountEur: r.claimAmountEur,
  record: (r.record ?? {}) as CaseRecord,
  deliveredAt: r.deliveredAt?.getTime() ?? null,
});

export async function loadPortfolio(db: DB, now = new Date()): Promise<PortfolioContext> {
  const rows = await db.select().from(cases).where(ne(cases.scenario, "eval"));
  const list = rows.map(toCase).sort((a, b) => (a.code ?? "~").localeCompare(b.code ?? "~") || a.ref.localeCompare(b.ref));
  const ids = list.map((c) => c.id);
  const waiting = ids.length
    ? await db
        .select({ caseId: drafts.caseId, kind: drafts.kind, recipientName: drafts.recipientName, amountEur: drafts.amountEur })
        .from(drafts)
        .where(and(inArray(drafts.caseId, ids), eq(drafts.status, "awaiting_approval")))
    : [];
  return { cases: list, waiting, now };
}

const nameOf = (c: PortfolioCase) => `**${c.code ? `Case ${c.code}` : "Case"}** (${c.ref})`;
const statusOf = (s: string) => STATUS_META[s as CaseStatus]?.label ?? s;
const isClosed = (s: string) => s.startsWith("closed");
const noClaim = (c: PortfolioCase) => c.status === "no_claim" || c.status === "closed_no_claim" || c.record.qaAssessment?.verdict === "usable" || c.record.qa?.status === "released";
const stripCitations = (text: string) => text.replace(/\s*[[【]S\d+[\]】]/g, "");

/** A case named in the question: "case B", "caso b", "RB-24093", "demo-b". */
export function findCase(question: string, ctx: PortfolioContext): PortfolioCase | null {
  const q = question.toLowerCase();
  const byId = ctx.cases.find((c) => q.includes(c.id.toLowerCase()));
  if (byId) return byId;
  const byRef = ctx.cases.filter((c) => q.includes(c.ref.toLowerCase()));
  if (byRef.length) return byRef.reduce((a, b) => ((b.deliveredAt ?? 0) > (a.deliveredAt ?? 0) ? b : a));
  const m = /\b(?:case|caso)\s+([a-z])\b/i.exec(question);
  if (m) return ctx.cases.find((c) => c.code?.toLowerCase() === m[1].toLowerCase()) ?? null;
  return null;
}

export function overview(ctx: PortfolioContext): Answer {
  const open = ctx.cases.filter((c) => !isClosed(c.status));
  if (!ctx.cases.length) return { text: "There are no cases yet. Load the demo cases from New case → Run demo.", citationIds: [] };
  const atStake = open.reduce((s, c) => s + (c.valueEur ?? 0), 0);
  const claimable = open.filter((c) => !noClaim(c) && c.recommendedRoute && c.claimAmountEur).reduce((s, c) => s + (c.claimAmountEur ?? 0), 0);
  const recovered = ctx.cases.reduce((s, c) => s + (c.record.outcome?.recoveredEur ?? 0), 0);
  const lines = [`**${open.length}** open of ${ctx.cases.length} cases · ${formatEUR(atStake)} of goods at stake · **${formatEUR(claimable)}** recommended to claim · ${formatEUR(recovered)} recovered so far.`];
  for (const c of ctx.cases) {
    const plan = noClaim(c) ? "no claim" : c.recommendedRoute && c.claimAmountEur ? `${ROUTE_META[c.recommendedRoute as RecoveryRoute]?.label.toLowerCase() ?? c.recommendedRoute} ${formatEUR(c.claimAmountEur)}` : "not analysed yet";
    lines.push(`- ${nameOf(c)}: ${statusOf(c.status)}, ${plan}. ${c.title}.`);
  }
  return { text: lines.join("\n"), citationIds: [] };
}

export function pending(ctx: PortfolioContext): Answer {
  const lines: string[] = [];
  const byCase = new Map(ctx.cases.map((c) => [c.id, c]));
  if (ctx.waiting.length) {
    lines.push(`**${ctx.waiting.length}** draft(s) wait for the claims manager's approval:`);
    for (const d of ctx.waiting) {
      const c = byCase.get(d.caseId);
      lines.push(`- ${c ? nameOf(c) : d.caseId}: ${d.kind.replace(/_/g, " ")} to ${d.recipientName}${d.amountEur ? `, ${formatEUR(d.amountEur)}` : ""}`);
    }
  }
  const qa = ctx.cases.filter((c) => c.status === "awaiting_qa");
  if (qa.length) lines.push(`QA decision needed (QA Lead): ${qa.map(nameOf).join(", ")}.`);
  const offers = ctx.cases.filter((c) => c.record.negotiation);
  for (const c of offers) lines.push(`- ${nameOf(c)}: open offer ${formatEUR(c.record.negotiation!.offerEur)} from ${c.record.negotiation!.counterparty}; the manager accepts or counters.`);
  const fresh = ctx.cases.filter((c) => c.status === "new");
  if (fresh.length) lines.push(`Not analysed yet: ${fresh.map(nameOf).join(", ")}. Open them and Kelvin starts.`);
  if (!lines.length) lines.push("Nothing is waiting on you: Kelvin is waiting for counterparties, or every case is closed.");
  return { text: lines.join("\n"), citationIds: [] };
}

export function upcomingDeadlines(ctx: PortfolioContext): Answer {
  const rows: { c: PortfolioCase; label: string; dueAt: string; daysLeft: number; status: string }[] = [];
  for (const c of ctx.cases) {
    if (isClosed(c.status) || noClaim(c)) continue;
    const live = new Set((c.record.ranking ?? []).filter((r) => r.recoverableEur > 0 && r.probability > 0).map((r) => r.route));
    for (const d of c.record.deadlines ?? []) {
      if (d.kind !== "notice" || (d.route && c.record.ranking && !live.has(d.route))) continue;
      rows.push({ c, label: d.label, dueAt: d.dueAt, daysLeft: d.daysLeft, status: d.status });
    }
  }
  if (!rows.length) return { text: "No open notice deadlines on the open cases (or the cases are not analysed yet).", citationIds: [] };
  rows.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const lines = ["Upcoming notice deadlines, nearest first:"];
  for (const r of rows.slice(0, 8)) {
    const when = r.status === "overdue" ? `${-r.daysLeft} days overdue` : r.daysLeft === 0 ? "due today" : `${r.daysLeft} days left`;
    lines.push(`- ${nameOf(r.c)}: ${r.label}, **${formatDate(r.dueAt)}** (${when})`);
  }
  return { text: lines.join("\n"), citationIds: [] };
}

export function portfolioHelp(ctx: PortfolioContext): Answer {
  const named = ctx.cases.find((c) => c.code === "B") ?? ctx.cases[0];
  const example = named ? (named.code ? `case ${named.code}` : named.ref) : "case B";
  return {
    text: `I answer across all cases, or about one case by name. Try:\n- Which cases need my attention?\n- How much is at stake?\n- What deadlines are coming up?\n- Why does ${example} go to the insurer?\n- Summarize ${example}\n- What if ${example} had a declared value of €200,000?`,
    citationIds: [],
  };
}

export type PortfolioTopic = "overview" | "pending" | "deadlines" | "help";

export function portfolioAnswer(ctx: PortfolioContext, topic: PortfolioTopic): Answer {
  return topic === "overview" ? overview(ctx) : topic === "pending" ? pending(ctx) : topic === "deadlines" ? upcomingDeadlines(ctx) : portfolioHelp(ctx);
}

/** One case's built-in answer, introduced by the case name, without its (per-case) citation markers. */
export async function caseAnswer(db: DB, c: PortfolioCase, intent: Intent, whatIf?: WhatIf, now = new Date()): Promise<Answer> {
  const a = answer(await loadChatContext(db, c.id, now), intent, whatIf);
  return { text: `${nameOf(c)}\n${stripCitations(a.text)}`, citationIds: [] };
}

/** Built-in answer for a question across cases (no AI). */
export async function portfolioBuiltIn(db: DB, ctx: PortfolioContext, question: string): Promise<Answer> {
  const c = findCase(question, ctx);
  if (c) {
    const m = matchIntent(question);
    return caseAnswer(db, c, m.intent === "help" ? "summary" : m.intent, m.whatIf, ctx.now);
  }
  const q = question.toLowerCase();
  if (/\b(attention|need|pending|waiting|approv\w*|todo|to do|cosa devo|attesa|aspett\w*|urgent\w*)\b/.test(q)) return pending(ctx);
  if (/\b(deadline\w*|scadenz\w*|notice|avvis\w*|due|entro)\b/.test(q)) return upcomingDeadlines(ctx);
  if (/\b(overview|summar\w*|riassum\w*|stake|in gioco|how much|quanto|total\w*|totale|portfolio|all cases|tutti i casi|status|stato)\b/.test(q)) return overview(ctx);
  return portfolioHelp(ctx);
}
