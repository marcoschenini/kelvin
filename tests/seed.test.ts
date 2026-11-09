import { describe, expect, it } from "vitest";
import { extractPdfText } from "@/lib/pdf/extract";
import { buildCase, type GeneratedCase } from "@/seed/build";
import { CASE_A, CASE_B, CASE_C, DEMO_CASES } from "@/seed/cases/demo";
import type { CaseSpec } from "@/seed/spec";

const NOW = new Date("2026-11-09T10:00:00Z");
const dec = new TextDecoder();

function readings(g: GeneratedCase) {
  const csv = dec.decode(g.files.find((f) => f.kind === "logger")!.bytes);
  return csv
    .split("\n")
    .filter((l) => /^\d+,/.test(l))
    .map((l) => {
      const [row, ts, t] = l.split(",");
      return { row: Number(row), at: new Date(ts), t: Number(t) };
    });
}

function custodyAt(g: GeneratedCase, at: Date) {
  const json = JSON.parse(dec.decode(g.files.find((f) => f.kind === "handling_events")!.bytes));
  return json.events.find((e: { from_utc: string; to_utc: string }) => new Date(e.from_utc) <= at && at < new Date(e.to_utc))
    ?.custodian_role as string | undefined;
}

describe.each(DEMO_CASES.map((c) => [c.code, c] as [string, CaseSpec]))("demo case %s", (_code, spec) => {
  it("produces the full document set", async () => {
    const g = await buildCase(spec, NOW);
    const kinds = g.files.map((f) => f.kind);
    for (const k of ["logger", "awb", "handling_events", "contract", "policy", "invoice", "email"]) expect(kinds).toContain(k);
    expect(kinds.filter((k) => k === "email").length).toBeGreaterThanOrEqual(2);
    expect(new Set(g.files.map((f) => f.id)).size).toBe(g.files.length);
  });

  it("writes 5-minute readings with the specified excursion", async () => {
    const g = await buildCase(spec, NOW);
    const rows = readings(g);
    for (let i = 1; i < rows.length; i++) expect(rows[i].at.getTime() - rows[i - 1].at.getTime()).toBe(5 * 60_000);
    const above = rows.filter((r) => r.t > 8);
    const ex = spec.excursions[0];
    expect(Math.abs(above.length * 5 - ex.minutes)).toBeLessThanOrEqual(5);
    expect(Math.max(...rows.map((r) => r.t))).toBe(ex.peakC);
    expect(Math.min(...rows.map((r) => r.t))).toBeGreaterThanOrEqual(2);
  });

  it("places the whole excursion in the expected party's custody", async () => {
    const g = await buildCase(spec, NOW);
    const above = readings(g).filter((r) => r.t > 8);
    const roles = new Set(above.map((r) => custodyAt(g, r.at)));
    expect([...roles]).toEqual([spec.expected.custodyAtExcursion]);
  });
});

describe("demo clock", () => {
  it("anchors delivery and discovery relative to now", async () => {
    const b = await buildCase(CASE_B, NOW);
    expect(b.deliveredAt.toISOString()).toBe("2026-10-30T14:00:00.000Z");
    expect(b.discoveredAt.toISOString()).toBe("2026-11-08T09:00:00.000Z");
    const c = await buildCase(CASE_C, NOW);
    expect(c.deliveredAt.toISOString()).toBe("2026-11-07T14:00:00.000Z");
    const a = await buildCase(CASE_A, NOW);
    expect(a.deliveredAt.toISOString()).toBe("2026-11-08T14:00:00.000Z");
  });

  it("is deterministic", async () => {
    const one = await buildCase(CASE_B, NOW);
    const two = await buildCase(CASE_B, NOW);
    const csv = (g: GeneratedCase) => dec.decode(g.files.find((f) => f.kind === "logger")!.bytes);
    expect(csv(one)).toBe(csv(two));
  });
});

describe("PDF text extraction", () => {
  it("finds contract clauses with page numbers", async () => {
    const g = await buildCase(CASE_C, NOW);
    const pages = await extractPdfText(g.files.find((f) => f.kind === "contract")!.bytes);
    expect(pages.length).toBeGreaterThanOrEqual(3);
    const pageOf = (needle: string) => pages.find((p) => p.text.includes(needle))?.page;
    expect(pageOf("3.2 Hub storage.")).toBe(1);
    expect(pageOf("limited to the invoice value")).toBe(2);
    expect(pageOf("within 7 days of Delivery")).toBe(2);
  });

  it("reads NVD and weight from the air waybill", async () => {
    const g = await buildCase(CASE_B, NOW);
    const [p1] = await extractPdfText(g.files.find((f) => f.kind === "awb")!.bytes);
    expect(p1.text).toContain("NVD");
    expect(p1.text).toContain("120.0");
  });

  it("states the policy deductible and the duty to preserve rights", async () => {
    const g = await buildCase(CASE_B, NOW);
    const pages = await extractPdfText(g.files.find((f) => f.kind === "policy")!.bytes);
    const all = pages.map((p) => p.text).join("\n");
    expect(all).toContain("€10,000 each and every claim");
    expect(all).toMatch(/preservation of rights/i);
  });
});
