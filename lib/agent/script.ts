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
    say("Reading the temperature logger to see what actually happened.");
    const log = await call("parse_logger");
    if (!log.ok) return say(`I could not read the logger: ${log.error}`);
    const record = await getRecord(ctx.db, ctx.caseId);
    if (!record.excursions?.length) {
      say("Every reading stayed within 2–8 °C, so there is no excursion and nothing to investigate.");
      return;
    }
    say("Reading the air waybill for weight and declared value, and the invoice for the value of the goods.");
    await call("extract_document", { kind: "awb" });
    await call("extract_document", { kind: "invoice" });
    const emails = await findDocuments(ctx.db, ctx.caseId, "email");
    if (emails.length) {
      say("Skimming the correspondence for context.");
      await call("extract_document", { kind: "email" });
    }
    say("Matching the excursion to the custody timeline to see who held the cargo when it got warm.");
    await call("build_custody_timeline");
    say("Checking the forwarder contract for temperature duties, liability caps and notice periods.");
    await call("check_contract");
    say("Checking the cargo policy for cover, exclusions, deductible and notice period.");
    await call("check_policy");
    say("Applying the liability limits per route.");
    await call("compute_liability");
    say("Working out every deadline and how many days are left.");
    await call("compute_deadlines");
    say("Ranking the recovery routes by expected recoverable amount.");
    const rank = await call("rank_routes");
    const needs = rank.ok ? ((rank.output as { protectiveNoticesNeeded: { route: RecoveryRoute; daysLeft: number }[] }).protectiveNoticesNeeded ?? []) : [];
    for (const n of needs) {
      say(`The ${ROUTE_META[n.route].label.toLowerCase()} notice deadline is ${n.daysLeft} days away and QA has not decided, so I am drafting a protective notice to reserve our rights.`);
      await call("draft_protective_notice", { route: n.route });
    }
    say("Checking whether anything is missing from the file.");
    await call("request_missing_info");
    say("Handing the measured excursion to the quality agent: it compares peak temperature and minutes out of range with the manufacturer's stability data.");
    const qa = await call("assess_quality");
    if (!qa.ok) return say(`The quality assessment could not be completed: ${qa.error}`);
    const final = await getRecord(ctx.db, ctx.caseId);
    const top = final.ranking?.find((r) => r.recommended);
    const attr = final.custody?.attribution;
    const verdict = final.qaAssessment?.verdict;
    const next =
      verdict === "usable"
        ? "The quality agent found the product usable, so there is no damage and the case is closed with no claim."
        : verdict === "damaged"
          ? "The quality agent found the product damaged, so I prepare the claim for manager approval."
          : "The excursion is close to the stability limit, so a human QA must decide whether the product is usable.";
    say(
      `${attr ? `The excursion happened while ${attr.custodian} held the cargo. ` : ""}${verdict !== "usable" && top ? `The best route is the ${ROUTE_META[top.route].label.toLowerCase()} for ${formatEUR(top.recoverableEur)}. ` : ""}${needs.length ? `A protective notice is ready for approval. ` : ""}${next}`,
    );
    return;
  }

  if (kind === "prepare_claim") {
    say("The product is confirmed damaged, so I am re-ranking the routes and building the claim plan.");
    await call("rank_routes");
    say("Drafting the claim letter for the recommended route, citing every statement.");
    const letter = await call("draft_claim_letter");
    if (!letter.ok) return say(`I could not draft the claim: ${letter.error}`);
    const plan = (await getRecord(ctx.db, ctx.caseId)).claimPlan ?? [];
    for (const s of plan.filter((p) => p.role === "secondary")) {
      say(`The ${ROUTE_META[s.route].label.toLowerCase()} held the cargo and is liable for the part the insurance does not cover, so I am drafting a secondary claim for ${formatEUR(s.amountEur)}.`);
      await call("draft_claim_letter", { route: s.route });
    }
    say("Building the evidence pack with the chart, logger extract and cited pages.");
    await call("build_evidence_pack");
    const out = letter.output as { amountEur: number; to: { name: string } };
    say(`The claim for ${formatEUR(out.amountEur)} to ${out.to.name} is ready. A manager must approve it before anything is sent.`);
    return;
  }

  if (kind === "close") {
    say("QA released the product. Confirming there is nothing to recover on any route.");
    await call("compute_liability");
    await call("rank_routes");
    say("No damage means no claim on any route. Closing the case with the reason recorded for audit.");
    return;
  }

  if (kind === "follow_up") {
    const approved = await ctx.db
      .select()
      .from(drafts)
      .where(and(eq(drafts.caseId, ctx.caseId), eq(drafts.status, "approved")));
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
      say(`Reading the reply from ${m.counterparty} and proposing the next step.`);
      await call("handle_reply", { messageId: m.id });
    }
    const st = await reminderState(ctx);
    if (st?.due.length) {
      say(`No reply to the claim for ${Math.max(...st.due)} days, so I am drafting a reminder for approval.`);
      await call("draft_reminder");
    } else if (!approved.length && replies.every((r) => handled.has(r.id))) say("Nothing to send and no new replies.");
  }
}
