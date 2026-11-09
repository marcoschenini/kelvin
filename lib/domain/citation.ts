/**
 * A source reference. Every statement in a dossier or letter carries one;
 * statements without one are flagged as assumptions.
 */
export type CitationKind = "document" | "logger" | "email" | "record" | "assumption";

export interface Citation {
  /** Stable id within a case, e.g. "S7". Letters reference it as [S7]. */
  id?: string;
  kind: CitationKind;
  /** Short chip label: "Contract §7.1 p.2", "Logger r.168–185" */
  label: string;
  /** Longer description for tooltips */
  title?: string;
  documentId?: string;
  page?: number;
  /** Exact text to highlight in the viewer */
  quote?: string;
  /** Logger rows */
  rows?: [number, number];
}

/** Identity key so the same source is registered once per case. */
export function citationKey(c: Citation): string {
  return [c.kind, c.documentId ?? "", c.page ?? "", c.rows?.join("-") ?? "", c.label].join("|");
}
