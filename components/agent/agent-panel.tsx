"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  CalendarClock,
  ChevronRight,
  FileText,
  FolderArchive,
  ListChecks,
  ListOrdered,
  Loader2,
  MailOpen,
  PenLine,
  Route,
  Scale,
  ScrollText,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Thermometer,
  X,
  type LucideIcon,
} from "lucide-react";
import { OpenableCitation } from "@/components/documents/citation-viewer";
import type { RunKind } from "@/lib/agent/events";
import type { Citation } from "@/lib/domain/citation";
import { formatDateTime, formatMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAgentRun, type LiveStep } from "./agent-run-context";

const TOOL: Record<string, { label: string; icon: LucideIcon }> = {
  parse_logger: { label: "Read the temperature logger", icon: Thermometer },
  extract_document: { label: "Read documents", icon: FileText },
  build_custody_timeline: { label: "Rebuilt the custody timeline", icon: Route },
  check_contract: { label: "Checked the forwarder contract", icon: ScrollText },
  check_policy: { label: "Checked the cargo policy", icon: ShieldCheck },
  compute_liability: { label: "Applied liability limits", icon: Scale },
  compute_deadlines: { label: "Computed deadlines", icon: CalendarClock },
  rank_routes: { label: "Ranked recovery routes", icon: ListOrdered },
  draft_protective_notice: { label: "Drafted a protective notice", icon: ShieldAlert },
  draft_claim_letter: { label: "Drafted the claim letter", icon: PenLine },
  build_evidence_pack: { label: "Built the evidence pack", icon: FolderArchive },
  request_missing_info: { label: "Checked for missing information", icon: ListChecks },
  send_via_outbox: { label: "Sent via the Outbox", icon: Send },
  handle_reply: { label: "Handled a reply", icon: MailOpen },
};

const RUN_LABEL: Record<RunKind, string> = {
  investigate: "Investigation",
  prepare_claim: "Claim preparation",
  close: "Closing",
  follow_up: "Follow-up",
};

export interface PersistedRun {
  id: string;
  kind: RunKind;
  mode: string;
  model: string | null;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  steps: LiveStep[];
}

function Json({ value }: { value: unknown }) {
  const s = JSON.stringify(value, null, 2) ?? "";
  return <pre className="max-h-56 overflow-auto rounded-md bg-muted p-2 font-mono text-[10.5px] leading-snug text-muted-foreground">{s.length > 4000 ? `${s.slice(0, 4000)}\n…` : s}</pre>;
}

function Step({ s }: { s: LiveStep }) {
  if (s.tool === "message") {
    return (
      <li className="flex gap-2.5 py-1.5">
        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-ai-fg" aria-hidden="true" />
        <p className="text-[13px] text-muted-foreground italic">{s.text ?? s.summary}</p>
      </li>
    );
  }
  const meta = TOOL[s.tool] ?? { label: s.tool, icon: Sparkles };
  const Icon = meta.icon;
  return (
    <li className="flex gap-2.5 py-1.5">
      <span
        className={cn(
          "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md",
          s.status === "running" ? "bg-ai-soft text-ai-fg" : s.status === "ok" ? "bg-muted text-foreground/70" : "bg-danger-soft text-danger",
        )}
      >
        {s.status === "running" ? <Loader2 className="size-3.5 animate-spin" /> : s.status === "error" ? <X className="size-3.5" /> : <Icon className="size-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium">{meta.label}</span>
          {s.durationMs != null && <span className="num shrink-0 text-[11px] text-subtle">{formatMs(s.durationMs)}</span>}
        </div>
        {s.summary && <p className={cn("text-[13px]", s.status === "error" ? "text-danger-fg" : "text-foreground/80")}>{s.summary}</p>}
        {!!s.citations?.length && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {s.citations.slice(0, 6).map((c: Citation, i) => (
              <OpenableCitation key={`${c.id}-${i}`} citation={c} />
            ))}
            {s.citations.length > 6 && <span className="self-center text-[11px] text-muted-foreground">+{s.citations.length - 6}</span>}
          </div>
        )}
        {(s.input !== undefined || s.output !== undefined) && s.status !== "running" && (
          <details className="group mt-1">
            <summary className="inline-flex cursor-pointer items-center gap-1 text-[11px] text-subtle select-none hover:text-foreground">
              <ChevronRight className="size-3 transition-transform group-open:rotate-90" aria-hidden="true" />
              <span className="font-mono">{s.tool}</span> input and output
            </summary>
            <div className="mt-1.5 flex flex-col gap-1.5">
              <Json value={s.input ?? {}} />
              <Json value={s.output ?? null} />
            </div>
          </details>
        )}
      </div>
    </li>
  );
}

export function AgentPanel({ runs }: { runs: PersistedRun[] }) {
  const live = useAgentRun();
  return (
    <div className="flex flex-col gap-4">
      {runs.length === 0 && !live.running && <p className="text-sm text-muted-foreground">The agent has not run on this case yet.</p>}
      {runs.map((r, i) => (
        <details key={r.id} open={i === runs.length - 1 && !live.running} className="group/run">
          <summary className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground select-none">
            <ChevronRight className="size-3.5 transition-transform group-open/run:rotate-90" aria-hidden="true" />
            <span className="font-semibold text-foreground">{RUN_LABEL[r.kind]}</span>
            <span>· {r.mode === "live" ? (r.model ?? "live") : "deterministic planner"}</span>
            <span className="num ml-auto">{formatDateTime(r.startedAt)}</span>
          </summary>
          <ol className="mt-1 ml-1 border-l border-border pl-3">
            {r.steps.map((s) => (
              <Step key={`${r.id}-${s.seq}`} s={s} />
            ))}
            {r.status === "failed" && <li className="py-1 text-xs text-danger-fg">Run failed.</li>}
          </ol>
        </details>
      ))}

      {live.running && (
        <div>
          <div className="flex items-center gap-2 text-xs">
            <Loader2 className="size-3.5 animate-spin text-ai-fg" aria-hidden="true" />
            <span className="font-semibold">{RUN_LABEL[live.running]}</span>
            <span className="text-muted-foreground">in progress</span>
          </div>
          <ol className="mt-1 ml-1 border-l border-ai-from/30 pl-3" aria-live="polite">
            <AnimatePresence initial={false}>
              {live.steps.map((s) => (
                <motion.div key={s.seq} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}>
                  <Step s={s} />
                </motion.div>
              ))}
            </AnimatePresence>
            {live.narration.trim() && (
              <li className="flex gap-2.5 py-1.5">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 animate-pulse text-ai-fg" aria-hidden="true" />
                <p className="text-[13px] text-muted-foreground italic">{live.narration.trim()}</p>
              </li>
            )}
          </ol>
        </div>
      )}
    </div>
  );
}
