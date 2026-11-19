import { and, eq } from "drizzle-orm";
import { drafts, outboxMessages } from "@/lib/db/schema";
import { ROUTE_META, type RecoveryRoute } from "@/lib/domain/parties";
import { formatEUR } from "@/lib/format";
import { getRecord } from "@/lib/case/record";
import { findDocuments } from "./docs";
import type { RunKind } from "./events";
import { executeTool, type AgentContext } from "./tool";
import { getTool } from "./tools";
import { reminderState } from "./tools/followup";

/**
 * Deterministic planner: the same tools, called in a fixed order with scripted
 * narration. Used when no model key is configured, for evaluation baselines,
 * and as the fallback if the live model fails mid-demo.
 */
export async function runScript(kind: RunKind, ctx: AgentContext, say: (text: string) => void) {
  const call = async (name: string, input: Record<string, unknown> = {}) => executeTool(getTool(name), input, ctx);

  if (kind === "investigate") {
    say("Reading the temperature logger.");
    const log = await call("parse_logger");
    if (!log.ok) return say(`Logger file unreadable: ${log.error}`);
    const record = await getRecord(ctx.db, ctx.caseId);
    if (!record.excursions?.length) {
      say("All readings within 2–8 °C. No excursion, no claim.");
      return;
    }
    say("Reading the air waybill (weight, declared value) and the invoice (goods value).");
    await call("extract_document", { kind: "awb" });
    await call("extract_document", { kind: "invoice" });
    const emails = await findDocuments(ctx.db, ctx.caseId, "email");
    if (emails.length) {
      say("Reading the emails.");
      await call("extract_document", { kind: "email" });
    }
    say("Matching the excursion to the custody timeline.");
    await call("build_custody_timeline");
    say("Checking the forwarder contract: temperature duties, liability cap, notice period.");
    await call("check_contract");
    say("Checking the cargo policy: cover, exclusions, deductible, notice period.");
    await call("check_policy");
    say("Applying liability limits per route.");
    await call("compute_liability");
    say("Computing deadlines.");
    await call("compute_deadlines");
    say("Ranking recovery routes by expected recoverable amount.");
    const rank = await call("rank_routes");
    const needs = rank.ok ? ((rank.output as { protectiveNoticesNeeded: { route: RecoveryRoute; daysLeft: number }[] }).protectiveNoticesNeeded ?? []) : [];
    for (const n of needs) {
      say(`The ${ROUTE_META[n.route].label.toLowerCase()} notice is due in ${n.daysLeft} days and QA has not decided. Drafting a protective notice.`);
      await call("draft_protective_notice", { route: n.route });
    }
    say("Checking the file for missing documents.");
    await call("request_missing_info");
    say("Quality check: peak temperature and minutes out of range against the stability data.");
    const qa = await call("assess_quality");
    if (!qa.ok) return say(`Quality check failed: ${qa.error}`);
    const final = await getRecord(ctx.db, ctx.caseId);
    const top = final.ranking?.find((r) => r.recommended);
    const attr = final.custody?.attribution;
    const verdict = final.qaAssessment?.verdict;
    const next =
      verdict === "usable"
        ? "Product usable: no damage, case closed with no claim."
        : verdict === "damaged"
          ? "Product damaged: claim goes to the manager for approval."
          : "Excursion close to the stability limit: QA decides.";
    say(
      `${attr ? `Custodian during the excursion: ${attr.custodian}. ` : ""}${verdict !== "usable" && top ? `Recommended route: ${ROUTE_META[top.route].label.toLowerCase()}, ${formatEUR(top.recoverableEur)}. ` : ""}${needs.length ? `Protective notice awaiting approval. ` : ""}${next}`,
    );
    return;
  }

  if (kind === "prepare_claim") {
    say("Product damaged. Re-ranking routes and building the claim plan.");
    await call("rank_routes");
    say("Drafting the claim letter for the recommended route.");
    const letter = await call("draft_claim_letter");
    if (!letter.ok) return say(`Claim letter not drafted: ${letter.error}`);
    const plan = (await getRecord(ctx.db, ctx.caseId)).claimPlan ?? [];
    for (const s of plan.filter((p) => p.role === "secondary")) {
      say(`The ${ROUTE_META[s.route].label.toLowerCase()} is liable for the uninsured part. Drafting a secondary claim for ${formatEUR(s.amountEur)}.`);
      await call("draft_claim_letter", { route: s.route });
    }
    say("Building the evidence pack: chart, logger extract, cited pages.");
    await call("build_evidence_pack");
    const out = letter.output as { amountEur: number; to: { name: string } };
    say(`Claim ready: ${formatEUR(out.amountEur)} to ${out.to.name}. Awaiting manager approval.`);
    return;
  }

  if (kind === "close") {
    say("QA released the product. Checking every route.");
    await call("compute_liability");
    await call("rank_routes");
    say("No damage, no claim. Case closed; reason recorded in the audit trail.");
    return;
  }

  if (kind === "follow_up") {
    const approved = await ctx.db
      .select()
      .from(drafts)
      .where(and(eq(drafts.caseId, ctx.caseId), eq(drafts.status, "approved")));
    // The primary claim letter goes first: a secondary claim (claim plan) is only sent after it.
    const primaryId = (await getRecord(ctx.db, ctx.caseId)).claim?.draftId;
    approved.sort((a, b) => Number(b.id === primaryId) - Number(a.id === primaryId));
    for (const d of approved) {
      say(`Sending the approved ${d.kind.replace(/_/g, " ")} to ${d.recipientName}.`);
      await call("send_via_outbox", { draftId: d.id });
    }
    const record = await getRecord(ctx.db, ctx.caseId);
    const handled = new Set(record.handledMessageIds ?? []);
    const replies = await ctx.db
      .select()
      .from(outboxMessages)
      .where(and(eq(outboxMessages.caseId, ctx.caseId), eq(outboxMessages.direction, "in")));
    for (const m of replies.filter((r) => !handled.has(r.id))) {
      say(`Reply from ${m.counterparty}. Proposing the next step.`);
      await call("handle_reply", { messageId: m.id });
    }
    const st = await reminderState(ctx);
    if (st?.due.length) {
      say(`No reply to the claim for ${Math.max(...st.due)} days. Drafting a reminder.`);
      await call("draft_reminder");
    } else if (!approved.length && replies.every((r) => handled.has(r.id))) say("Nothing to send and no new replies.");
  }
}
