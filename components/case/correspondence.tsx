import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, BellRing, FileText, Paperclip, PenLine, Repeat2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Message {
  id: string;
  direction: "in" | "out";
  counterparty: string;
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  attachments: string[];
  at: string;
  draftId: string | null;
}

interface PendingDraft {
  id: string;
  kind: string;
  status: string;
  subject: string;
  recipientName: string;
  body: string;
  citations: number;
}

const STATUS_STYLE: Record<string, string> = {
  awaiting_approval: "bg-human-soft text-human-fg",
  approved: "bg-ai-soft text-ai-fg",
  draft: "bg-muted text-muted-foreground",
  rejected: "bg-muted text-subtle line-through",
};

export interface FollowUpInfo {
  appealDraftIds: string[];
  remindersSent: number[];
}

/** Appeals are known from the case record; reminders are reply drafts whose subject says so. */
function followUpKind(kind: string, subject: string, draftId: string | null, f: FollowUpInfo): "appeal" | "reminder" | null {
  if (draftId && f.appealDraftIds.includes(draftId)) return "appeal";
  if (kind === "reply" && /remind/i.test(subject)) return "reminder";
  if (kind === "reply" && /appeal/i.test(subject)) return "appeal";
  return null;
}

function FollowUpTag({ kind }: { kind: "appeal" | "reminder" }) {
  const Icon = kind === "appeal" ? Repeat2 : BellRing;
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-full bg-warning-soft px-2 text-[11px] font-medium text-warning-fg ring-1 ring-warning/25 ring-inset">
      <Icon className="size-3" aria-hidden="true" />
      {kind === "appeal" ? "Appeal" : "Reminder"}
    </span>
  );
}

/** The simulated Outbox as a conversation: what we sent, what came back, and drafts in progress. */
export function CorrespondenceThread({ caseId, messages, drafts, followUp = { appealDraftIds: [], remindersSent: [] } }: { caseId: string; messages: Message[]; drafts: PendingDraft[]; followUp?: FollowUpInfo }) {
  if (!messages.length && !drafts.length) return <p className="text-sm text-muted-foreground">Nothing drafted or sent yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      {(followUp.appealDraftIds.length > 0 || followUp.remindersSent.length > 0) && (
        <p className="text-xs text-muted-foreground">
          Follow-up: {followUp.appealDraftIds.length > 0 ? "1 appeal" : "no appeal"}
          {followUp.remindersSent.length > 0 ? `, reminders after ${followUp.remindersSent.join(" and ")} days without a reply` : ""}.
        </p>
      )}
      {messages.length > 0 && (
        <ol className="flex flex-col gap-2.5">
          {messages.map((m) => {
            const out = m.direction === "out";
            const tag = out ? followUpKind("reply", m.subject, m.draftId, followUp) ?? (followUp.appealDraftIds.includes(m.draftId ?? "") ? "appeal" : null) : null;
            return (
              <li key={m.id} className={cn("flex", out ? "justify-end" : "justify-start")}>
                <details className={cn("group w-full max-w-[44rem] rounded-2xl border px-4 py-3", out ? "rounded-br-md border-ai-from/20 bg-ai-soft/50" : "rounded-bl-md border-border bg-card")}>
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {out ? <ArrowUpRight className="size-3.5 text-ai-fg" aria-hidden="true" /> : <ArrowDownLeft className="size-3.5" aria-hidden="true" />}
                        {out ? `To ${m.toAddress}` : `From ${m.counterparty} <${m.fromAddress}>`}
                      </span>
                      <span className="num">{formatDateTime(m.at)} UTC</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-medium">
                      {m.subject}
                      {tag && <FollowUpTag kind={tag} />}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground group-open:hidden">{m.body.replace(/\s+/g, " ")}</p>
                  </summary>
                  <pre className="mt-2 font-sans text-sm whitespace-pre-wrap text-foreground/90">{m.body}</pre>
                  {m.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.attachments.map((a) => (
                        <span key={a} className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          <Paperclip className="size-3" aria-hidden="true" />
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 text-[11px] text-subtle">Simulated: nothing leaves Kelvin.</div>
                </details>
              </li>
            );
          })}
        </ol>
      )}

      {drafts.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="eyebrow text-muted-foreground">Drafts</div>
          {drafts.map((d) => {
            const tag = followUpKind(d.kind, d.subject, d.id, followUp);
            return (
            <div key={d.id} className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm">
              {d.kind === "claim_letter" ? <FileText className="size-4 text-muted-foreground" aria-hidden="true" /> : <PenLine className="size-4 text-muted-foreground" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-medium">
                  <span className="truncate">{d.subject}</span>
                  {tag && <FollowUpTag kind={tag} />}
                </span>
                <span className="text-xs text-muted-foreground">
                  To {d.recipientName} · {d.citations} citations
                </span>
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[d.status] ?? "bg-muted")}>{d.status.replace(/_/g, " ")}</span>
              {d.status !== "rejected" && (
                <Link href={`/cases/${caseId}/approve/${d.id}`} className="text-xs font-medium text-ai-fg hover:underline">
                  Open
                </Link>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
