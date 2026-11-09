import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { drafts } from "@/lib/db/schema";
import { getPersona } from "@/lib/domain/personas";
import { RECOVERY_ROUTES } from "@/lib/domain/parties";
import { formatDate, formatEUR } from "@/lib/format";
import { getRecord, patchRecord, registerCitations } from "@/lib/case/record";
import { PROTECTIVE_NOTICE_ALLOWED } from "@/lib/case/status-machine";
import { getCaseRow, qaStatus } from "../assess";
import { findDocument } from "../docs";
import { claimLetter, protectiveNotice, validateLetter } from "../letters";
import { resolveCounterparty } from "../parties";
import { defineTool, ToolGuardError } from "../tool";

const SIGNER = getPersona("tom");

const bodyInput = {
  subject: z.string().optional().describe("Optional subject you wrote yourself"),
  body: z
    .string()
    .optional()
    .describe("Optional letter body you wrote yourself. Cite every factual sentence with registry ids like [S3]. Omit to use Kelvin's template."),
};

/* =================================================== draft_protective_notice */

export const draftProtectiveNotice = defineTool({
  name: "draft_protective_notice",
  description:
    "Draft a short notice that reserves the right to claim, addressed to the right party, when a deadline is close and QA has not decided. It is never sent without manager approval.",
  input: z.object({ route: z.enum(RECOVERY_ROUTES), ...bodyInput }),
  async run({ route, subject, body }, ctx) {
    const [row, record, qa] = await Promise.all([getCaseRow(ctx.db, ctx.caseId), getRecord(ctx.db, ctx.caseId), qaStatus(ctx.db, ctx.caseId)]);
    if (!PROTECTIVE_NOTICE_ALLOWED.includes(row.status)) throw new ToolGuardError(`Protective notices are only allowed while investigating or awaiting QA (case is ${row.status}).`);
    if (qa.status !== "pending") throw new ToolGuardError("QA has already decided: draft the claim letter (or close the case) instead.");
    const existing = await ctx.db
      .select({ id: drafts.id })
      .from(drafts)
      .where(and(eq(drafts.caseId, ctx.caseId), eq(drafts.kind, "protective_notice"), eq(drafts.route, route)));
    if (existing.length) throw new ToolGuardError(`A protective notice to the ${route} already exists (${existing[0].id}).`);

    const to = await resolveCounterparty(ctx.db, ctx.caseId, route);
    const toCitations = to.source ? await registerCitations(ctx.db, ctx.caseId, [to.source]) : [];
    const deadline = record.deadlines?.find((d) => d.route === route && d.kind === "notice") ?? null;
    const template = protectiveNotice({ record, row, to, signer: SIGNER, today: ctx.now, route, deadline });
    const finalBody = body ?? template.body;
    const fresh = await getRecord(ctx.db, ctx.caseId);
    const check = validateLetter(finalBody, fresh.citations ?? {});
    if (check.unknown.length) throw new ToolGuardError(`Unknown citation ids ${check.unknown.join(", ")}: only cite ids returned by tools.`);

    const id = `dr-${nanoid(8)}`;
    await ctx.db.insert(drafts).values({
      id,
      caseId: ctx.caseId,
      kind: "protective_notice",
      route,
      recipientName: to.name,
      recipientEmail: to.email,
      subject: subject ?? template.subject,
      body: finalBody,
      citations: [...check.used, ...toCitations, ...check.assumptions],
      annexes: ["Data logger extract", "Air waybill"],
      status: "awaiting_approval",
    });
    await patchRecord(ctx.db, ctx.caseId, {
      protectiveNotices: [...(fresh.protectiveNotices ?? []), { route, draftId: id, deadlineId: deadline?.id ?? "" }],
    });
    return {
      output: { draftId: id, route, to: { name: to.name, email: to.email, assumed: to.assumed }, subject: subject ?? template.subject, status: "awaiting_approval", deadline, citationCoverage: check.coverage, assumptions: check.uncited },
      summary: `Protective notice to ${to.name} drafted${deadline ? `, due ${formatDate(deadline.dueAt)} (${deadline.daysLeft} days left)` : ""}. Waiting for manager approval.`,
      citations: [...check.used, ...toCitations, ...check.assumptions],
    };
  },
});

/* ======================================================== draft_claim_letter */

