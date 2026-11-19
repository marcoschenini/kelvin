import type { RunKind } from "@/lib/agent/events";

export interface AutoStartInput {
  busy: boolean;
  status: string;
  qa: "pending" | "released" | "rejected";
  closed: boolean;
  hasClaimLetterAwaitingApproval: boolean;
  hasApprovedDrafts: boolean;
  hasUnhandled: boolean;
  runs: { kind: string; status: string; finishedAt: Date | null }[];
  docs: { createdAt: Date }[];
}

/** Which run Kelvin starts on its own when a case page opens (null = nothing to do). */
export function decideAutoStart(i: AutoStartInput): RunKind | null {
  if (i.busy) return null;
  if (i.status === "new") return "investigate";
  if ((i.status === "awaiting_qa" && i.qa === "rejected") || (i.status === "claim_prepared" && !i.hasClaimLetterAwaitingApproval)) {
    // A completed prepare_claim that produced no letter (documents missing) must not loop: retry only after new documents arrive.
    const last = i.runs.filter((r) => r.kind === "prepare_claim" && r.status === "completed" && r.finishedAt).sort((a, b) => b.finishedAt!.getTime() - a.finishedAt!.getTime())[0];
    const newestDoc = Math.max(0, ...i.docs.map((d) => d.createdAt.getTime()));
    return last && newestDoc <= last.finishedAt!.getTime() ? null : "prepare_claim";
  }
  if (i.status === "no_claim") return "close";
  return !i.closed && (i.hasApprovedDrafts || i.hasUnhandled) ? "follow_up" : null;
}
