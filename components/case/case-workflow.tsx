"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleCheck, Clock, Handshake, Loader2, Play, RotateCw, Send, ThumbsDown, ThumbsUp } from "lucide-react";
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

/** Quiet waiting line while a simulated counterparty "writes" its reply. */
function AwaitingReply({ caseId, from, paused }: { caseId: string; from: string; paused: boolean }) {
  const router = useRouter();
  const fired = useRef<string | null>(null);
  useEffect(() => {
    if (paused || fired.current === from) return;
    const t = setTimeout(async () => {
      fired.current = from;
      const r = await deliverRepliesAction(caseId);
      if (r.delivered) {
        toast(`Reply received from ${from}`, { description: "Next step being proposed." });
        router.refresh();
      }
    }, 3500);
    return () => clearTimeout(t);
  }, [caseId, from, paused, router]);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-sm">
      <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span>
        Awaiting a reply from <span className="font-medium">{from}</span>
        <span className="block text-xs text-muted-foreground">Simulated counterparty. Nothing leaves Kelvin.</span>
      </span>
    </div>
  );
}

function GateHeader({ title, description, badge = "Human decision" }: { title: string; description?: string; badge?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <HumanDecisionBadge label={badge} className="self-start" />
      <div>
        <div className="font-heading text-[17px] leading-snug font-semibold">{title}</div>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

/**
 * The next action for the case, driven by its status. Human gates carry the
 * navy outline badge and are only enabled for the persona allowed to act.
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
  agentUnsure = false,
}: {
  caseId: string;
  status: CaseStatus;
  qa: "pending" | "released" | "rejected";
  drafts: WorkflowDraft[];
  negotiation: Negotiation | null;
  awaitingReplyFrom: string | null;
  recoveredEur: number | null;
  closedReason: string | null;
  /** The quality assessment could not decide on its own; a human QA must. */
  agentUnsure?: boolean;
}) {
  const persona = usePersona();
  const router = useRouter();
  const run = useAgentRun();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  // Claim letters first (largest amount first): the claim is the decision that matters most.
  const awaiting = drafts
    .filter((d) => d.status === "awaiting_approval" && d.kind !== "info_request")
    .sort((a, b) => Number(b.kind === "claim_letter") - Number(a.kind === "claim_letter") || (b.amountEur ?? 0) - (a.amountEur ?? 0));
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
    const good = status === "closed_recovered" || status === "closed_settled" || status === "closed_no_claim";
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 font-heading text-[17px] font-semibold">
          <CircleCheck className={cn("size-5", good ? "text-success" : "text-muted-foreground")} aria-hidden="true" />
          {status === "closed_recovered" ? "Recovered in full" : status === "closed_settled" ? "Settled" : status === "closed_no_claim" ? "Closed: no claim" : status === "closed_not_approved" ? "Closed: not approved by the manager" : "Closed: rejected"}
        </div>
        {recoveredEur != null && recoveredEur > 0 && <div className="figure text-[1.75rem] leading-tight font-semibold text-success-fg">{formatEUR(recoveredEur)}</div>}
        {closedReason && <p className="text-sm text-muted-foreground">{closedReason}</p>}
      </div>
    );
  }

  const qaGate = status === "awaiting_qa" && qa === "pending";
  const negotiating = !!negotiation && status === "in_negotiation";
  const nothingToDo = !(status === "new" || status === "investigating" || qaGate || negotiating || awaiting.length || approved.length || awaitingReplyFrom);

  return (
    <div className="flex flex-col gap-5">
      {status === "new" && !run.running && (
        <Button variant="ai" size="lg" onClick={() => run.start("investigate")} className="self-start">
          <Play data-icon="inline-start" />
          Start analysis
        </Button>
      )}
      {status === "investigating" && !run.running && (
        <Button variant="outline" onClick={() => run.start("investigate")} className="self-start">
          <RotateCw data-icon="inline-start" />
          Re-run analysis
        </Button>
      )}
      {(status === "new" || status === "investigating") && run.running && <p className="text-sm text-muted-foreground">Actions become available when the analysis is complete.</p>}

      {qaGate && (
        <div className="flex flex-col gap-3">
          <GateHeader
            badge="QA decision"
            title="Is the product still usable?"
            description={agentUnsure ? "The excursion is too close to the stability limit to call automatically. Quality Assurance decides." : "Quality Assurance decides the disposition of the batch."}
          />
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note, e.g. stability data reference" className="bg-card" rows={2} aria-label="QA note" />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={busy || !ROLE_CAN[persona.role].qaGate} onClick={() => act(() => qaDecisionAction(caseId, "released", note || undefined), "Product released")}>
              <ThumbsUp data-icon="inline-start" />
              Release product
            </Button>
            <Button variant="navy" disabled={busy || !ROLE_CAN[persona.role].qaGate} onClick={() => act(() => qaDecisionAction(caseId, "rejected", note || undefined), "Batch rejected")}>
              <ThumbsDown data-icon="inline-start" />
              Reject batch
            </Button>
          </div>
          {!ROLE_CAN[persona.role].qaGate && <span className="text-xs text-muted-foreground">Act as Elena Weber (QA Lead) to decide.</span>}
        </div>
      )}

      {negotiating && negotiation && (
        <div className="flex flex-col gap-3">
          <GateHeader badge="Manager decision" title="Settlement offer" description={`${negotiation.counterparty} offers less than the claim.`} />
          <dl className="grid grid-cols-2 divide-x divide-border rounded-lg border border-border bg-card">
            <div className="p-3">
              <dt className="eyebrow text-muted-foreground">Offer</dt>
              <dd className="figure mt-1 text-xl font-semibold">{formatEUR(negotiation.offerEur)}</dd>
            </div>
            <div className="p-3">
              <dt className="eyebrow text-muted-foreground">Claim</dt>
              <dd className="figure mt-1 text-xl font-semibold">{formatEUR(negotiation.claimEur)}</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button variant="ai" disabled={busy || !isManager} onClick={() => act(() => settlementAction(caseId, "counter"), "Counter-letter ready for review")}>
              <ArrowRight data-icon="inline-start" />
              Insist on full amount
            </Button>
            <Button variant="outline" disabled={busy || !isManager} onClick={() => act(() => settlementAction(caseId, "accept"), "Offer accepted")}>
              <Handshake data-icon="inline-start" />
              Accept {formatEUR(negotiation.offerEur)}
            </Button>
          </div>
          {!isManager && <p className="text-xs text-muted-foreground">Act as Tom Becker (Claims Manager) to decide.</p>}
        </div>
      )}

      {awaiting.length > 0 && (
        <div className="flex flex-col gap-3">
          <GateHeader badge="Manager approval" title={awaiting.some((d) => d.kind === "claim_letter") ? "Approve the claim" : "Approve outgoing message"} description="Nothing leaves Kelvin without a manager's approval." />
          <ul className="flex flex-col gap-2">
            {awaiting.map((d, i) => (
              <li key={d.id} className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{DRAFT_LABEL[d.kind] ?? d.kind}</span>
                  <span className="text-muted-foreground"> to {d.recipientName}</span>
                  {d.amountEur ? <span className="num block font-medium">{formatEUR(d.amountEur)}</span> : null}
                </span>
                <Link href={`/cases/${caseId}/approve/${d.id}`} className={cn(buttonVariants({ size: i === 0 ? "default" : "sm", variant: i === 0 ? "ai" : "outline" }), "self-start")}>
                  {d.kind === "claim_letter" ? "Review and approve claim" : "Review and approve"}
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

      {nothingToDo && <p className="text-sm text-muted-foreground">{run.running ? "Kelvin is updating the analysis." : "No action needed right now."}</p>}
    </div>
  );
}