export const draftClaimLetter = defineTool({
  name: "draft_claim_letter",
  description:
    "Draft the full claim letter for a route (defaults to the recommended one): amount, facts, clauses, citations and annex list. Only after QA has rejected the batch.",
  input: z.object({ route: z.enum(RECOVERY_ROUTES).optional(), ...bodyInput }),
  async run({ route, subject, body }, ctx) {
    const [row, record, qa] = await Promise.all([getCaseRow(ctx.db, ctx.caseId), getRecord(ctx.db, ctx.caseId), qaStatus(ctx.db, ctx.caseId)]);
    if (qa.status !== "rejected") throw new ToolGuardError(qa.status === "pending" ? "QA has not decided yet: a claim letter needs a rejected batch." : "QA released the product: there is no damage to claim.");
    if (!record.ranking) throw new ToolGuardError("Run rank_routes first (after the QA decision).");
    const chosen = record.ranking.find((r) => (route ? r.route === route : r.recommended));
    if (!chosen || chosen.recoverableEur <= 0) throw new ToolGuardError(`No recoverable amount on the ${route ?? "recommended"} route.`);

    const [qaCit] = await registerCitations(ctx.db, ctx.caseId, [
      {
        kind: "record",
        label: `QA decision ${qa.at ? formatDate(qa.at) : ""}`.trim(),
        title: `Quality disposition: rejected by ${qa.by}${qa.note ? `. Note: ${qa.note}` : ""}`,
        quote: qa.note ?? "Batch rejected",
      },
    ]);
    const to = await resolveCounterparty(ctx.db, ctx.caseId, chosen.route);
    const toCitations = to.source ? await registerCitations(ctx.db, ctx.caseId, [to.source]) : [];
    const fresh = await getRecord(ctx.db, ctx.caseId);
    const template = claimLetter({ record: fresh, row, to, signer: SIGNER, today: ctx.now, route: chosen, qaCitationId: qaCit.id });
    const finalBody = body ?? template.body;
    const check = validateLetter(finalBody, fresh.citations ?? {});
    if (check.unknown.length) throw new ToolGuardError(`Unknown citation ids ${check.unknown.join(", ")}: only cite ids returned by tools.`);

    // Replace an earlier unsent claim draft (e.g. after a manager rejection).
    await ctx.db
      .update(drafts)
      .set({ status: "rejected" })
      .where(and(eq(drafts.caseId, ctx.caseId), eq(drafts.kind, "claim_letter"), eq(drafts.status, "draft")));
    const id = `dr-${nanoid(8)}`;
    await ctx.db.insert(drafts).values({
      id,
      caseId: ctx.caseId,
      kind: "claim_letter",
      route: chosen.route,
      recipientName: to.name,
      recipientEmail: to.email,
      subject: subject ?? template.subject,
      body: finalBody,
      amountEur: chosen.recoverableEur,
      citations: [...check.used, ...toCitations, ...check.assumptions],
      annexes: template.annexes,
      status: "draft",
    });
    await patchRecord(ctx.db, ctx.caseId, { claim: { draftId: id, route: chosen.route, amountEur: chosen.recoverableEur } });
    return {
      output: { draftId: id, route: chosen.route, amountEur: chosen.recoverableEur, to: { name: to.name, email: to.email }, subject: subject ?? template.subject, citationCoverage: check.coverage, assumptions: check.uncited, annexes: template.annexes },
      summary: `Claim letter to ${to.name} for ${formatEUR(chosen.recoverableEur)} drafted with ${check.used.length} citations${check.uncited.length ? ` and ${check.uncited.length} flagged assumption(s)` : ", every statement sourced"}.`,
      citations: [...check.used, ...toCitations, ...check.assumptions],
    };
  },
});

/* ===================================================== request_missing_info */

export const requestMissingInfo = defineTool({
  name: "request_missing_info",
  description:
    "List what is missing to assess or prove the claim (e.g. commercial invoice for the value, custody records, contract, policy) and draft the requests. Returns an empty list when the file is complete.",
  input: z.object({}),
  async run(_input, ctx) {
    const [row, record] = await Promise.all([getCaseRow(ctx.db, ctx.caseId), getRecord(ctx.db, ctx.caseId)]);
    const need: { kind: Parameters<typeof findDocument>[2]; item: string; why: string; from: string; email: string }[] = [
      { kind: "logger", item: "Temperature logger data (CSV)", why: "to establish the excursion", from: "Consignee QA", email: "qa@consignee.example" },
      { kind: "awb", item: "Air waybill", why: "for weight, declared value and the carrier's identity", from: "Forwarder", email: "ops@forwarder.example" },
      { kind: "invoice", item: "Commercial invoice", why: "to prove the value of the goods", from: "Shipper finance", email: "finance@shipper.example" },
      { kind: "handling_events", item: "Custody and handling records", why: "to show who held the cargo when it got warm", from: "Forwarder", email: "ops@forwarder.example" },
      { kind: "contract", item: "Forwarder contract", why: "for duties, liability cap and notice period", from: "Shipper legal", email: "legal@shipper.example" },
      { kind: "policy", item: "Cargo insurance policy", why: "for cover, deductible and notice period", from: "Shipper insurance", email: "insurance@shipper.example" },
    ];
    const missing = [];
    for (const n of need) if (!(await findDocument(ctx.db, ctx.caseId, n.kind))) missing.push(n);

    const created: string[] = [];
    for (const m of missing) {
      const id = `dr-${nanoid(8)}`;
      created.push(id);
      await ctx.db.insert(drafts).values({
        id,
        caseId: ctx.caseId,
        kind: "info_request",
        recipientName: m.from,
        recipientEmail: m.email,
        subject: `Information needed for shipment ${row.shipmentRef}: ${m.item.toLowerCase()}`,
        body: `Hello,\n\nfor the temperature excursion on shipment ${row.shipmentRef} we need the ${m.item.toLowerCase()} ${m.why}. Please send it as soon as possible: notice deadlines are running.\n\nThank you,\n${SIGNER.name}\n${SIGNER.title}`,
        status: "awaiting_approval",
      });
    }
    await patchRecord(ctx.db, ctx.caseId, { missing: missing.map((m) => ({ item: m.item, why: m.why, requestedFrom: m.from })) });
    const qa = await qaStatus(ctx.db, ctx.caseId);
    return {
      output: {
        missing: missing.map((m, i) => ({ item: m.item, why: m.why, requestFrom: m.from, draftId: created[i] })),
        pendingHumanDecisions: qa.status === "pending" ? ["QA disposition (Released / Rejected) by Quality Assurance"] : [],
        valueSource: record.shipment?.valueSource ?? null,
      },
      summary: missing.length
        ? `Missing: ${missing.map((m) => m.item.toLowerCase()).join(", ")}. ${missing.length} request(s) drafted for approval.`
        : `Document set complete.${qa.status === "pending" ? " Waiting only for the QA disposition." : ""}`,
    };
  },
});

