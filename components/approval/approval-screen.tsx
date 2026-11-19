"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, ChevronLeft, CircleCheck, FileText, FolderArchive, Loader2, Pencil, Send, ShieldCheck, Thermometer, Waypoints, X } from "lucide-react";
import { toast } from "sonner";
import { OpenableCitation } from "@/components/documents/citation-viewer";
import { AnimatedNumber } from "@/components/kit/animated-number";
import { AiBadge, HumanDecisionBadge } from "@/components/kit/badges";
import { DeadlinePill } from "@/components/kit/deadline-pill";
import { usePersona } from "@/components/shell/persona-switcher";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Textarea } from "@/components/ui/textarea";
import { approvalAction } from "@/lib/actions/gates";
import type { Citation } from "@/lib/domain/citation";
import { ROLE_CAN } from "@/lib/domain/personas";
import { formatDateWithRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LetterEditor } from "./letter-editor";

export interface ApprovalDraft {
  id: string;
  kind: string;
  subject: string;
  body: string;
  recipientName: string;
  recipientEmail: string;
  amountEur: number | null;
  annexes: string[];
  citations: Citation[];
  status: string;
}

export interface ApprovalContext {
  caseId: string;
  shipmentRef: string;
  route: string | null;
  excursion: string | null;
  custodian: string | null;
  deadline: { label: string; daysLeft: number; dueAt: string } | null;
  evidencePackId: string | null;
  registry: Record<string, Citation>;
  /** First reason of the quality agent (or the human QA note). */
  qaReasoning?: string | null;
  qaVerdict?: "usable" | "damaged" | "unsure" | null;
  /** Draft id of the primary claim letter (claim plan); rejecting it closes the case. */
  primaryClaimDraftId?: string | null;
}

const KIND_LABEL: Record<string, string> = {
  claim_letter: "Claim letter",
  protective_notice: "Protective notice",
  reply: "Reply",
  info_request: "Information request",
};

/** Read view: paragraphs with [S#] tags rendered as clickable source chips. */
function LetterView({ body, registry }: { body: string; registry: Record<string, Citation> }) {
  return (
    <div className="text-[15px] leading-[1.7] text-foreground">
      {body.split(/\n\s*\n/).map((p, i) => (
        <p key={i} className="mb-5 whitespace-pre-line">
          {p.split(/(\[S\d+\])/g).map((part, j) => {
            const m = part.match(/^\[(S\d+)\]$/);
            if (m && registry[m[1]]) return <OpenableCitation key={j} citation={registry[m[1]]} className="mx-0.5 h-5 align-[1px] text-[10.5px]" />;
            return <Fragment key={j}>{part}</Fragment>;
          })}
        </p>
      ))}
    </div>
  );
}

function checkCoverage(body: string) {
  const paras = body.split(/\n\s*\n/).map((p) => p.trim());
  const factual = paras.filter((p) => p.length > 60 && !/^(Dear |Yours |Annexes:|Claim for temperature damage|Notice of |Notification of |We therefore claim|The product is under quality assessment|Please preserve|We hereby give)/.test(p));
  const uncited = factual.filter((p) => !/\[S\d+\]/.test(p));
  return { factual: factual.length, uncited };
}

