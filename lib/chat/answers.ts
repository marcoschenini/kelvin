import { deadlineInput, liabilityInput, totalLossEur } from "@/lib/agent/assess";
import { STATUS_META, type CaseStatus } from "@/lib/domain/case-status";
import { CUSTODY_META, ROUTE_META, type RecoveryRoute } from "@/lib/domain/parties";
import { formatDate, formatDuration, formatEUR, formatKg, formatTemp } from "@/lib/format";
import { buildClaimPlan } from "@/lib/rules/claim-plan";
import { computeDeadlines } from "@/lib/rules/deadlines";
import { computeLiability } from "@/lib/rules/liability";
import { rankRoutes } from "@/lib/rules/ranking";
import type { Deadline, LiabilityInput, RankedRoute } from "@/lib/rules/types";
import type { ChatContext } from "./context";

/**
 * Built-in answers: computed from the case record and the rules engine, no language
 * model involved. They back the chat when no model key is set (or the model is
 * unavailable), and they are also the tools the model calls when one is.
 *
 * Text uses a small markdown subset (paragraphs, "- " bullets, **bold**) and cites
 * sources inline as [S7], ids from the case's citation registry.
 */
export interface Answer {
  text: string;
  /** Citation ids used in the text (all exist in the case's registry) */
  citationIds: string[];
}

export type Intent = "summary" | "why_payer" | "deadlines" | "custody" | "quality" | "next_action" | "documents" | "what_if" | "action" | "help";

export interface WhatIf {
  /** Declared value for carriage in €; null = no declared value (NVD) */
  declaredValueEur?: number | null;
  weightKg?: number;
  /** Value of the goods (the loss) in € */
  valueEur?: number;
  /** As if the claim were handled this many days later than today */
  daysLater?: number;
}

const label = (r: RecoveryRoute) => ROUTE_META[r].label.toLowerCase();
const statusLabel = (s: string) => STATUS_META[s as CaseStatus]?.label ?? s;

/** Collects citation ids that exist and renders them as " [S1] [S4]". */
function citer(ctx: ChatContext) {
  const used = new Set<string>();
  const reg = ctx.record.citations ?? {};
  const cite = (...ids: (string | undefined | null)[]) => {
    const ok = [...new Set(ids.filter((id): id is string => !!id && !!reg[id]))];
    ok.forEach((id) => used.add(id));
    return ok.length ? ` ${ok.map((id) => `[${id}]`).join(" ")}` : "";
  };
  return { cite, used: () => [...used] };
}

function notAnalysed(ctx: ChatContext): Answer | null {
  if (ctx.record.excursions) return null;
  return {
    text:
      ctx.row.status === "new"
        ? "Kelvin has not analysed this case yet. Open the case: the analysis starts by itself, then ask me again."
        : "The analysis is still running. Ask me again when it has finished.",
    citationIds: [],
  };
}

/** Sources behind each route's numbers, for citing. */
function routeSources(ctx: ChatContext, route: RecoveryRoute): (string | undefined)[] {
  const r = ctx.record;
  const c = r.contract?.clauses ?? {};
  const p = r.policy?.clauses ?? {};
  if (route === "carrier") return [r.shipment?.citations?.awb, ...(r.custody?.attribution?.citationIds ?? [])];
  if (route === "forwarder") return [c.liability_cap?.citationId, c.hub_storage?.citationId, c.air_carriers?.citationId];
  return [p.temperature_cover?.citationId, p.deductible?.citationId, p.settlement?.citationId];
}

/**
 * No product was lost (QA released it, or the quality agent found it usable): there is
 * nothing to claim, even if a ranking computed earlier "assuming QA rejects" is still stored.
 */
const noClaim = (ctx: ChatContext) =>
  ctx.qa.status === "released" || ctx.record.qaAssessment?.verdict === "usable" || ctx.row.status === "no_claim" || ctx.row.status === "closed_no_claim";

const trimDot = (s: string) => s.replace(/\.\s*$/, "");

const mainExcursion = (ctx: ChatContext) => ctx.record.excursions?.find((e) => e.direction === "high") ?? ctx.record.excursions?.[0];

function deadlineLine(d: Deadline) {
  const when = d.status === "overdue" ? `${-d.daysLeft} days overdue` : d.daysLeft === 0 ? "due today" : `${d.daysLeft} days left`;
  return `${d.label}: **${formatDate(d.dueAt)}** (${when}), ${d.basis}`;
}

