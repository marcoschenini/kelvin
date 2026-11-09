"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, ShieldAlert, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { toast } from "sonner";
import { AgentRunner } from "@/components/agent/agent-runner";
import { HumanDecisionBadge } from "@/components/kit/badges";
import { usePersona } from "@/components/shell/persona-switcher";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { approvalAction, qaDecisionAction } from "@/lib/actions/gates";
import type { CaseStatus } from "@/lib/domain/case-status";
import { ROLE_CAN } from "@/lib/domain/personas";
import { formatEUR } from "@/lib/format";

export interface WorkflowDraft {
  id: string;
  kind: string;
  recipientName: string;
  subject: string;
  status: string;
  amountEur: number | null;
}

/**
 * Interim workflow controls (milestone 3): the next action for the case's
 * status. Milestones 4–5 replace these with the designed gate cards.
 */
export function CaseWorkflow({
  caseId,
  status,
  qa,
  drafts,
}: {
  caseId: string;
  status: CaseStatus;
  qa: "pending" | "released" | "rejected";
  drafts: WorkflowDraft[];
}) {
  const persona = usePersona();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const awaiting = drafts.filter((d) => d.status === "awaiting_approval" && d.kind !== "info_request");
  const approved = drafts.filter((d) => d.status === "approved");

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(success);
      else toast.error("Not allowed", { description: r.error });
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-5">
      {status === "new" && <AgentRunner caseId={caseId} kind="investigate" label="Start investigation" autoStart />}
      {status === "investigating" && <AgentRunner caseId={caseId} kind="investigate" label="Re-run investigation" />}
      {status === "awaiting_qa" && qa === "rejected" && <AgentRunner caseId={caseId} kind="prepare_claim" label="Prepare claim" autoStart />}
      {status === "no_claim" && <AgentRunner caseId={caseId} kind="close" label="Close case" autoStart />}

      {status === "awaiting_qa" && qa === "pending" && (
        <div className="rounded-xl border border-human/20 bg-human-soft/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold">Quality decision: is the product still usable?</div>
            <HumanDecisionBadge />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Only Quality Assurance can decide disposition. The agent never does.</p>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note (e.g. stability data reference)" className="mt-3 bg-card" rows={2} />
          <div className="mt-3 flex items-center gap-2">
            <Button variant="outline" disabled={pending || !ROLE_CAN[persona.role].qaGate} onClick={() => act(() => qaDecisionAction(caseId, "released", note || undefined), "Product released")}>
              <ThumbsUp data-icon="inline-start" />
              Released
            </Button>
            <Button variant="destructive" disabled={pending || !ROLE_CAN[persona.role].qaGate} onClick={() => act(() => qaDecisionAction(caseId, "rejected", note || undefined), "Batch rejected")}>
              <ThumbsDown data-icon="inline-start" />
              Rejected
            </Button>
            {!ROLE_CAN[persona.role].qaGate && <span className="text-xs text-muted-foreground">Switch to Elena Weber (QA Lead) to decide.</span>}
          </div>
        </div>
      )}

      {awaiting.length > 0 && (
        <div className="rounded-xl border border-human/20 bg-human-soft/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="font-semibold">Manager approval</div>
            <HumanDecisionBadge />
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            {awaiting.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-card p-3 text-sm">
                <ShieldAlert className="size-4 text-warning" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{d.kind.replace(/_/g, " ")}</span> to {d.recipientName}
                  {d.amountEur ? <span className="num"> · {formatEUR(d.amountEur)}</span> : null}
                </span>
                <Button size="sm" variant="ai" disabled={pending || !ROLE_CAN[persona.role].approvalGate} onClick={() => act(() => approvalAction(caseId, { draftId: d.id, decision: "approved" }), "Approved")}>
                  <Check data-icon="inline-start" />
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending || !ROLE_CAN[persona.role].approvalGate}
                  onClick={() => {
                    const reason = window.prompt("Reason for rejecting?");
                    if (reason) act(() => approvalAction(caseId, { draftId: d.id, decision: "rejected", reason }), "Rejected");
                  }}
                >
                  <X data-icon="inline-start" />
                  Reject
                </Button>
              </li>
            ))}
          </ul>
          {!ROLE_CAN[persona.role].approvalGate && <p className="mt-2 text-xs text-muted-foreground">Switch to Tom Becker (Claims Manager) to approve.</p>}
        </div>
      )}

      {approved.length > 0 && <AgentRunner caseId={caseId} kind="follow_up" label={`Send ${approved.length} approved message${approved.length > 1 ? "s" : ""}`} />}
      {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
    </div>
  );
}
