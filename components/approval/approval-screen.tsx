"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, ChevronLeft, FileText, FolderArchive, Loader2, Mail, Pencil, Send, ShieldCheck, Thermometer, Waypoints, X } from "lucide-react";
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
    <div className="text-[14.5px] leading-relaxed text-foreground">
      {body.split(/\n\s*\n/).map((p, i) => (
        <p key={i} className="mb-4 whitespace-pre-line">
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

  const reject = () =>
    start(async () => {
      const r = await approvalAction(ctx.caseId, { draftId: draft.id, decision: "rejected", reason });
      if (!r.ok) return void toast.error("Not rejected", { description: r.error });
      toast("Draft rejected", { description: "The agent will redraft it." });
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Link href={`/cases/${ctx.caseId}`} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" aria-hidden="true" />
            {ctx.shipmentRef}
          </Link>
          <h1 className="text-[1.6rem] leading-tight font-semibold tracking-[-0.025em]">Review and approve</h1>
          <p className="text-sm text-muted-foreground">
            {KIND_LABEL[draft.kind] ?? draft.kind} to {draft.recipientName}. Nothing is sent until a manager approves.
          </p>
        </div>
        <HumanDecisionBadge label="Manager decision" />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ---------- letter ---------- */}
        <motion.section
          className="rounded-2xl border border-border bg-card shadow-card"
          animate={handoff ? { x: 160, y: -40, scale: 0.6, opacity: 0, rotate: 2 } : { x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }}
          transition={{ duration: 0.7, ease: [0.4, 0, 0.2, 1] }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
            <div className="min-w-0 text-sm">
              <div className="text-muted-foreground">
                To <span className="text-foreground">{draft.recipientName}</span> &lt;{draft.recipientEmail}&gt;
              </div>
              {editing ? (
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1.5 font-medium" aria-label="Subject" />
              ) : (
                <div className="mt-0.5 font-semibold">{subject}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {edited && <span className="rounded-full bg-human-soft px-2 py-0.5 text-[11px] font-medium text-human-fg">Edited</span>}
              <AiBadge label="Drafted by Kelvin" />
              {actionable && (
                <Button size="sm" variant={editing ? "secondary" : "outline"} onClick={() => setEditing((e) => !e)}>
                  {editing ? <Check data-icon="inline-start" /> : <Pencil data-icon="inline-start" />}
                  {editing ? "Done editing" : "Edit"}
                </Button>
              )}
            </div>
          </div>
          <div className="px-4 py-5 sm:px-10 sm:py-6">{editing ? <LetterEditor initial={body} onChange={setBody} /> : <LetterView body={body} registry={ctx.registry} />}</div>
        </motion.section>

        {/* ---------- evidence ---------- */}
        <aside className="flex flex-col gap-4">
          {draft.amountEur != null && (
            <div className="border-ai rounded-2xl p-5 shadow-glow">
              <div className="text-xs text-muted-foreground">Amount claimed</div>
              <AnimatedNumber value={draft.amountEur} format="eur" className="block text-3xl leading-tight font-semibold tracking-tight" />
              <div className="mt-1 text-xs text-muted-foreground capitalize">{ctx.route ? `${ctx.route} route` : ""}</div>
            </div>
          )}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
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
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
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
              <div className="mt-3 rounded-lg border border-dashed border-warning/60 bg-warning-soft p-3 text-xs text-warning-fg">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="size-3.5" aria-hidden="true" />
                  {coverage.uncited.length || assumptions.length} statement(s) without a source
                </div>
                <p className="mt-1">They will be marked as assumptions. Add a source like [S3] or confirm them before approving.</p>
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="eyebrow text-muted-foreground">Annexes</div>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {draft.annexes.map((a) => (
                <li key={a} className="flex items-center gap-2">
                  {a.toLowerCase().includes("evidence pack") ? <FolderArchive className="size-3.5 text-ai-fg" /> : <FileText className="size-3.5 text-muted-foreground" />}
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
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur lg:left-[248px]">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
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
              <Kbd className="ml-1 hidden bg-white/20 text-white sm:inline-flex">A</Kbd>
            </Button>
          </div>
        </div>
      </div>

      {/* ---------- hand-off ---------- */}
      <AnimatePresence>
        {handoff && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-background/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
          >
            <motion.div
              className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-10 py-8 shadow-raised"
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.25, delay: 0.3 }}
            >
              <motion.span
                className="bg-ai grid size-14 place-items-center rounded-2xl text-white shadow-glow"
                initial={{ x: -40, rotate: -8 }}
                animate={{ x: [-40, 0, 46], rotate: [-8, 0, 6], opacity: [1, 1, 0] }}
                transition={{ duration: 1.2, delay: 0.35, ease: "easeInOut" }}
              >
                <Mail className="size-7" aria-hidden="true" />
              </motion.span>
              <div className="font-semibold">Approved by {persona.name}</div>
              <div className="text-sm text-muted-foreground">Handing off to the Outbox. The agent sends it and watches for the reply.</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this draft</DialogTitle>
            <DialogDescription>Say what is wrong. The reason is recorded in the audit log and the claim goes back to the agent for redrafting.</DialogDescription>
          </DialogHeader>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Use the invoice value net of VAT" rows={3} aria-label="Reason for rejecting" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!reason.trim() || pending} onClick={reject}>
              Reject draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
