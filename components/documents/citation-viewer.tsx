"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { CitationChip } from "@/components/kit/citation-chip";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { Citation } from "@/lib/domain/citation";
import { formatTemp } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Citation viewer: any citation chip on the case page opens the source in a
 * side sheet — the PDF page text with the cited passage highlighted, the
 * logger rows, or the email — plus a link to the original file.
 */

const Ctx = createContext<{ open: (c: Citation) => void } | null>(null);

export function useCitationViewer() {
  return useContext(Ctx);
}

/** Chip that opens the viewer when a provider is present (plain chip otherwise). */
export function OpenableCitation({ citation, className }: { citation: Citation; className?: string }) {
  const viewer = useCitationViewer();
  const openable = !!viewer && (!!citation.documentId || citation.kind === "record" || citation.kind === "assumption");
  return <CitationChip citation={citation} className={className} onOpen={openable ? viewer!.open : undefined} />;
}

interface Loaded {
  title: string;
  kind: string;
  page?: number;
  pages?: number | null;
  text?: string;
  rows?: { row: number; at: string; c: number; cited: boolean }[];
}

/** Builds a whitespace-tolerant regex from the first words of a quote. */
function quoteRegex(quote: string): RegExp | null {
  const words = quote
    .replace(/[…]+$/, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 28)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (words.length < 2) return null;
  return new RegExp(words.join("\\s+"), "i");
}

function Highlighted({ text, quote }: { text: string; quote?: string }) {
  const parts = useMemo(() => {
    const re = quote ? quoteRegex(quote) : null;
    const m = re ? re.exec(text) : null;
    if (!m) return { before: text, hit: "", after: "" };
    return { before: text.slice(0, m.index), hit: m[0], after: text.slice(m.index + m[0].length) };
  }, [text, quote]);
  useEffect(() => {
    document.getElementById("citation-hit")?.scrollIntoView({ block: "center" });
  }, [parts.hit]);
  return (
    <pre className="font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/90">
      {parts.before}
      {parts.hit && (
        <mark id="citation-hit" className="rounded bg-warning-soft px-0.5 text-foreground ring-1 ring-warning/40">
          {parts.hit}
        </mark>
      )}
      {parts.after}
    </pre>
  );
}

export function CitationViewerProvider({ children }: { children: React.ReactNode }) {
  const [citation, setCitation] = useState<Citation | null>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);

  const open = useCallback((c: Citation) => {
    setCitation(c);
    setData(null);
    if (!c.documentId) return;
    setLoading(true);
    const q = c.rows ? `rows=${c.rows[0]}-${c.rows[1]}` : c.page ? `page=${c.page}` : "";
    fetch(`/api/documents/${c.documentId}/text?${q}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const ctx = useMemo(() => ({ open }), [open]);
  return (
    <Ctx.Provider value={ctx}>
      {children}
      <Sheet open={!!citation} onOpenChange={(o) => !o && setCitation(null)}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-xl">
          {citation && (
            <>
              <SheetHeader className="border-b border-border">
                <div className="flex items-center gap-2">
                  <CitationChip citation={citation} />
                  {citation.id && <span className="font-mono text-xs text-muted-foreground">[{citation.id}]</span>}
                </div>
                <SheetTitle className="mt-1 text-base">{data?.title ?? citation.title ?? citation.label}</SheetTitle>
                <SheetDescription>
                  {citation.kind === "assumption"
                    ? "No source was cited for this statement. A reviewer should confirm it before the letter is sent."
                    : citation.kind === "record"
                      ? "Internal case record (human decision)."
                      : data?.page
                        ? `Page ${data.page}${data.pages ? ` of ${data.pages}` : ""}. The cited passage is highlighted.`
                        : citation.rows
                          ? `Logger rows ${citation.rows[0]}–${citation.rows[1]} (out-of-range readings highlighted).`
                          : "Source document."}
                </SheetDescription>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {loading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Loading source…
                  </div>
                )}
                {!citation.documentId && <Highlighted text={citation.quote ?? citation.title ?? ""} />}
                {data?.rows && (
                  <table className="num w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-1 font-medium">Row</th>
                        <th className="py-1 font-medium">Timestamp (UTC)</th>
                        <th className="py-1 text-right font-medium">Temp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((r) => (
                        <tr key={r.row} className={cn("border-t border-border", r.cited && (r.c > 8 || r.c < 2) && "bg-warning-soft text-warning-fg")}>
                          <td className="py-1">{r.row}</td>
                          <td className="py-1">{r.at.replace("T", " ").replace("Z", "")}</td>
                          <td className="py-1 text-right font-medium">{formatTemp(r.c)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {data?.text != null && <Highlighted text={data.text} quote={citation.quote} />}
              </div>
              {citation.documentId && (
                <div className="border-t border-border p-4">
                  <a
                    href={`/api/documents/${citation.documentId}${data?.page ? `#page=${data.page}` : ""}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-ai-fg hover:underline"
                  >
                    <FileText className="size-4" aria-hidden="true" />
                    Open the original {data?.kind === "logger" ? "logger file" : "document"}
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </Ctx.Provider>
  );
}
