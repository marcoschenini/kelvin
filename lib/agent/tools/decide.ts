import { eq } from "drizzle-orm";
import { z } from "zod";
import { cases } from "@/lib/db/schema";
import type { Citation } from "@/lib/domain/citation";
import { ROUTE_META } from "@/lib/domain/parties";
import { formatDate, formatEUR } from "@/lib/format";
import { getRecord, patchRecord } from "@/lib/case/record";
import { computeDeadlines, nearestOpenDeadline } from "@/lib/rules/deadlines";
import { protectiveNoticesNeeded } from "@/lib/rules/early-notice";
import { computeLiability } from "@/lib/rules/liability";
import { rankRoutes } from "@/lib/rules/ranking";
import { deadlineInput, getCaseRow, liabilityInput, qaStatus } from "../assess";
import { defineTool, ToolGuardError } from "../tool";

const cite = (reg: Record<string, Citation> | undefined, ...ids: (string | undefined)[]) =>
  ids.filter((id): id is string => !!id && !!reg?.[id]).map((id) => reg![id]);

/* ========================================================= compute_liability */

export const computeLiabilityTool = defineTool({
  name: "compute_liability",
  description:
    "Apply the caps: Montreal 26 SDR/kg × weight (or declared value), the forwarder contract cap, and insured value minus deductible. Returns recoverable € per route with the working and blockers. Uses the QA decision if one exists.",
  input: z.object({}),
  async run(_input, ctx) {
    const [record, row, qa] = await Promise.all([getRecord(ctx.db, ctx.caseId), getCaseRow(ctx.db, ctx.caseId), qaStatus(ctx.db, ctx.caseId)]);
    const input = liabilityInput(record, row, qa.status);
    const liability = computeLiability(input, ctx.rules);
    await patchRecord(ctx.db, ctx.caseId, { liability });
    const reg = record.citations;
    const c = record.contract?.clauses ?? {};
    const p = record.policy?.clauses ?? {};
    const citations = [
      ...cite(reg, record.shipment?.citations?.awb, record.shipment?.citations?.invoice),
      ...cite(reg, c.liability_cap?.citationId, c.air_carriers?.citationId, c.liability_basis?.citationId),
      ...cite(reg, p.temperature_cover?.citationId, p.minimum_duration?.citationId, p.settlement?.citationId, p.deductible?.citationId),
    ];
    const by = Object.fromEntries(liability.map((l) => [l.route, l]));
    return {
      output: {
        qa: qa.status,
        lossEur: input.lossEur,
        valueSource: record.shipment?.valueSource ?? "case",
        routes: liability,
        sdr: ctx.rules.sdr,
      },
      summary: `Recoverable if successful: carrier ${formatEUR(by.carrier.recoverableEur)}, forwarder ${formatEUR(by.forwarder.recoverableEur)}, insurer ${formatEUR(by.insurer.recoverableEur)}${qa.status === "pending" ? " (assuming QA rejects)" : ""}.`,
      citations,
    };
  },
});

/* ========================================================= compute_deadlines */

export const computeDeadlinesTool = defineTool({
  name: "compute_deadlines",
  description:
    "Compute every deadline with its date and days left: Montreal Art. 31 notice (14 days from receipt) and Art. 35 time bar, the contract notice and time bar, and the policy notification period.",
  input: z.object({}),
  async run(_input, ctx) {
    const [record, row] = await Promise.all([getRecord(ctx.db, ctx.caseId), getCaseRow(ctx.db, ctx.caseId)]);
    const deadlines = computeDeadlines(deadlineInput(record, row, ctx.now), ctx.rules);
    await patchRecord(ctx.db, ctx.caseId, { deadlines });
    const nearest = nearestOpenDeadline(deadlines);
    await ctx.db
      .update(cases)
      .set({
        nearestDeadlineAt: nearest ? new Date(nearest.dueAt) : null,
        nearestDeadlineLabel: nearest?.label ?? null,
        nearestDeadlineWindowDays: nearest?.windowDays ?? null,
      })
      .where(eq(cases.id, ctx.caseId));
    const reg = record.citations;
    const citations = cite(reg, record.shipment?.citations?.awb, record.contract?.clauses.notice?.citationId, record.contract?.clauses.time_bar?.citationId, record.policy?.clauses.notification?.citationId);
    const notices = deadlines.filter((d) => d.kind === "notice");
    return {
      output: { now: ctx.now.toISOString(), deadlines },
      summary: notices
        .map((d) => `${ROUTE_META[d.route!].label} notice ${formatDate(d.dueAt)} (${d.daysLeft < 0 ? `${-d.daysLeft} days overdue` : `${d.daysLeft} days left`})`)
        .join("; "),
      citations,
    };
  },
});