export function ApprovalScreen({ draft, ctx }: { draft: ApprovalDraft; ctx: ApprovalContext }) {
  const router = useRouter();
  const persona = usePersona();
  const canApprove = ROLE_CAN[persona.role].approvalGate;
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(draft.body);
  const [subject, setSubject] = useState(draft.subject);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [handoff, setHandoff] = useState(false);
  const [pending, start] = useTransition();
  const edited = body.trim() !== draft.body.trim() || subject.trim() !== draft.subject.trim();
  const coverage = useMemo(() => checkCoverage(body), [body]);
  const actionable = draft.status === "awaiting_approval";
  const sources = draft.citations.filter((c) => c.kind !== "assumption");
  const assumptions = draft.citations.filter((c) => c.kind === "assumption");

  const approve = useCallback(() => {
    if (!actionable || !canApprove || pending || handoff) return;
    start(async () => {
      const r = await approvalAction(ctx.caseId, edited ? { draftId: draft.id, decision: "approved_with_edits", editedBody: body, editedSubject: subject } : { draftId: draft.id, decision: "approved" });
      if (!r.ok) {
        toast.error("Not approved", { description: r.error });
        return;
      }
      setHandoff(true);
      setTimeout(() => router.push(`/cases/${ctx.caseId}`), 1500);
    });
  }, [actionable, body, canApprove, ctx.caseId, draft.id, edited, handoff, pending, router, subject]);

  const closesCase = draft.kind === "claim_letter" && (!ctx.primaryClaimDraftId || ctx.primaryClaimDraftId === draft.id);
  const reject = () =>
    start(async () => {
      const r = await approvalAction(ctx.caseId, { draftId: draft.id, decision: "rejected", reason });
      if (!r.ok) return void toast.error("Not rejected", { description: r.error });
      toast(closesCase ? "Claim not approved" : "Draft rejected", { description: closesCase ? "The case is closed and the reason is in the audit log." : "The agent will redraft it." });
      router.push(`/cases/${ctx.caseId}`);
    });

  // Keyboard: A approves (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || ["INPUT", "TEXTAREA"].includes(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        approve();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [approve]);

  return (
    <div className="relative flex flex-col gap-5 pb-24">
      <Link href={`/cases/${ctx.caseId}`} className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Case {ctx.shipmentRef}
      </Link>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
        <div className="min-w-0">
          <span className="eyebrow text-muted-foreground">Manager approval · {KIND_LABEL[draft.kind] ?? draft.kind}</span>
          <h1 className="mt-2 text-[1.875rem] leading-[1.1] font-semibold tracking-[-0.015em] sm:text-[2.125rem]">Review and approve</h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            {KIND_LABEL[draft.kind] ?? draft.kind} to {draft.recipientName}. Nothing is sent until a manager approves.
          </p>
        </div>
        <HumanDecisionBadge label="Manager decision" />
      </header>

      <section aria-label="Summary" className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card px-6 py-5 text-sm sm:grid-cols-12 sm:gap-0 sm:divide-x sm:divide-border">
        <div className="min-w-0 sm:col-span-3 sm:pr-6">
          <div className="eyebrow text-[10.5px] text-muted-foreground">Recipient</div>
          <div className="mt-1.5 font-semibold">{draft.recipientName}</div>
        </div>
        <div className="sm:col-span-3 sm:px-6">
          <div className="eyebrow text-[10.5px] text-muted-foreground">Deadline</div>
          {ctx.deadline ? (
            <div className="num mt-1.5">
              <span className="font-semibold">{formatDateWithRelative(ctx.deadline.dueAt)}</span>
              <span className="block truncate text-xs text-muted-foreground">{ctx.deadline.label}</span>
            </div>
          ) : (
            <div className="mt-1.5 text-muted-foreground">No open deadline</div>
          )}
        </div>
        <div className="min-w-0 sm:col-span-6 sm:pl-6">
          <div className="eyebrow text-[10.5px] text-muted-foreground">Quality</div>
          <p className="mt-1.5 line-clamp-2 text-foreground/85">{ctx.qaReasoning ?? "No quality note recorded."}</p>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        {/* ---------- letter ---------- */}
        <div className="flex min-w-0 flex-col gap-3 lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AiBadge label="Drafted by Kelvin" />
              {edited && <span className="rounded-sm px-1.5 py-0.5 text-[10.5px] font-semibold tracking-[0.06em] text-human-fg uppercase ring-1 ring-human/45 ring-inset">Edited</span>}
            </div>
            {actionable && (
              <Button size="sm" variant={editing ? "secondary" : "outline"} onClick={() => setEditing((e) => !e)}>
                {editing ? <Check data-icon="inline-start" /> : <Pencil data-icon="inline-start" />}
                {editing ? "Done editing" : "Edit letter"}
              </Button>
            )}
          </div>
          <motion.article
            aria-label="Letter"
            className="rounded-sm border border-border bg-paper shadow-raised"
            animate={handoff ? { y: -12, opacity: 0 } : { y: 0, opacity: 1 }}
            transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
          >
            <div className="px-6 pt-8 pb-6 sm:px-14 sm:pt-12">
              <div className="flex items-start justify-between gap-6 border-b border-border pb-6">
                <div className="min-w-0 text-sm">
                  <div className="eyebrow text-[10.5px] text-muted-foreground">To</div>
                  <div className="mt-1 font-medium">{draft.recipientName}</div>
                  <div className="text-muted-foreground">{draft.recipientEmail}</div>
                </div>
                <div className="text-right text-sm">
                  <div className="eyebrow text-[10.5px] text-muted-foreground">Reference</div>
                  <div className="num mt-1 font-medium">{ctx.shipmentRef}</div>
                </div>
              </div>
              {editing ? (
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-6 font-medium" aria-label="Subject" />
              ) : (
                <h2 className="mt-7 text-[1.45rem] leading-snug font-semibold text-foreground">{subject}</h2>
              )}
            </div>
            <div className="px-6 pb-10 sm:px-14 sm:pb-14">{editing ? <LetterEditor initial={body} onChange={setBody} /> : <LetterView body={body} registry={ctx.registry} />}</div>
          </motion.article>
        </div>

        {/* ---------- evidence ---------- */}
        <aside aria-label="Evidence" className="flex flex-col gap-4 lg:sticky lg:top-6 lg:col-span-4">
          {draft.amountEur != null && (
            <div className="relative overflow-hidden rounded-xl border border-border bg-card p-5">
              <span className="absolute inset-y-0 left-0 w-[3px] bg-brand" aria-hidden="true" />
              <div className="eyebrow text-muted-foreground">Amount claimed</div>
              <AnimatedNumber value={draft.amountEur} format="eur" className="figure mt-2 block text-[2.25rem] leading-none font-semibold text-brand-fg" />
              <div className="mt-2 text-xs text-muted-foreground capitalize">{ctx.route ? `${ctx.route} route` : ""}</div>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="eyebrow text-muted-foreground">Key facts</div>
            <ul className="mt-3 flex flex-col gap-2.5 text-sm">
              {ctx.excursion && (
                <li className="flex gap-2.5">
                  <Thermometer className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                  {ctx.excursion}
                </li>
              )}
              {ctx.custodian && (
                <li className="flex gap-2.5">
                  <Waypoints className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  Held by {ctx.custodian}
                </li>
              )}
              {ctx.deadline && (
                <li className="flex items-center gap-2.5">
                  <ShieldCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1">{ctx.deadline.label}</span>
                  <DeadlinePill daysLeft={ctx.deadline.daysLeft} date={ctx.deadline.dueAt} />
                </li>
              )}
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div className="eyebrow text-muted-foreground">Sources</div>
              <span className={cn("text-xs font-medium", coverage.uncited.length ? "text-warning-fg" : "text-success-fg")}>
                {coverage.factual - coverage.uncited.length} of {coverage.factual} statements cited
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {sources.map((c, i) => (
                <OpenableCitation key={`${c.id}-${i}`} citation={c} />
              ))}
            </div>
            {(coverage.uncited.length > 0 || assumptions.length > 0) && (
              <div className="mt-3 rounded-md border border-dashed border-warning/60 bg-warning-soft p-3 text-xs text-warning-fg">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  {coverage.uncited.length || assumptions.length} {(coverage.uncited.length || assumptions.length) === 1 ? "statement" : "statements"} without a source
                </div>
                <p className="mt-1">They will be marked as assumptions. Add a source like [S3] or confirm them before approving.</p>
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="eyebrow text-muted-foreground">Annexes</div>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {draft.annexes.map((a) => (
                <li key={a} className="flex items-center gap-2">
                  {a.toLowerCase().includes("evidence pack") ? <FolderArchive className="size-3.5 text-ai-fg" aria-hidden="true" /> : <FileText className="size-3.5 text-muted-foreground" aria-hidden="true" />}
                  {a.toLowerCase().includes("evidence pack") && ctx.evidencePackId ? (
                    <a href={`/api/documents/${ctx.evidencePackId}`} target="_blank" rel="noreferrer" className="text-ai-fg hover:underline">
                      {a}
                    </a>
                  ) : (
                    a
                  )}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* ---------- action bar ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card lg:left-[248px]">
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-10">
          <span className="hidden text-sm text-muted-foreground sm:inline">
            {!actionable
              ? `This draft is ${draft.status.replace(/_/g, " ")}.`
              : canApprove
                ? edited
                  ? "You changed the text. Approving sends your version."
                  : "Approving hands the letter to the Outbox."
                : `Act as Tom Becker (Claims Manager) to approve. You are ${persona.name}.`}
          </span>
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <Button variant="ghost" disabled={!actionable || !canApprove || pending} onClick={() => setRejectOpen(true)}>
              <X data-icon="inline-start" />
              Reject
            </Button>
            <Button variant="ai" size="lg" disabled={!actionable || !canApprove || pending || handoff} onClick={approve}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
              {edited ? "Approve with edits" : "Approve"}
              <Kbd className="ml-1 hidden bg-white/20 text-white sm:inline-flex" aria-hidden="true">A</Kbd>
            </Button>
          </div>
        </div>
      </div>

      {/* ---------- hand-off ---------- */}
      <AnimatePresence>
        {handoff && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-background/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              role="status"
              className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card px-10 py-8 text-center shadow-raised"
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.22, delay: 0.1, ease: [0.2, 0, 0, 1] }}
            >
              <CircleCheck className="size-10 text-success" strokeWidth={1.5} aria-hidden="true" />
              <div className="font-heading text-xl font-semibold">Approved by {persona.name}</div>
              <div className="text-sm text-muted-foreground">Handed to the Outbox. Kelvin sends it and tracks the reply.</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{closesCase ? "Reject this claim and close the case" : "Reject this draft"}</DialogTitle>
            <DialogDescription>
              {closesCase
                ? "Rejecting the claim letter closes the case as Not approved. Nothing is sent and the case cannot be reopened. The reason is recorded in the audit log."
                : "Say what is wrong. The reason is recorded in the audit log and the agent redrafts this message. The case stays open."}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Use the invoice value net of VAT" rows={3} aria-label={closesCase ? "Reason for closing the case" : "Reason for rejecting"} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!reason.trim() || pending} onClick={reject}>
              {closesCase ? "Reject and close case" : "Reject draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
