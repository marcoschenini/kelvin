"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { PERSONA_COOKIE, getPersona } from "@/lib/domain/personas";
import { eq } from "drizzle-orm";
import { drafts } from "@/lib/db/schema";
import { GateError, recordApproval, recordQaDecision, recordSettlement } from "@/lib/case/gates";
import { getRecord } from "@/lib/case/record";
import { validateLetter } from "@/lib/agent/letters";
import { deliverDueReplies } from "@/lib/counterparties/scripted";

async function actor() {
  return getPersona((await cookies()).get(PERSONA_COOKIE)?.value);
}

export type ActionResult = { ok: true } | { ok: false, error: string };

export async function qaDecisionAction(caseId: string, decision: "released" | "rejected", note?: string): Promise<ActionResult> {
  try {
    await recordQaDecision(await getDb(), caseId, { decision, note, actor: await actor() });
    revalidatePath(`/cases/${caseId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof GateError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function approvalAction(
  caseId: string,
  args: { draftId: string; decision: "approved" | "approved_with_edits" | "rejected"; reason?: string; editedBody?: string; editedSubject?: string },
): Promise<ActionResult> {
  try {
    const db = await getDb();
    await recordApproval(db, caseId, { ...args, actor: await actor() });
    if (args.decision === "approved_with_edits" && args.editedBody) {
      // Re-check sources on the edited text: new uncited paragraphs become visible assumptions.
      const record = await getRecord(db, caseId);
      const check = validateLetter(args.editedBody, record.citations ?? {});
      await db.update(drafts).set({ citations: [...check.used, ...check.assumptions] }).where(eq(drafts.id, args.draftId));
    }
    revalidatePath(`/cases/${caseId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof GateError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function settlementAction(caseId: string, decision: "accept" | "counter", note?: string): Promise<ActionResult> {
  try {
    await recordSettlement(await getDb(), caseId, { decision, note, actor: await actor() });
    revalidatePath(`/cases/${caseId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof GateError) return { ok: false, error: e.message };
    throw e;
  }
}

/** Simulated counterparties answer anything in the Outbox that has not been answered yet. */
export async function deliverRepliesAction(caseId: string): Promise<{ delivered: number }> {
  const replies = await deliverDueReplies(await getDb(), caseId);
  if (replies.length) revalidatePath(`/cases/${caseId}`);
  return { delivered: replies.length };
}