/* ------------------------------------------------------------------ answers */

export function summary(ctx: ChatContext): Answer {
  const { cite, used } = citer(ctx);
  const { row, record } = ctx;
  const lines: string[] = [];
  lines.push(
    `**${row.shipmentRef}**: ${row.product}, ${row.origin} → ${row.destination}, ${(() => { const v = record.shipment?.valueEur ?? row.valueEur; const kg = record.shipment?.weightKg ?? row.weightKg; return [v != null ? `value ${formatEUR(v)}` : null, kg != null ? formatKg(kg) : null].filter(Boolean).join(", "); })()}${cite(record.shipment?.citations?.invoice, record.shipment?.citations?.awb)}. Status: **${statusLabel(row.status)}**.`,
  );
  const ex = mainExcursion(ctx);
  const attr = record.custody?.attribution;
  if (ex) {
    lines.push(
      `- Excursion: peak ${formatTemp(ex.peakC)}, ${formatDuration(ex.minutes)} out of range from ${formatDate(ex.start)}${cite(ex.citationId)}${attr ? `, while ${attr.custodian} (${CUSTODY_META[attr.role].label.toLowerCase()}) held the cargo at ${attr.location}${cite(...attr.citationIds)}` : ""}.`,
    );
  } else if (record.excursions) {
    lines.push("- The logger shows no excursion: nothing to claim.");
  }
  const qa = record.qaAssessment;
  if (qa) lines.push(`- Quality: **${qa.verdict}**. ${qa.reasons[0] ?? ""}${cite(qa.citationId)}`);
  const plan = noClaim(ctx) ? [] : (record.claimPlan ?? []);
  if (noClaim(ctx)) {
    lines.push(`- No claim: ${record.closingNote ?? "the product is still usable, so there is no loss to recover"}.`);
  } else if (plan.length) {
    const total = plan.reduce((s, p) => s + p.amountEur, 0);
    lines.push(`- Claim plan: ${plan.map((p) => `${label(p.route)} ${formatEUR(p.amountEur)} (${p.role})`).join(", then ")}, **${formatEUR(total)}** in total.`);
  } else if (row.status.startsWith("closed")) {
    lines.push(`- Closed: ${record.closingNote ?? row.closedReason ?? "see the audit trail"}.`);
  }
  const live = new Set((noClaim(ctx) ? [] : (record.ranking ?? [])).filter((r) => r.recoverableEur > 0 && r.probability > 0).map((r) => r.route));
  const next = (record.deadlines ?? []).filter((d) => d.kind === "notice" && d.status !== "overdue" && (!d.route || live.has(d.route))).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  if (next) lines.push(`- Nearest deadline: ${deadlineLine(next)}.`);
  return { text: lines.join("\n"), citationIds: used() };
}

export function whyPayer(ctx: ChatContext): Answer {
  const pending = notAnalysed(ctx);
  if (pending) return pending;
  const { cite, used } = citer(ctx);
  const { record } = ctx;
  const ranked = record.ranking ?? [];
  const top = noClaim(ctx) ? undefined : ranked.find((r) => r.recommended && r.recoverableEur > 0);
  if (!top) {
    const why = record.qaAssessment?.verdict === "usable" ? record.qaAssessment.reasons[0] : record.closingNote;
    return {
      text: `There is no payer to claim. ${trimDot(why ?? "Nothing is recoverable on any route")}${cite(record.qaAssessment?.citationId)}. No product was lost, so there is no loss to recover.`,
      citationIds: used(),
    };
  }
  const lines = [
    `Kelvin recommends the **${label(top.route)}**: **${formatEUR(top.recoverableEur)}** recoverable, ${Math.round(top.probability * 100)}% likely${cite(...routeSources(ctx, top.route))}.`,
    `- Why: ${top.reasons.slice(0, 2).map(trimDot).join(". ")}.`,
    `- Working: ${top.basis}`,
  ];
  for (const r of ranked.filter((x) => x.route !== top.route)) {
    const weak = r.blockers[0] ?? r.reasons[0];
    lines.push(`- ${ROUTE_META[r.route].label}: ${formatEUR(r.recoverableEur)} (${trimDot(r.basis)})${weak ? `. ${trimDot(weak)}.` : "."}${cite(...routeSources(ctx, r.route))}`);
  }
  const secondary = (record.claimPlan ?? []).find((p) => p.role === "secondary");
  if (secondary) lines.push(`Then a secondary claim against the **${label(secondary.route)}** for ${formatEUR(secondary.amountEur)}: ${secondary.reason}`);
  return { text: lines.join("\n"), citationIds: used() };
}

