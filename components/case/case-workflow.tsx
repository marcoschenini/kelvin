"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Play, RotateCw, Send, ShieldAlert, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { toast } from "sonner";
import { useAgentRun } from "@/components/agent/agent-run-context";
import { HumanDecisionBadge } from "@/components/kit/badges";
import { usePersona } from "@/components/shell/persona-switcher";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { approvalAction, qaDecisionAction } from "@/lib/actions/gates";
import type { CaseStatus } from "@/lib/domain/case-status";
import { ROLE_CAN } from "@/lib/domain/personas";
import { formatEUR } from "@/lib/format";

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

/**
 * The next action for the case, driven by its status. Human gates carry the
 * violet badge and are only enabled for the persona allowed to act.
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
  const run = useAgentRun();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const awaiting = drafts.filter((d) => d.status === "awaiting_approval" && d.kind !== "info_request");
  const approved = drafts.filter((d) => d.status === "approved");
  const busy = pending || !!run.running;

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(success);
      else toast.error("Not allowed", { description: r.error });
      router.refresh();
    });

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
              <li key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-card p-3 text-sm">
                <ShieldAlert className="size-4 text-warning" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{DRAFT_LABEL[d.kind] ?? d.kind}</span>
                  <span className="text-muted-foreground"> to {d.recipientName}</span>
                  {d.amountEur ? <span className="num font-medium"> · {formatEUR(d.amountEur)}</span> : null}
                </span>
                <span className="flex gap-1">
                  <Button size="sm" variant="ai" disabled={busy || !ROLE_CAN[persona.role].approvalGate} onClick={() => act(() => approvalAction(caseId, { draftId: d.id, decision: "approved" }), "Approved")}>
                    <Check data-icon="inline-start" />
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy || !ROLE_CAN[persona.role].approvalGate}
                    onClick={() => {
                      const reason = window.prompt("Reason for rejecting?");
                      if (reason) act(() => approvalAction(caseId, { draftId: d.id, decision: "rejected", reason }), "Rejected");
                    }}
                  >
                    <X data-icon="inline-start" />
                    Reject
                  </Button>
                </span>
              </li>
            ))}
          </ul>
          {!ROLE_CAN[persona.role].approvalGate && <p className="mt-2 text-xs text-muted-foreground">Act as Tom Becker (Claims Manager) to approve.</p>}
        </div>
      )}

      {approved.length > 0 && (
        <Button variant="ai" disabled={busy} onClick={() => run.start("follow_up")} className="self-start">
          {run.running === "follow_up" ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Send data-icon="inline-start" />}
          Send {approved.length} approved message{approved.length > 1 ? "s" : ""}
        </Button>
      )}
    </div>
  );
}
