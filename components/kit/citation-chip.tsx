import { AlertTriangle, ClipboardCheck, FileSpreadsheet, FileText, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

export type { Citation, CitationKind } from "@/lib/domain/citation";
import type { Citation } from "@/lib/domain/citation";

const ICONS = {
  document: FileText,
  logger: FileSpreadsheet,
  email: Mail,
  record: ClipboardCheck,
  assumption: AlertTriangle,
} as const;

/**
 * A source reference. Every statement in a dossier or letter carries one;
 * statements without a source render as an amber dashed "Assumption" chip.
 */
export function CitationChip({
  citation,
  onOpen,
  className,
}: {
  citation: Citation;
  onOpen?: (c: Citation) => void;
  className?: string;
}) {
  const Icon = ICONS[citation.kind];
  const assumption = citation.kind === "assumption";
  const classes = cn(
    "inline-flex h-6 max-w-full items-center gap-1 rounded-md px-1.5 text-[11px] font-medium whitespace-nowrap transition-colors",
    assumption
      ? "border border-dashed border-warning/60 bg-warning-soft text-warning-fg"
      : "border border-border bg-card text-foreground/80 hover:border-ai-from/40 hover:bg-ai-soft hover:text-ai-fg",
    onOpen && "cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
    className,
  );
  const content = (
    <>
      <Icon className="size-3 shrink-0 opacity-70" aria-hidden="true" />
      <span className="truncate">{citation.label}</span>
    </>
  );
  if (!onOpen) {
    return (
      <span className={classes} title={citation.title ?? citation.label}>
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={classes}
      title={citation.title ?? citation.label}
      aria-label={`Open source: ${citation.title ?? citation.label}`}
      onClick={() => onOpen(citation)}
    >
      {content}
    </button>
  );
}