export function deadlines(ctx: ChatContext): Answer {
  const pending = notAnalysed(ctx);
  if (pending) return pending;
  const { cite, used } = citer(ctx);
  const r = ctx.record;
  if (noClaim(ctx)) return { text: "There is no claim on this case (the product is still usable), so no notice deadline has to be met.", citationIds: [] };
  const list = [...(r.deadlines ?? [])].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  if (!list.length) return { text: "No deadlines apply to this case (no excursion, or nothing to claim).", citationIds: [] };
  const live = new Set((r.ranking ?? []).filter((x) => x.recoverableEur > 0 && x.probability > 0).map((x) => x.route));
  const src = [r.shipment?.citations?.awb, r.contract?.clauses.notice?.citationId, r.contract?.clauses.time_bar?.citationId, r.policy?.clauses.notification?.citationId];
  const lines = [`Deadlines, nearest first${cite(...src)}:`];
  for (const d of list) {
    const dropped = d.route && r.ranking && !live.has(d.route);
    lines.push(`- ${deadlineLine(d)}${dropped ? " (route not pursued)" : ""}`);
  }
  const notices = r.protectiveNotices ?? [];
  if (notices.length) lines.push(`Protective notice drafted for: ${notices.map((n) => n.route).join(", ")}, so the right to claim is kept while the case continues.`);
  return { text: lines.join("\n"), citationIds: used() };
}

export function custody(ctx: ChatContext): Answer {
  const pending = notAnalysed(ctx);
  if (pending) return pending;
  const { cite, used } = citer(ctx);
  const ex = mainExcursion(ctx);
  const attr = ctx.record.custody?.attribution;
  if (!ex) return { text: "The logger shows no temperature excursion on this shipment.", citationIds: [] };
  const lines = [`The cargo reached **${formatTemp(ex.peakC)}** and stayed out of range for **${formatDuration(ex.minutes)}**, from ${formatDate(ex.start)}${cite(ex.citationId)}.`];
  if (attr) {
    lines.push(
      `At that moment **${attr.custodian}** (${CUSTODY_META[attr.role].label.toLowerCase()}) held it: ${attr.activity} at ${attr.location}, ${attr.controlled ? "a temperature-controlled segment" : "an uncontrolled (ambient) segment"}${cite(...attr.citationIds)}.`,
    );
    if (attr.spansMultipleParties) lines.push("The excursion spans more than one custodian, so attribution is less certain.");
  }
  const segs = ctx.record.custody?.segments ?? [];
  // One entry per hand-over: consecutive segments with the same custodian collapse into one.
  const chain = segs.map((s) => s.custodian).filter((c, i, all) => i === 0 || c !== all[i - 1]);
  if (chain.length) lines.push(`Custody chain: ${trimDot(chain.join(" → "))}.`);
  return { text: lines.join("\n"), citationIds: used() };
}

export function quality(ctx: ChatContext): Answer {
  const pending = notAnalysed(ctx);
  if (pending) return pending;
  const { cite, used } = citer(ctx);
  const qa = ctx.record.qaAssessment;
  if (!qa) return { text: `The quality assessment has not been made yet. Human QA status: ${ctx.qa.status}.`, citationIds: [] };
  const verdict = { usable: "still usable", damaged: "damaged", unsure: "too close to call: a human QA must decide" }[qa.verdict];
  const lines = [`The quality agent found the product **${verdict}**${cite(qa.citationId, mainExcursion(ctx)?.citationId)}.`];
  if (qa.allowance) lines.push(`- Measured: ${qa.peakC != null ? formatTemp(qa.peakC) : "n/a"} peak, ${formatDuration(qa.minutesOutOfRange)} out of range. Allowed: up to ${formatTemp(qa.allowance.maxTempC)} for ${formatDuration(qa.allowance.maxMinutesOutOfRange)}.`);
  qa.reasons.slice(0, 3).forEach((r) => lines.push(`- ${r}`));
  if (ctx.qa.status !== "pending" && ctx.qa.by && ctx.qa.by !== "Quality agent") lines.push(`Human QA (${ctx.qa.by}): ${ctx.qa.status}${ctx.qa.note ? `, "${ctx.qa.note}"` : ""}.`);
  return { text: lines.join("\n"), citationIds: used() };
}

