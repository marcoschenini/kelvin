import { eq } from "drizzle-orm";
import { z } from "zod";
import { cases } from "@/lib/db/schema";
import type { Citation } from "@/lib/domain/citation";
import type { CustodyParty } from "@/lib/domain/parties";
import { formatDateTime, formatDuration, formatEUR, formatTemp } from "@/lib/format";
import { getRecord, patchRecord, registerCitations, type ClauseRef, type CustodySegmentRecord, type ExcursionWindow } from "@/lib/case/record";
import type { ContractTermsParsed, ExtraCost, PolicyTermsParsed } from "@/lib/rules/types";
import { findClause, findPhrase, parseClauses, quoteOf, type Clause } from "../clauses";
import { docText, findDocument, findDocuments, getDocumentById, parseAwb, parseEml, parseInvoice, pdfPages } from "../docs";
import { isExtraCostsEmail, parseExtraCosts } from "../stability-doc";
import { defineTool, ToolGuardError } from "../tool";

const LOW = 2.0;
const HIGH = 8.0;

/* ============================================================ parse_logger */

export const parseLogger = defineTool({
  name: "parse_logger",
  description:
    "Read the temperature logger CSV and return every excursion window outside 2–8 °C (start, end, peak, minutes out of range, row numbers). Call this first.",
  input: z.object({ documentId: z.string().optional().describe("Logger document id; defaults to the case's logger file") }),
  async run({ documentId }, ctx) {
    const doc = documentId ? await getDocumentById(ctx.db, ctx.caseId, documentId) : await findDocument(ctx.db, ctx.caseId, "logger");
    if (!doc) throw new ToolGuardError("No logger file on this case. Ask for the logger data with request_missing_info.");
    const csv = await docText(doc);
    const loggerId = csv.match(/# Logger ID:\s*(\S+)/)?.[1] ?? null;
    const rows = csv
      .split(/\r?\n/)
      .filter((l) => /^\d+,/.test(l))
      .map((l) => {
        const [row, ts, t] = l.split(",");
        return { row: Number(row), at: new Date(ts), t: Number(t) };
      })
      .filter((r) => Number.isFinite(r.t) && !Number.isNaN(r.at.getTime()));
    if (rows.length < 2) throw new ToolGuardError("Logger file has no readable rows.");
    const intervalMin = Math.round((rows[1].at.getTime() - rows[0].at.getTime()) / 60_000);

    const windows: Omit<ExcursionWindow, "citationId" | "index">[] = [];
    let open: (typeof windows)[number] | null = null;
    for (const r of rows) {
      const dir = r.t > HIGH ? "high" : r.t < LOW ? "low" : null;
      if (dir && open && open.direction === dir) {
        open.end = r.at.toISOString();
        open.rowEnd = r.row;
        if ((dir === "high" && r.t > open.peakC) || (dir === "low" && r.t < open.peakC)) {
          open.peakC = r.t;
          open.peakAt = r.at.toISOString();
        }
      } else {
        if (open) windows.push(open);
        open = dir
          ? { direction: dir, start: r.at.toISOString(), end: r.at.toISOString(), minutes: 0, peakC: r.t, peakAt: r.at.toISOString(), rowStart: r.row, rowEnd: r.row }
          : null;
      }
    }
    if (open) windows.push(open);
    for (const w of windows) w.minutes = (w.rowEnd - w.rowStart + 1) * intervalMin;

    const citations: Citation[] = windows.map((w) => ({
      kind: "logger",
      documentId: doc.id,
      rows: [w.rowStart, w.rowEnd],
      label: `Logger r.${w.rowStart}–${w.rowEnd}`,
      title: `${doc.filename}: rows ${w.rowStart}–${w.rowEnd}, ${formatDateTime(w.start)}–${formatDateTime(w.end)} UTC, peak ${formatTemp(w.peakC)}`,
    }));
    const registered = await registerCitations(ctx.db, ctx.caseId, citations);
    const excursions: ExcursionWindow[] = windows.map((w, i) => ({ ...w, index: i, citationId: registered[i].id! }));
    const temps = rows.map((r) => r.t);
    await patchRecord(ctx.db, ctx.caseId, {
      logger: {
        documentId: doc.id,
        loggerId,
        intervalMin,
        rows: rows.length,
        minC: Math.min(...temps),
        maxC: Math.max(...temps),
        start: rows[0].at.toISOString(),
        end: rows[rows.length - 1].at.toISOString(),
      },
      excursions,
    });
    const main = excursions[0];
    return {
      output: {
        loggerId,
        intervalMin,
        readings: rows.length,
        range: { minC: Math.min(...temps), maxC: Math.max(...temps) },
        excursions: excursions.map((e) => ({ ...e, startUtc: e.start, endUtc: e.end, citation: e.citationId })),
      },
      summary: main
        ? `${excursions.length} excursion${excursions.length > 1 ? "s" : ""} in ${rows.length} readings: peak ${formatTemp(main.peakC)}, ${formatDuration(main.minutes)} above 8 °C (rows ${main.rowStart}–${main.rowEnd}).`
        : `No excursion: all ${rows.length} readings within 2–8 °C.`,
      citations: registered,
    };
  },
});

/* ========================================================= extract_document */

export const extractDocument = defineTool({
  name: "extract_document",
  description:
    "Read a case document. PDFs return text with page numbers; the air waybill and invoice also return parsed fields (weight, declared value, invoice total). Emails return headers and body. Use kind to pick a document, or documentId.",
  input: z.object({
    documentId: z.string().optional(),
    kind: z.enum(["awb", "invoice", "contract", "policy", "handling_report", "handling_events", "email"]).optional(),
  }),
  async run({ documentId, kind }, ctx) {
    if (!documentId && !kind) throw new ToolGuardError("Give a documentId or a kind.");
    const docs = documentId
      ? [await getDocumentById(ctx.db, ctx.caseId, documentId)].filter((d) => d !== null)
      : await findDocuments(ctx.db, ctx.caseId, kind);
    if (!docs.length) throw new ToolGuardError(`No ${kind ?? documentId} document on this case.`);

    const citations: Citation[] = [];
    const results = [];
    const record = await getRecord(ctx.db, ctx.caseId);
    const shipment = { ...(record.shipment ?? {}), citations: { ...(record.shipment?.citations ?? {}) } };
    const patchCase: Partial<typeof cases.$inferInsert> = {};
    const costLines: (ExtraCost & { line: string; doc: (typeof docs)[number]; email: ReturnType<typeof parseEml> })[] = [];

    for (const doc of docs) {
      if (doc.kind === "email") {
        const e = parseEml(await docText(doc));
        citations.push({ kind: "email", documentId: doc.id, label: `Email ${e.date.slice(5, 22)}`, title: `${e.from}: ${e.subject}`, quote: e.body.slice(0, 200) });
        results.push({ documentId: doc.id, kind: doc.kind, email: e });
        if (isExtraCostsEmail(e.subject)) {
          for (const c of parseExtraCosts(e.body)) costLines.push({ doc, email: e, ...c });
        }
        continue;
      }
      if (doc.kind === "handling_events" || doc.mime !== "application/pdf") {
        const text = await docText(doc);
        results.push({ documentId: doc.id, kind: doc.kind, text: text.slice(0, 12_000) });
        citations.push({ kind: "document", documentId: doc.id, label: doc.title.slice(0, 32), title: doc.title });
        continue;
      }
      const pages = await pdfPages(ctx.db, doc);
      const all = pages.map((p) => p.text).join("\n");
      const entry: Record<string, unknown> = { documentId: doc.id, kind: doc.kind, title: doc.title, pages };
      if (doc.kind === "awb") {
        const f = parseAwb(all);
        entry.fields = f;
        const c: Citation = { kind: "document", documentId: doc.id, page: 1, label: `AWB ${f.awbNumber ?? ""} p.1`.trim(), title: `Air waybill ${f.awbNumber}`, quote: f.declaredValueRaw ?? undefined };
        citations.push(c);
        Object.assign(shipment, {
          awbNumber: f.awbNumber ?? shipment.awbNumber,
          weightKg: f.grossWeightKg ?? shipment.weightKg,
          declaredValueEur: f.declaredValueEur,
          origin: f.origin ?? shipment.origin,
          destination: f.destination ?? shipment.destination,
          flight: f.flight ?? shipment.flight,
        });
        if (!shipment.valueEur && f.customsValueEur) {
          shipment.valueEur = f.customsValueEur;
          shipment.valueSource = "awb_customs";
        }
        Object.assign(patchCase, {
          awbNumber: f.awbNumber ?? undefined,
          weightKg: f.grossWeightKg ?? undefined,
          declaredValueEur: f.declaredValueEur,
          origin: f.origin ?? undefined,
          destination: f.destination ?? undefined,
        });
      } else if (doc.kind === "invoice") {
        const f = parseInvoice(all);
        entry.fields = f;
        citations.push({ kind: "document", documentId: doc.id, page: 1, label: `Invoice ${f.invoiceNo ?? ""} p.1`.trim(), title: `Commercial invoice ${f.invoiceNo}`, quote: f.quote ?? undefined });
        if (f.totalEur) {
          shipment.valueEur = f.totalEur;
          shipment.valueSource = "invoice";
          patchCase.valueEur = f.totalEur;
        }
      } else {
        citations.push({ kind: "document", documentId: doc.id, page: 1, label: `${doc.title.slice(0, 28)} p.1`, title: doc.title });
      }
      results.push(entry);
    }

    const registered = await registerCitations(ctx.db, ctx.caseId, citations);
    if (costLines.length) {
      // Eligible extra costs documented in the file: each line is its own citation.
      const costCites = await registerCitations(
        ctx.db,
        ctx.caseId,
        costLines.map((c) => ({ kind: "email" as const, documentId: c.doc.id, label: `Extra cost: ${c.label.slice(0, 24)}`, title: `${c.email.from}: ${c.email.subject}`, quote: c.line })),
      );
      await patchRecord(ctx.db, ctx.caseId, { extraCosts: costLines.map((c, i) => ({ label: c.label, eur: c.eur, citationHint: costCites[i].id })) });
      registered.push(...costCites);
    }
    const awbIdx = docs.findIndex((d) => d.kind === "awb");
    const invIdx = docs.findIndex((d) => d.kind === "invoice");
    if (awbIdx >= 0) shipment.citations.awb = registered[awbIdx].id!;
    if (invIdx >= 0) shipment.citations.invoice = registered[invIdx].id!;
    if (awbIdx >= 0 || invIdx >= 0) {
      await patchRecord(ctx.db, ctx.caseId, { shipment });
      const clean = Object.fromEntries(Object.entries(patchCase).filter(([, v]) => v !== undefined));
      if (Object.keys(clean).length) await ctx.db.update(cases).set(clean).where(eq(cases.id, ctx.caseId));
    }

    const first = results[0] as { kind: string; fields?: Record<string, unknown> };
    let summary = `Read ${docs.length} document${docs.length > 1 ? "s" : ""} (${docs.map((d) => d.kind).join(", ")}).`;
    if (first?.kind === "awb" && first.fields) {
      const f = first.fields as unknown as ReturnType<typeof parseAwb>;
      summary = `Air waybill ${f.awbNumber}: ${f.grossWeightKg} kg, ${f.pieces} pieces, declared value for carriage ${f.declaredValueRaw}.`;
    } else if (first?.kind === "invoice" && first.fields) {
      const f = first.fields as unknown as ReturnType<typeof parseInvoice>;
      summary = f.totalEur ? `Commercial invoice ${f.invoiceNo}: total ${formatEUR(f.totalEur)}.` : "Commercial invoice read; total not found.";
    } else if (first?.kind === "email") {
      summary = `Read ${docs.length} email${docs.length > 1 ? "s" : ""}.${costLines.length ? ` Documented extra costs: ${costLines.map((c) => `${c.label} ${formatEUR(c.eur)}`).join(", ")}.` : ""}`;
    }
    return {
      output: { documents: results.map((r, i) => ({ ...r, citation: registered[i]?.id })) },
      summary,
      citations: registered,
    };
  },
});

/* ==================================================== build_custody_timeline */

interface RawEvent {
  seq: number;
  from_utc: string;
  to_utc: string;
  custodian_role: CustodyParty;
  custodian: string;
  location: string;
  activity: string;
  temperature_controlled: boolean;
  reference: string | null;
}

export const buildCustodyTimeline = defineTool({
  name: "build_custody_timeline",
  description:
    "Merge the handling events (who held the cargo, from/to) with the excursion windows and assign each excursion to the party in custody. Requires parse_logger first.",
  input: z.object({}),
  async run(_input, ctx) {
    const record = await getRecord(ctx.db, ctx.caseId);
    if (!record.excursions) throw new ToolGuardError("Run parse_logger first: no excursion windows on the case record.");
    const doc = await findDocument(ctx.db, ctx.caseId, "handling_events");
    if (!doc) throw new ToolGuardError("No handling events on this case. Request custody records with request_missing_info.");
    const json = JSON.parse(await docText(doc)) as { events: RawEvent[] };
    const segments: CustodySegmentRecord[] = json.events.map((e) => ({
      seq: e.seq,
      role: e.custodian_role,
      custodian: e.custodian,
      location: e.location,
      activity: e.activity,
      from: e.from_utc,
      to: e.to_utc,
      controlled: e.temperature_controlled,
      reference: e.reference,
    }));
    const at = (iso: string) => segments.find((s) => s.from <= iso && iso < s.to) ?? null;

    const report = await findDocument(ctx.db, ctx.caseId, "handling_report");
    const citations: Citation[] = [];
    let attribution: NonNullable<typeof record.custody>["attribution"] = null;
    const main = record.excursions.find((e) => e.direction === "high") ?? record.excursions[0];
    if (main) {
      const seg = at(main.start);
      const endSeg = at(main.end);
      if (seg) {
        citations.push({
          kind: "document",
          documentId: doc.id,
          label: `Handling event #${seg.seq}`,
          title: `${seg.custodian}: ${seg.location}, ${formatDateTime(seg.from)}–${formatDateTime(seg.to)} UTC`,
          quote: seg.activity,
        });
        if (report) {
          const pages = await pdfPages(ctx.db, report);
          citations.push({ kind: "document", documentId: report.id, page: 1, label: `${report.title.slice(0, 24)} p.1`, title: report.title, quote: pages[0]?.text.split("\n").find((l) => /\d{4}-\d{2}-\d{2}/.test(l))?.slice(0, 160) });
        }
        attribution = {
          excursionIndex: main.index,
          role: seg.role,
          custodian: seg.custodian,
          segmentSeq: seg.seq,
          location: seg.location,
          activity: seg.activity,
          controlled: seg.controlled,
          spansMultipleParties: !!endSeg && endSeg.role !== seg.role,
          citationIds: [],
        };
      }
    }
    const registered = await registerCitations(ctx.db, ctx.caseId, citations);
    if (attribution) attribution.citationIds = [main!.citationId, ...registered.map((c) => c.id!)];

    const shipment = { ...(record.shipment ?? {}) };
    if (!shipment.deliveredAt && segments.length) shipment.deliveredAt = segments[segments.length - 1].to;
    await patchRecord(ctx.db, ctx.caseId, { custody: { segments, attribution }, shipment });
    if (shipment.deliveredAt) {
      const [row] = await ctx.db.select({ d: cases.deliveredAt }).from(cases).where(eq(cases.id, ctx.caseId));
      if (!row?.d) await ctx.db.update(cases).set({ deliveredAt: new Date(shipment.deliveredAt) }).where(eq(cases.id, ctx.caseId));
    }

    return {
      output: {
        segments: segments.map((s) => ({ seq: s.seq, role: s.role, custodian: s.custodian, location: s.location, from: s.from, to: s.to, controlled: s.controlled })),
        attribution,
      },
      summary: attribution
        ? `Excursion happened while ${attribution.custodian} (${attribution.role}) held the cargo: ${attribution.location}${attribution.controlled ? "" : ", not temperature controlled"}.`
        : main
          ? "Could not match the excursion to a custody segment."
          : `Custody rebuilt (${segments.length} segments); no excursion to attribute.`,
      citations: registered,
    };
  },
});

/* ============================================================ check_contract */

function clauseCitation(docId: string, ref: string, c: Clause): Citation {
  return {
    kind: "document",
    documentId: docId,
    page: c.page,
    label: `${ref} §${c.num} p.${c.page}`,
    title: `${ref} clause ${c.num}${c.title ? ` (${c.title})` : ""}`,
    quote: quoteOf(c),
  };
}

export const checkContract = defineTool({
  name: "check_contract",
  description:
    "Find the relevant clauses in the forwarder contract: temperature duties, hub storage, air-carrier pass-through, liability basis and cap, notice period and time bar. Returns quotes with page references and parsed terms.",
  input: z.object({}),
  async run(_input, ctx) {
    const doc = await findDocument(ctx.db, ctx.caseId, "contract");
    const empty: ContractTermsParsed = {
      found: false,
      coldRoomDuty: false,
      ambientLimitMinutes: null,
      liabilityCap: { kind: "unknown" },
      airLegPassThrough: false,
      noticeDays: null,
      timeBarYears: null,
    };
    if (!doc) {
      await patchRecord(ctx.db, ctx.caseId, { contract: { terms: empty, clauses: {}, documentId: null, reference: null } });
      return { output: { found: false, terms: empty }, summary: "No forwarder contract on file: forwarder route cannot be assessed." };
    }
    const pages = await pdfPages(ctx.db, doc);
    const all = pages.map((p) => p.text).join("\n");
    const reference = all.match(/Agreement ref\.\s*([\w-]+)/)?.[1] ?? doc.title;
    const short = "Contract";
    const clauses = parseClauses(pages);
    const pick = {
      temperature_duty: findClause(clauses, (c) => /keep the Goods within the Temperature Range|maintain.*Temperature Range/i.test(c.text)),
      hub_storage: findClause(clauses, (c) => /cold rooms?/i.test(c.text) && /hub|warehouse/i.test(c.text)),
      air_carriers: findClause(clauses, (c) => /carriage by air|air carriers?/i.test(`${c.title} ${c.text}`) && /liab/i.test(c.text)),
      excursion_reporting: findClause(clauses, (c) => /notify the Customer.*Excursion/i.test(c.text)),
      liability_basis: findClause(clauses, (c) => /is liable for loss of or damage/i.test(c.text)),
      liability_cap: findClause(clauses, (c) => /liability shall be limited|shall not exceed EUR|Special Drawing Rights/i.test(c.text) && !/air carrier/i.test(c.text)),
      damaged_goods: findClause(clauses, (c) => /deemed damaged/i.test(c.text)),
      notice: findClause(clauses, (c) => /written notice of any claim/i.test(c.text)),
      time_bar: findClause(clauses, (c) => /barred unless|legal proceedings/i.test(c.text)),
      exclusions: findClause(clauses, (c) => /not liable to the extent/i.test(c.text)),
    };

    const capText = pick.liability_cap?.text ?? "";
    const sdr = capText.match(/limited to ([\d.]+) Special Drawing Rights/i);
    const fixed = capText.match(/shall not exceed EUR ([\d,]+)/i);
    const words: Record<string, number> = { one: 1, two: 2, three: 3 };
    const tb = pick.time_bar?.text.match(/within (\w+) years? of Delivery/i)?.[1];
    const terms: ContractTermsParsed = {
      found: true,
      coldRoomDuty: !!pick.hub_storage && /exclusively|only/i.test(pick.hub_storage.text),
      ambientLimitMinutes: Number(pick.hub_storage?.text.match(/longer than (\d+) minutes/i)?.[1]) || null,
      liabilityCap: /invoice value/i.test(capText)
        ? { kind: "invoice_value" }
        : sdr
          ? { kind: "sdr_per_kg", sdrPerKg: Number(sdr[1]) }
          : fixed
            ? { kind: "fixed_eur", eur: Number(fixed[1].replace(/,/g, "")) }
            : { kind: "unknown" },
      airLegPassThrough: !!pick.air_carriers && /shall not exceed the amount/i.test(pick.air_carriers.text),
      noticeDays: Number(pick.notice?.text.match(/within (\d+) days of Delivery/i)?.[1]) || null,
      timeBarYears: tb ? (words[tb.toLowerCase()] ?? (Number(tb) || null)) : null,
    };

    const entries = Object.entries(pick).filter((e): e is [string, Clause] => !!e[1]);
    const registered = await registerCitations(
      ctx.db,
      ctx.caseId,
      entries.map(([, c]) => clauseCitation(doc.id, short, c)),
    );
    const refs: Record<string, ClauseRef> = {};
    entries.forEach(([key, c], i) => {
      refs[key] = { clause: c.num, title: c.title, page: c.page, quote: quoteOf(c, 400), citationId: registered[i].id! };
    });
    await patchRecord(ctx.db, ctx.caseId, { contract: { terms, clauses: refs, documentId: doc.id, reference } });

    const capLabel =
      terms.liabilityCap.kind === "invoice_value"
        ? "invoice value"
        : terms.liabilityCap.kind === "sdr_per_kg"
          ? `${terms.liabilityCap.sdrPerKg} SDR/kg`
          : terms.liabilityCap.kind === "fixed_eur"
            ? formatEUR(terms.liabilityCap.eur)
            : "unknown";
    return {
      output: { reference, terms, clauses: refs },
      summary: `Contract ${reference}: ${terms.coldRoomDuty ? `cold-room duty at hubs (§${refs.hub_storage?.clause})` : "no strict cold-room duty"}, cap ${capLabel} (§${refs.liability_cap?.clause ?? "?"}), notice ${terms.noticeDays ?? "?"} days (§${refs.notice?.clause ?? "?"})${terms.airLegPassThrough ? `, air legs passed through to carrier (§${refs.air_carriers?.clause})` : ""}.`,
      citations: registered,
    };
  },
});

/* ============================================================== check_policy */

export const checkPolicy = defineTool({
  name: "check_policy",
  description:
    "Find coverage for temperature deviation, exclusions (incl. minimum duration), deductible, basis of valuation, notice period and the duty to preserve rights against carriers in the cargo insurance policy.",
  input: z.object({}),
  async run(_input, ctx) {
    const doc = await findDocument(ctx.db, ctx.caseId, "policy");
    const empty: PolicyTermsParsed = {
      found: false,
      temperatureCover: false,
      deductibleEur: null,
      insuredPercentOfInvoice: 100,
      minDeviationMinutes: 0,
      noticeDays: null,
      preservationDuty: false,
    };
    if (!doc) {
      await patchRecord(ctx.db, ctx.caseId, { policy: { terms: empty, clauses: {}, documentId: null, policyNumber: null } });
      return { output: { found: false, terms: empty }, summary: "No cargo policy on file: insurer route cannot be assessed." };
    }
    const pages = await pdfPages(ctx.db, doc);
    const all = pages.map((p) => p.text).join("\n");
    const policyNumber = all.match(/Policy no\.\s*([\w-]+)/)?.[1] ?? null;
    const clauses = parseClauses(pages);
    const pick = {
      temperature_cover: findClause(clauses, (c) => /deviation from the temperature range|variation in temperature/i.test(c.text)),
      damage_definition: findClause(clauses, (c) => /deemed damaged/i.test(c.text)),
      minimum_duration: findClause(clauses, (c) => /less than \d+ consecutive minutes/i.test(c.text)),
      packing_exclusion: findClause(clauses, (c) => /insufficiency or unsuitability of packing/i.test(c.text)),
      settlement: findClause(clauses, (c) => /less the deductible/i.test(c.text)),
      notification: findClause(clauses, (c) => /notify the Insurer/i.test(c.text)),
      preservation: findClause(clauses, (c) => /rights against carriers/i.test(c.text)),
      subrogation: findClause(clauses, (c) => /subrogated/i.test(c.text)),
    };
    const ded = findPhrase(pages, /Deductible\s+(?:€|EUR\s?)([\d,]+)[^\n]*/);
    const basis = all.match(/(\d+)% of the commercial invoice value/);
    const terms: PolicyTermsParsed = {
      found: true,
      temperatureCover: !!pick.temperature_cover && /extended to cover/i.test(pick.temperature_cover.text),
      deductibleEur: ded ? Number(ded.match.match(/([\d,]+)/)![1].replace(/,/g, "")) : null,
      insuredPercentOfInvoice: basis ? Number(basis[1]) : 100,
      minDeviationMinutes: Number(pick.minimum_duration?.text.match(/less than (\d+) consecutive minutes/i)?.[1]) || 0,
      noticeDays: Number(pick.notification?.text.match(/within (\d+) days of discovery/i)?.[1]) || null,
      preservationDuty: !!pick.preservation,
    };

    const entries = Object.entries(pick).filter((e): e is [string, Clause] => !!e[1]);
    const cits = entries.map(([, c]) => clauseCitation(doc.id, "Policy", c));
    if (ded) cits.push({ kind: "document", documentId: doc.id, page: ded.page, label: `Policy schedule p.${ded.page}`, title: "Policy schedule: deductible", quote: ded.match });
    const registered = await registerCitations(ctx.db, ctx.caseId, cits);
    const refs: Record<string, ClauseRef> = {};
    entries.forEach(([key, c], i) => {
      refs[key] = { clause: c.num, title: c.title, page: c.page, quote: quoteOf(c, 400), citationId: registered[i].id! };
    });
    if (ded) refs.deductible = { clause: "Schedule", title: "Deductible", page: ded.page, quote: ded.match, citationId: registered[registered.length - 1].id! };
    await patchRecord(ctx.db, ctx.caseId, { policy: { terms, clauses: refs, documentId: doc.id, policyNumber } });

    return {
      output: { policyNumber, terms, clauses: refs },
      summary: `Policy ${policyNumber}: temperature deviation ${terms.temperatureCover ? "covered" : "not covered"}${terms.minDeviationMinutes ? ` (min ${terms.minDeviationMinutes} min)` : ""}, deductible ${terms.deductibleEur != null ? formatEUR(terms.deductibleEur) : "?"}, notice ${terms.noticeDays ?? "?"} days of discovery${terms.preservationDuty ? ", must preserve rights against carriers" : ""}.`,
      citations: registered,
    };
  },
});
