"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, CircleCheck, Handshake, Loader2, Play, RotateCw, Scale, Send, ShieldAlert, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { useAgentRun } from "@/components/agent/agent-run-context";
import { HumanDecisionBadge } from "@/components/kit/badges";
import { usePersona } from "@/components/shell/persona-switcher";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { deliverRepliesAction, qaDecisionAction, settlementAction } from "@/lib/actions/gates";
import type { CaseStatus } from "@/lib/domain/case-status";
import { ROLE_CAN } from "@/lib/domain/personas";
import { formatEUR } from "@/lib/format";
import { cn } from "@/lib/utils";

const DRAFT_LABEL: Record<string, string> = {
  protective_notice: "Protective notice",
  claim_letter: "Claim letter",
  info_request: "Information request",
  reply: "Reply",
};

export interface WorkflowDraft {
  id: string;
  kind: string;
  recipientName: string;
  subject: string;
  status: string;
  amountEur: number | null;
}

export interface Negotiation {
  offerEur: number;
  claimEur: number;
  counterparty: string;
}

/** Typing-dots indicator while a simulated counterparty "writes" its reply. */
function AwaitingReply({ caseId, from, paused }: { caseId: string; from: string; paused: boolean }) {
  const router = useRouter();
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (paused || fired.current === from) return;
    const t = setTimeout(async () => {
      fired.current = from;
      const r = await deliverRepliesAction(caseId);
      if (r.delivered) {
        toast(`Reply received from ${from}`, { description: "The agent is reading it." });
        router.refresh();
      }
    }, 3500);
    return () => clearTimeout(t);
  }, [caseId, from, paused, router]);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="size-1.5 rounded-full bg-subtle"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </span>
      <span>
        Waiting for a reply from <span className="font-medium">{from}</span>
        <span className="block text-xs text-muted-foreground">Simulated counterparty. Nothing leaves Kelvin.</span>
      </span>
    </div>
  );
}

/**
 * The next action for the case, driven by its status. Human gates carry the
 * violet badge and are only enabled for the persona allowed to act.
 */
