import type { RunKind } from "../events";
import type { KelvinTool } from "../tool";
import { computeDeadlinesTool, computeLiabilityTool, rankRoutesTool } from "./decide";
import { draftClaimLetter, draftProtectiveNotice, requestMissingInfo } from "./drafts";
import { buildEvidencePackTool, draftAppealTool, draftReminderTool, handleReply, sendViaOutbox } from "./followup";
import { assessQuality } from "./quality";
import { buildCustodyTimeline, checkContract, checkPolicy, extractDocument, parseLogger } from "./investigate";

/** All 17 tools: the brief's 14, plus the quality agent, the appeal and the reminder. */
export const ALL_TOOLS = [
  parseLogger,
  extractDocument,
  buildCustodyTimeline,
  checkContract,
  checkPolicy,
  computeLiabilityTool,
  computeDeadlinesTool,
  rankRoutesTool,
  draftProtectiveNotice,
  draftClaimLetter,
  buildEvidencePackTool,
  requestMissingInfo,
  sendViaOutbox,
  handleReply,
  assessQuality,
  draftAppealTool,
  draftReminderTool,
] as KelvinTool[];

const byName = Object.fromEntries(ALL_TOOLS.map((t) => [t.name, t]));
export function getTool(name: string): KelvinTool {
  const t = byName[name];
  if (!t) throw new Error(`Unknown tool ${name}`);
  return t;
}

/** Tools offered to the model per run. Guards inside the tools still apply. */
export const TOOLS_FOR_RUN: Record<RunKind, string[]> = {
  investigate: [
    "parse_logger",
    "extract_document",
    "build_custody_timeline",
    "check_contract",
    "check_policy",
    "compute_liability",
    "compute_deadlines",
    "rank_routes",
    "draft_protective_notice",
    "request_missing_info",
    "assess_quality",
  ],
  prepare_claim: ["extract_document", "compute_liability", "compute_deadlines", "rank_routes", "draft_claim_letter", "build_evidence_pack", "request_missing_info"],
  close: ["compute_liability", "rank_routes"],
  follow_up: ["send_via_outbox", "handle_reply", "draft_appeal", "draft_reminder", "extract_document", "rank_routes"],
};
