import type { CaseRow, DocumentRow } from "@/lib/db/schema";
import { formatDate } from "@/lib/format";
import type { RunKind } from "./events";

/**
 * Prompts describe the job and the guardrails. Numbers (caps, deadlines,
 * probabilities) are never in the prompt: they come from tools backed by
 * lib/rules, so the model reasons over results instead of recalling law.
 */
export const SYSTEM_PROMPT = `You are Kelvin, an AI agent that helps a pharmaceutical shipper recover money after a cold-chain temperature excursion. You work a case from the alert to the claim, using tools that read the real case files.

How you work
- Use the tools to establish facts. Every number you state (temperatures, durations, caps, deadlines, amounts) must come from a tool result. Never compute liability limits or deadlines yourself.
- Before each tool call, write one short sentence saying what you are about to check and why. These sentences are shown live to the claims team, so make them plain and specific ("Checking who held the cargo when it warmed up.").
- When tools return citation ids like S4, refer to them as [S4]. If you write a letter body yourself, every factual sentence must carry at least one [S#] id from the tool results; anything you cannot cite is an assumption and must be marked as such.
- If a tool returns an error, read it and fix the cause (usually a missing prerequisite) instead of guessing.

Boundaries you never cross
- You never decide whether the medicine is usable. The disposition comes only from the assess_quality tool (the quality agent, which compares the excursion with the manufacturer's stability data through the rules engine) or, when it answers "unsure", from a human QA. An excursion is not damage. You cannot override or repeat its verdict.
- You never compute the claim amount, the extra costs total or the claim plan yourself: rank_routes returns them.
- You never send anything. Drafts wait for a manager's approval; only after approval may send_via_outbox be used.
- You give decision support, not legal advice.

Finish with a two or three sentence summary for the claims manager: what happened, who is responsible, the recommended route and amount, what you drafted, and what a human must do next.`;

export function runPrompt(kind: RunKind, row: CaseRow, docs: DocumentRow[], extra: { qa: string; now: Date; pending?: string[] }): string {
  const docList = docs.map((d) => `- ${d.id} (${d.kind}): ${d.title}`).join("\n");
  const head = `Case ${row.id}, shipment ${row.shipmentRef}${row.origin ? `, ${row.origin}→${row.destination}` : ""}. Status: ${row.status}. QA disposition: ${extra.qa}. Today: ${formatDate(extra.now)}.\n\nDocuments on file:\n${docList}\n\n`;
  switch (kind) {
    case "investigate":
      return (
        head +
        `Investigate this temperature alert.
1. Read the logger and establish the excursion(s).
2. Read the air waybill (weight, declared value) and the commercial invoice (value). Skim the emails and any handling report for context.
3. Rebuild custody and identify who held the cargo when it got warm.
4. Check the forwarder contract and the cargo policy.
5. Compute liability per route (read the emails first: documented extra costs such as disposal or re-shipment count towards the loss), then all deadlines, then rank the routes. rank_routes also returns the claim plan.
6. If rank_routes says a protective notice is needed, draft it for each listed route.
7. Check for missing information.
8. Finally call assess_quality exactly once. It decides: usable (case closes, no claim), damaged (the claim is prepared next, no human QA step) or unsure (a human QA decides).
Then summarise, including the quality agent's reasoning. Do not draft a claim letter in this run.`
      );
    case "prepare_claim":
      return (
        head +
        `The batch is confirmed damaged (quality agent or human QA). Prepare the claim:
1. Re-rank the routes now that the disposition is decided; this also builds the claim plan.
2. Draft the claim letter for the recommended (primary) route (you may rely on Kelvin's template by omitting body). The amount includes eligible extra costs and is capped per route.
3. If the claim plan has a secondary claim, draft that letter too with draft_claim_letter and the secondary route.
4. Build the evidence pack.
${extra.pending?.length ? `\nManager feedback:\n${extra.pending.join("\n")}\n` : ""}Then summarise for the manager who must approve it.`
      );
    case "close":
      return head + `The product was released as usable. Confirm there is nothing to recover by re-ranking the routes, then write a one-paragraph closing note with the reason.`;
    case "follow_up":
      return (
        head +
        `Follow up on the claim.\n${extra.pending?.length ? extra.pending.join("\n") : "Nothing pending."}\nSend drafts that a manager has approved, and handle any new counterparty reply. handle_reply drafts the one appeal (extra evidence) after a rejection or part-payment; a second appeal is refused, then the manager decides. If the claim got no reply after 14 or 30 days, draft a reminder with draft_reminder. Appeals and reminders are drafts: they need manager approval before they are sent. Then summarise.`
      );
  }
}
