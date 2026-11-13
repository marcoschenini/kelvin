import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { decisions } from "@/lib/db/schema";
import { formatDate } from "@/lib/format";
import { recordAgentQaDecision } from "@/lib/case/gates";
import { getRecord, registerCitations } from "@/lib/case/record";
import { assessStability } from "@/lib/rules/stability";
import type { Citation } from "@/lib/domain/citation";
import type { StabilityAllowance } from "@/lib/rules/types";
import { getCaseRow } from "../assess";
import { findDocuments, docText, parseEml } from "../docs";
import { isStabilityEmail, parseStabilityAllowance } from "../stability-doc";
import { defineTool, ToolGuardError } from "../tool";

/**
 * The quality agent. It reads the manufacturer's stability data, lets the rules
 * engine compare it with the measured excursion, and records the verdict through
 * the gate: usable closes the case, damaged opens the claim path, unsure waits for
 * a human QA. The model never decides this itself; it only calls the tool.
 */
export const assessQuality = defineTool({
  name: "assess_quality",
  description:
    "Quality agent: compare the measured excursion (peak °C, minutes out of 2–8 °C) with the product's stability data from the manufacturer's email. Within the allowance → usable (case closes, no claim). Beyond it, or no stability data → damaged (claim path). Near the limit → unsure (a human QA decides). The decision is recorded with its reasoning. Run after parse_logger and the custody timeline; you cannot override the verdict.",
  input: z.object({}),
  async run(_input, ctx) {
    const [row, record] = await Promise.all([getCaseRow(ctx.db, ctx.caseId), getRecord(ctx.db, ctx.caseId)]);
    if (!record.excursions) throw new ToolGuardError("Run parse_logger first: the quality agent needs the measured excursion.");
    if (!record.excursions.length) throw new ToolGuardError("There is no excursion in the logger data: nothing for the quality agent to assess.");
    if (row.status !== "investigating") throw new ToolGuardError(`The quality agent can only assess while investigating (case is ${row.status}).`);
    const prior = await ctx.db.select({ id: decisions.id }).from(decisions).where(and(eq(decisions.caseId, ctx.caseId), eq(decisions.gate, "qa")));
    if (prior.length) throw new ToolGuardError("A QA decision already exists for this case.");

    // Stability data: the manufacturer's email, cited like any other source.
    let allowance: StabilityAllowance | null = null;
    let source: Citation | null = null;
    for (const doc of await findDocuments(ctx.db, ctx.caseId, "email")) {
      const e = parseEml(await docText(doc));
      if (!isStabilityEmail(e.subject)) continue;
      const parsed = parseStabilityAllowance(e.body);
      if (!parsed) continue;
      allowance = parsed.allowance;
      source = { kind: "email", documentId: doc.id, label: `Stability data ${formatDate(e.date)}`.trim(), title: `${e.from}: ${e.subject}`, quote: parsed.sentence.slice(0, 200) };
      break;
    }
    const [reg] = source ? await registerCitations(ctx.db, ctx.caseId, [source]) : [];

    const high = record.excursions.filter((x) => x.direction === "high");
    const peakC = high.length ? Math.max(...high.map((x) => x.peakC)) : null;
    const minutes = record.excursions.reduce((s, x) => s + x.minutes, 0);
    const assessment = assessStability({ peakC, minutesOutOfRange: minutes, allowance: allowance ? { ...allowance, citationHint: reg?.id } : null }, ctx.rules);

    await recordAgentQaDecision(ctx.db, ctx.caseId, assessment, { citationId: reg?.id, runId: ctx.runId });
    const after = await getCaseRow(ctx.db, ctx.caseId);
    if (after.status !== row.status) ctx.emit({ type: "status", from: row.status, to: after.status, reason: `Quality agent: ${assessment.verdict}` });

    const next = { usable: "The case closes with no claim.", damaged: "The claim path opens.", unsure: "A human QA must decide; the case waits." }[assessment.verdict];
    return {
      output: { verdict: assessment.verdict, basis: assessment.basis, peakC, minutesOutOfRange: minutes, allowance: assessment.allowance, reasons: assessment.reasons, citationId: reg?.id ?? null },
      summary: `Quality agent: ${assessment.verdict}. ${assessment.reasons.join(" ")} ${next}`,
      citations: reg ? [reg] : [],
    };
  },
});
