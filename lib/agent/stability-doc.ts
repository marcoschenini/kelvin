import type { ExtraCost, StabilityAllowance } from "@/lib/rules/types";

/**
 * The manufacturer's stability allowance and the documented extra costs arrive
 * as plain-text emails. These parsers only read numbers out of the text; every
 * decision on them is made in lib/rules.
 */

export function isStabilityEmail(subject: string): boolean {
  return /^(re:\s*)?stability data/i.test(subject.trim());
}

export function isExtraCostsEmail(subject: string): boolean {
  return /^(re:\s*)?extra costs?/i.test(subject.trim());
}

/** "... allows temperature excursions up to 25 °C for a cumulative 1,440 minutes ..." */
export function parseStabilityAllowance(body: string): { allowance: StabilityAllowance; sentence: string } | null {
  const sentence = body.replace(/\s+/g, " ").split(/(?<=\.)\s/).find((s) => /up to\s*[\d.]+\s*°\s*C/i.test(s) && /[\d,]+\s*min/i.test(s));
  if (!sentence) return null;
  const temp = sentence.match(/up to\s*([\d.]+)\s*°\s*C/i);
  const mins = sentence.match(/([\d,]+)\s*min/i);
  if (!temp || !mins) return null;
  return { allowance: { maxTempC: Number(temp[1]), maxMinutesOutOfRange: Number(mins[1].replace(/,/g, "")) }, sentence: sentence.trim() };
}

/** Lines of the form "- Disposal of the damaged batch: EUR 12,000". */
export function parseExtraCosts(body: string): (ExtraCost & { line: string })[] {
  const out: (ExtraCost & { line: string })[] = [];
  for (const l of body.split(/\r?\n/)) {
    const m = l.match(/^\s*[-*]\s*(.+?):\s*(?:€|EUR\s?)([\d,]+(?:\.\d+)?)\s*$/);
    if (m) out.push({ label: m[1].trim(), eur: Number(m[2].replace(/,/g, "")), line: l.trim() });
  }
  return out;
}