export function nextAction(ctx: ChatContext): Answer {
  const s = ctx.row.status;
  const waiting = ctx.drafts.filter((d) => d.status === "awaiting_approval");
  const approved = ctx.drafts.filter((d) => d.status === "approved");
  const lines = [`Status: **${statusLabel(s)}**. ${STATUS_META[s as CaseStatus]?.description ?? ""}.`];
  if (s === "new" || s === "investigating") lines.push("Kelvin is (or will be) analysing the case: nothing for you to do yet.");
  if (s === "awaiting_qa") lines.push("A QA lead must decide whether the product is still usable (switch persona to Elena Weber, QA Lead).");
  if (waiting.length) {
    lines.push("Waiting for a manager's approval (Tom Becker):");
    waiting.forEach((d) => lines.push(`- ${d.kind.replace(/_/g, " ")} to ${d.recipientName}${d.amountEur ? `, ${formatEUR(d.amountEur)}` : ""}`));
  }
  if (approved.length) lines.push(`${approved.length} approved message(s) ready to send: Kelvin sends them on the next follow-up.`);
  if (ctx.record.negotiation) lines.push(`Open offer: ${formatEUR(ctx.record.negotiation.offerEur)} from ${ctx.record.negotiation.counterparty} against ${formatEUR(ctx.record.negotiation.claimEur)} claimed. The manager decides: accept or counter.`);
  if (s.startsWith("closed")) lines.push(`The case is closed${ctx.record.outcome?.recoveredEur != null ? `: ${formatEUR(ctx.record.outcome.recoveredEur)} recovered` : ""}.`);
  if (lines.length === 1) lines.push("Nothing is waiting on you right now: Kelvin is waiting for the counterparty's reply.");
  return { text: lines.join("\n"), citationIds: [] };
}

export function documentsList(ctx: ChatContext): Answer {
  if (!ctx.documents.length) return { text: "No documents on this case yet.", citationIds: [] };
  const lines = [`${ctx.documents.length} documents in the case file:`];
  ctx.documents.forEach((d) => lines.push(`- ${d.title} (${d.kind.replace(/_/g, " ")}${d.pages ? `, ${d.pages} p.` : ""})`));
  lines.push("Open them from Records → Case file, or click a source chip in any answer.");
  return { text: lines.join("\n"), citationIds: [] };
}