export function CaseWorkflow({
  caseId,
  status,
  qa,
  drafts,
  negotiation,
  awaitingReplyFrom,
  recoveredEur,
  closedReason,
}: {
  caseId: string;
  status: CaseStatus;
  qa: "pending" | "released" | "rejected";
  drafts: WorkflowDraft[];
  negotiation: Negotiation | null;
  awaitingReplyFrom: string | null;
  recoveredEur: number | null;
  closedReason: string | null;
}) {
  const persona = usePersona();
  const router = useRouter();
  const run = useAgentRun();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const awaiting = drafts.filter((d) => d.status === "awaiting_approval" && d.kind !== "info_request");
  const approved = drafts.filter((d) => d.status === "approved");
  const busy = pending || !!run.running;
  const isManager = ROLE_CAN[persona.role].approvalGate;

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(success);
      else toast.error("Not allowed", { description: r.error });
      router.refresh();
    });

  if (status.startsWith("closed_")) {
    const recovered = status === "closed_recovered" || status === "closed_settled";
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn("rounded-xl border p-4", recovered || status === "closed_no_claim" ? "border-success/25 bg-success-soft" : "border-border bg-muted")}
      >
        <div className="flex items-center gap-2 font-semibold">
          <CircleCheck className={cn("size-5", recovered || status === "closed_no_claim" ? "text-success" : "text-muted-foreground")} aria-hidden="true" />
          {status === "closed_recovered" ? "Recovered in full" : status === "closed_settled" ? "Settled" : status === "closed_no_claim" ? "Closed: no claim" : "Closed: rejected"}
        </div>
        {recoveredEur != null && recoveredEur > 0 && <div className="num mt-1 text-2xl font-semibold tracking-tight text-success-fg">{formatEUR(recoveredEur)}</div>}
        {closedReason && <p className="mt-1 text-sm text-muted-foreground">{closedReason}</p>}
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {status === "new" && !run.running && (
        <Button variant="ai" onClick={() => run.start("investigate")} className="self-start">
          <Play data-icon="inline-start" />
          Start investigation
        </Button>
      )}
      {status === "investigating" && !run.running && (
        <Button variant="outline" onClick={() => run.start("investigate")} className="self-start">
          <RotateCw data-icon="inline-start" />
          Re-run investigation
        </Button>
      )}

      {status === "awaiting_qa" && qa === "pending" && (
        <div className="rounded-xl border border-human/20 bg-human-soft/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">Is the product still usable?</div>
              <p className="mt-0.5 text-sm text-muted-foreground">Quality Assurance decides disposition. The agent never does.</p>
            </div>
            <HumanDecisionBadge />
          </div>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note, e.g. stability data reference" className="mt-3 bg-card" rows={2} />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={busy || !ROLE_CAN[persona.role].qaGate} onClick={() => act(() => qaDecisionAction(caseId, "released", note || undefined), "Product released")}>
              <ThumbsUp data-icon="inline-start" />
              Released
            </Button>
            <Button variant="destructive" disabled={busy || !ROLE_CAN[persona.role].qaGate} onClick={() => act(() => qaDecisionAction(caseId, "rejected", note || undefined), "Batch rejected")}>
              <ThumbsDown data-icon="inline-start" />
              Rejected
            </Button>
            {!ROLE_CAN[persona.role].qaGate && <span className="text-xs text-muted-foreground">Act as Elena Weber (QA Lead) to decide.</span>}
          </div>
        </div>
      )}

      {negotiation && status === "in_negotiation" && (
        <div className="rounded-xl border border-human/20 bg-human-soft/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 font-semibold">
                <Scale className="size-4 text-human" aria-hidden="true" />
                Settlement offer
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{negotiation.counterparty} offers less than the claim.</p>
            </div>
            <HumanDecisionBadge />
          </div>
          <div className="num mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-card p-2.5">
              <div className="text-xs text-muted-foreground">Offer</div>
              <div className="text-lg font-semibold">{formatEUR(negotiation.offerEur)}</div>
            </div>
            <div className="rounded-lg bg-card p-2.5">
              <div className="text-xs text-muted-foreground">Claim</div>
              <div className="text-lg font-semibold">{formatEUR(negotiation.claimEur)}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || !isManager} onClick={() => act(() => settlementAction(caseId, "accept"), "Offer accepted")}>
              <Handshake data-icon="inline-start" />
              Accept {formatEUR(negotiation.offerEur)}
            </Button>
            <Button variant="ai" disabled={busy || !isManager} onClick={() => act(() => settlementAction(caseId, "counter"), "Counter-letter ready for review")}>
              <ArrowRight data-icon="inline-start" />
              Insist on full amount
            </Button>
          </div>
          {!isManager && <p className="mt-2 text-xs text-muted-foreground">Act as Tom Becker (Claims Manager) to decide.</p>}
        </div>
      )}

      {awaiting.length > 0 && (
        <div className="rounded-xl border border-human/20 bg-human-soft/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold">Manager approval</div>
              <p className="mt-0.5 text-sm text-muted-foreground">Nothing leaves Kelvin without it.</p>
            </div>
            <HumanDecisionBadge />
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {awaiting.map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-lg bg-card p-3 text-sm">
                <ShieldAlert className="size-4 shrink-0 text-warning" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{DRAFT_LABEL[d.kind] ?? d.kind}</span>
                  <span className="text-muted-foreground"> to {d.recipientName}</span>
                  {d.amountEur ? <span className="num font-medium"> · {formatEUR(d.amountEur)}</span> : null}
                </span>
                <Link href={`/cases/${caseId}/approve/${d.id}`} className={cn(buttonVariants({ size: "sm", variant: "ai" }))}>
                  Review
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {approved.length > 0 && (
        <Button variant="ai" disabled={busy} onClick={() => run.start("follow_up")} className="self-start">
          {run.running === "follow_up" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
          Send {approved.length} approved message{approved.length > 1 ? "s" : ""}
        </Button>
      )}

      {awaitingReplyFrom && <AwaitingReply caseId={caseId} from={awaitingReplyFrom} paused={busy} />}
    </div>
  );
}
