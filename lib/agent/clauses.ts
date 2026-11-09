import type { ExtractedPage } from "@/lib/pdf/extract";

/**
 * Splits contract/policy text into numbered clauses ("7.1 Notice of claim. …"),
 * each with the page it starts on. Running headers and footers are dropped so a
 * clause that crosses a page break reads continuously.
 */

export interface Clause {
  num: string;
  title: string | null;
  text: string;
  page: number;
}

const CLAUSE_START = /^(\d{1,2}\.\d{1,2})\s+(.*)$/;
const SECTION_HEADING = /^(\d{1,2}\.\s+[A-Z][A-Z ,&-]+|SCHEDULE\b.*|RECITALS)$/;

function isNoise(line: string, index: number, page: number): boolean {
  if (/Page \d+ of \d+/.test(line)) return true;
  if (page > 1 && index === 0 && line.includes(" | ")) return true; // running header
  return false;
}

export function parseClauses(pages: ExtractedPage[]): Clause[] {
  const out: Clause[] = [];
  let current: Clause | null = null;
  for (const p of pages) {
    p.text.split("\n").forEach((raw, i) => {
      const line = raw.trim();
      if (!line || isNoise(line, i, p.page)) return;
      const m = line.match(CLAUSE_START);
      if (m) {
        if (current) out.push(current);
        const body = m[2];
        const firstSentence = body.match(/^([^.]{2,60})\.\s*(.*)$/);
        const short = firstSentence && firstSentence[1].split(/\s+/).length <= 6;
        current = {
          num: m[1],
          title: short ? firstSentence![1].trim() : null,
          text: short ? firstSentence![2] : body,
          page: p.page,
        };
        return;
      }
      if (SECTION_HEADING.test(line)) {
        if (current) out.push(current);
        current = null;
        return;
      }
      if (current) current.text += ` ${line}`;
    });
  }
  if (current) out.push(current);
  return out.map((c) => ({ ...c, text: c.text.replace(/\s+/g, " ").trim() }));
}

export function findClause(clauses: Clause[], test: (c: Clause) => boolean): Clause | null {
  return clauses.find(test) ?? null;
}

/** A short quote for citation chips and highlight: the first sentence(s), up to ~220 chars. */
export function quoteOf(c: Clause, max = 220): string {
  const t = c.title ? `${c.title}. ${c.text}` : c.text;
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastStop = cut.lastIndexOf(". ");
  return lastStop > 80 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
}

/** Finds the page containing a phrase (for schedule lines that are not numbered clauses). */
export function findPhrase(pages: ExtractedPage[], re: RegExp): { page: number; match: string } | null {
  for (const p of pages) {
    const m = p.text.match(re);
    if (m) return { page: p.page, match: m[0] };
  }
  return null;
}