/** Re-runs the rules engine with changed facts and compares with the current result. */
export function whatIf(ctx: ChatContext, w: WhatIf): Answer {
  const pending = notAnalysed(ctx);
  if (pending) return pending;
  const changes: string[] = [];
  if (w.declaredValueEur !== undefined) changes.push(w.declaredValueEur == null ? "no declared value (NVD)" : `a declared value of ${formatEUR(w.declaredValueEur)}`);
  if (w.weightKg !== undefined) changes.push(`a weight of ${formatKg(w.weightKg)}`);
  if (w.valueEur !== undefined) changes.push(`goods worth ${formatEUR(w.valueEur)}`);
  if (w.daysLater !== undefined) changes.push(`handling the claim ${w.daysLater} days later`);
  if (!changes.length) {
    return {
      text: "Tell me what to change, for example:\n- What if the declared value were €200,000?\n- What if the shipment weighed 500 kg?\n- What if we handled it 10 days later?\n- What if the goods were worth €80,000?",
      citationIds: [],
    };
  }
  if (noClaim(ctx)) {
    // No product was lost: no value, weight or date changes that. (The stored ranking "assuming QA rejects" is stale.)
    return {
      text: `The product is still usable, so there is no loss to recover: with ${changes.join(" and ")} there would still be **no claim**. Only a damaged product creates a claim.`,
      citationIds: [],
    };
  }
  let input: LiabilityInput;
  let dl: Deadline[];
  let ranked: RankedRoute[];
  try {
    const base = liabilityInput(ctx.record, ctx.row, ctx.qa.status);
    input = {
      ...base,
      ...(w.declaredValueEur !== undefined ? { declaredValueEur: w.declaredValueEur } : {}),
      ...(w.weightKg !== undefined ? { weightKg: w.weightKg } : {}),
      ...(w.valueEur !== undefined ? { lossEur: w.valueEur } : {}),
    };
    const now = new Date(ctx.now.getTime() + (w.daysLater ?? 0) * 86_400_000);
    dl = computeDeadlines({ ...deadlineInput(ctx.record, ctx.row, ctx.now), now }, ctx.rules);
    ranked = rankRoutes(computeLiability(input, ctx.rules), dl, input, ctx.rules);
  } catch {
    return { text: "The analysis is not complete enough to simulate changes yet.", citationIds: [] };
  }
  const plan = buildClaimPlan(ranked, { custodyAtExcursion: input.custodyAtExcursion, lossEur: totalLossEur(input) });

  const before = ctx.record.ranking ?? [];
  const beforeTop = before.find((r) => r.recommended && r.recoverableEur > 0) ?? null;
  const afterTop = ranked.find((r) => r.recommended && r.recoverableEur > 0) ?? null;
  const fmtTop = (r: RankedRoute | null) => (r ? `**${label(r.route)}**, ${formatEUR(r.recoverableEur)}` : "**no claim**");
  const lines = [`With ${changes.join(" and ")}, the rules give:`];
  for (const r of ranked) {
    const was = before.find((b) => b.route === r.route);
    const delta = was && Math.round(was.recoverableEur) !== Math.round(r.recoverableEur) ? ` (currently ${formatEUR(was.recoverableEur)})` : "";
    const blocked = r.blockers[0] ? `. ${r.blockers[0]}` : "";
    lines.push(`- ${ROUTE_META[r.route].label}: ${formatEUR(r.recoverableEur)}${delta}, ${trimDot(r.basis)}${blocked ? `${trimDot(blocked)}.` : "."}`);
  }
  const sameRoute = beforeTop?.route === afterTop?.route;
  const sameAmount = Math.round(beforeTop?.recoverableEur ?? 0) === Math.round(afterTop?.recoverableEur ?? 0);
  if (sameRoute && sameAmount) lines.push(`The recommendation does not change: ${fmtTop(afterTop)}.`);
  else if (sameRoute && afterTop && beforeTop) lines.push(`Same payer, **${label(afterTop.route)}**, but the amount changes: ${formatEUR(beforeTop.recoverableEur)} → **${formatEUR(afterTop.recoverableEur)}**.`);
  else lines.push(`The recommendation changes: ${fmtTop(beforeTop)} → ${fmtTop(afterTop)}.`);
  const secondary = plan.find((p) => p.role === "secondary");
  if (secondary) lines.push(`Secondary claim: ${label(secondary.route)} ${formatEUR(secondary.amountEur)}.`);
  if (w.daysLater) {
    const lapsed = dl.filter((d) => d.kind === "notice" && d.status === "overdue").map((d) => d.label);
    if (lapsed.length) lines.push(`By then these notices would have lapsed: ${lapsed.join("; ")}.`);
  }
  lines.push("This is a simulation: the case itself is unchanged.");
  return { text: lines.join("\n"), citationIds: [] };
}

/** The chat cannot act: it says who does it, and where, then what is pending. */
export function actionRequest(ctx: ChatContext): Answer {
  const pending = nextAction(ctx);
  return {
    text: [
      "I can't do that: Ask Kelvin only reads and explains, it never drafts, approves or sends.",
      "- Kelvin's analysis drafts the letters and notices by itself.",
      "- The claims manager (Tom Becker) approves or rejects each one on its approval screen (Next action → Review and approve).",
      "- Once approved, Kelvin sends it through the Outbox and follows up on the reply.",
      pending.text,
    ].join("\n"),
    citationIds: [],
  };
}

export function help(): Answer {
  return {
    text:
      "I answer from this case's documents and Kelvin's rules. Try:\n- Why this payer?\n- What are the deadlines?\n- Who held the cargo when it warmed up?\n- Is the product still usable?\n- What should I do next?\n- What if the declared value were €200,000?\n- Summarize the case",
    citationIds: [],
  };
}

export function answer(ctx: ChatContext, intent: Intent, w: WhatIf = {}): Answer {
  switch (intent) {
    case "summary":
      return summary(ctx);
    case "why_payer":
      return whyPayer(ctx);
    case "deadlines":
      return deadlines(ctx);
    case "custody":
      return custody(ctx);
    case "quality":
      return quality(ctx);
    case "next_action":
      return nextAction(ctx);
    case "documents":
      return documentsList(ctx);
    case "what_if":
      return whatIf(ctx, w);
    case "action":
      return actionRequest(ctx);
    default:
      return help();
  }
}
