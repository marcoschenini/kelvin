"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db/client";
import { PERSONA_COOKIE, getPersona } from "@/lib/domain/personas";
import { GateError, recordApproval, recordQaDecision } from "@/lib/case/gates";

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
    await recordApproval(await getDb(), caseId, { ...args, actor: await actor() });
    revalidatePath(`/cases/${caseId}`);
    return { ok: true };
  } catch (e) {
    if (e instanceof GateError) return { ok: false, error: e.message };
    throw e;
  }
}