/* =============================================================== rank_routes */

export const rankRoutesTool = defineTool({
  name: "rank_routes",
  description:
    "Rank carrier, forwarder and insurer by expected recoverable € (recoverable × probability), blocking routes whose notice lapsed. Also says which protective notices are needed before QA decides. Run after compute_liability and compute_deadlines.",
  input: z.object({}),
  async run(_input, ctx) {
    const [record, row, qa] = await Promise.all([getRecord(ctx.db, ctx.caseId), getCaseRow(ctx.db, ctx.caseId), qaStatus(ctx.db, ctx.caseId)]);
    if (!record.liability || !record.deadlines) throw new ToolGuardError("Run compute_liability and compute_deadlines first.");
    const input = liabilityInput(record, row, qa.status);
    // Recompute against the current QA status so a decision made since compute_liability is respected.
    const liability = computeLiability(input, ctx.rules);
    const ranked = rankRoutes(liability, record.deadlines, input, ctx.rules);
    const notices = protectiveNoticesNeeded(ranked, qa.status, ctx.rules);
    const top = ranked.find((r) => r.recommended) ?? null;
    const live = new Set(ranked.filter((r) => r.probability > 0 && r.recoverableEur > 0).map((r) => r.route));
    const nearest = nearestOpenDeadline(record.deadlines, live.size ? live : undefined);
    await patchRecord(ctx.db, ctx.caseId, { liability, ranking: ranked });
    await ctx.db
      .update(cases)
      .set({
        recommendedRoute: top?.route ?? null,
        claimAmountEur: top?.recoverableEur ?? null,
        nearestDeadlineAt: nearest ? new Date(nearest.dueAt) : null,
        nearestDeadlineLabel: nearest?.label ?? null,
        nearestDeadlineWindowDays: nearest?.windowDays ?? null,
      })
      .where(eq(cases.id, ctx.caseId));
    const reg = record.citations;
    const c = record.contract?.clauses ?? {};
    const p = record.policy?.clauses ?? {};
    const citations = cite(reg, ...(record.custody?.attribution?.citationIds ?? []), c.hub_storage?.citationId, c.notice?.citationId, p.temperature_cover?.citationId, p.preservation?.citationId);
    return {
      output: {
        qa: qa.status,
        ranking: ranked.map((r) => ({
          rank: r.rank,
          route: r.route,
          recommended: r.recommended,
          recoverableEur: r.recoverableEur,
          probability: r.probability,
          expectedEur: r.expectedEur,
          reasons: r.reasons,
          blockers: r.blockers,
          noticeDeadline: r.noticeDeadline ? { dueAt: r.noticeDeadline.dueAt, daysLeft: r.noticeDeadline.daysLeft } : null,
        })),
        protectiveNoticesNeeded: notices,
      },
      summary: top
        ? `Recommended: ${ROUTE_META[top.route].label.toLowerCase()} (${formatEUR(top.recoverableEur)}, ${Math.round(top.probability * 100)}% likely).${notices.length ? ` Protective notice needed to: ${notices.map((n) => ROUTE_META[n.route].label.toLowerCase()).join(", ")}.` : ""}`
        : qa.status === "released"
          ? "No route: QA released the product, so there is no damage to claim."
          : "No route with a realistic recovery.",
      citations,
    };
  },
});
