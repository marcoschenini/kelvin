import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { CaseStatus } from "@/lib/domain/case-status";
import type { RecoveryRoute } from "@/lib/domain/parties";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/* ------------------------------------------------------------------ cases */

export type CaseScenario = "demo" | "eval" | "upload";

export const cases = pgTable(
  "cases",
  {
    id: text("id").primaryKey(),
    /** Shipment reference shown in the UI, e.g. "RB-260417" */
    shipmentRef: text("shipment_ref").notNull(),
    title: text("title").notNull(),
    scenario: text("scenario").$type<CaseScenario>().notNull(),
    /** "A" | "B" | "C" for demo cases, "E07" for eval cases */
    code: text("code"),
    product: text("product"),
    awbNumber: text("awb_number"),
    origin: text("origin"),
    destination: text("destination"),
    valueEur: doublePrecision("value_eur"),
    weightKg: doublePrecision("weight_kg"),
    /** null = "NVD" (no value declared for carriage) */
    declaredValueEur: doublePrecision("declared_value_eur"),
    shipperName: text("shipper_name"),
    consigneeName: text("consignee_name"),
    status: text("status").$type<CaseStatus>().notNull().default("new"),
    ownerPersonaId: text("owner_persona_id"),
    deliveredAt: ts("delivered_at"),
    discoveredAt: ts("discovered_at"),
    /** Filled by the agent (milestone 3) */
    recommendedRoute: text("recommended_route").$type<RecoveryRoute>(),
    nearestDeadlineAt: ts("nearest_deadline_at"),
    nearestDeadlineLabel: text("nearest_deadline_label"),
    nearestDeadlineWindowDays: integer("nearest_deadline_window_days"),
    claimAmountEur: doublePrecision("claim_amount_eur"),
    recoveredEur: doublePrecision("recovered_eur"),
    closedReason: text("closed_reason"),
    /** Shared case record the agent reads and writes (excursions, custody, routes, deadlines…) */
    record: jsonb("record").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("cases_status_idx").on(t.status), index("cases_scenario_idx").on(t.scenario)],
);

/* -------------------------------------------------------------- documents */

export const DOCUMENT_KINDS = [
  "logger",
  "awb",
  "handling_events",
  "handling_report",
  "contract",
  "policy",
  "invoice",
  "email",
  "evidence_pack",
  "other",
] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    kind: text("kind").$type<DocumentKind>().notNull(),
    title: text("title").notNull(),
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    storagePath: text("storage_path").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    pages: integer("pages"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("documents_case_idx").on(t.caseId)],
);

/** Extracted text per page, cached by extract_document. */
export const documentPages = pgTable(
  "document_pages",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    page: integer("page").notNull(),
    text: text("text").notNull(),
  },
  (t) => [uniqueIndex("document_pages_pk").on(t.documentId, t.page)],
);

/* ------------------------------------------------------------- agent runs */

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    /** "investigate" | "follow_up" | "eval" */
    kind: text("kind").notNull(),
    mode: text("mode").$type<"live" | "replay" | "deterministic">().notNull(),
    model: text("model"),
    status: text("status").$type<"running" | "completed" | "failed">().notNull(),
    error: text("error"),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
    recordingPath: text("recording_path"),
  },
  (t) => [index("agent_runs_case_idx").on(t.caseId)],
);

export const agentSteps = pgTable(
  "agent_steps",
  {
    id: text("id").primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    caseId: text("case_id").notNull(),
    seq: integer("seq").notNull(),
    /** Tool name, or "thinking" / "message" for model text */
    tool: text("tool").notNull(),
    summary: text("summary"),
    input: jsonb("input"),
    output: jsonb("output"),
    citations: jsonb("citations").$type<unknown[]>().notNull().default([]),
    status: text("status").$type<"running" | "ok" | "error">().notNull(),
    startedAt: ts("started_at").notNull().defaultNow(),
    durationMs: integer("duration_ms"),
  },
  (t) => [index("agent_steps_run_idx").on(t.runId, t.seq)],
);

/* ----------------------------------------------------------- audit (append-only) */

export type ActorType = "agent" | "human" | "system" | "counterparty";

/**
 * Append-only. A database trigger (see migrations/0001_audit_append_only.sql)
 * rejects UPDATE and DELETE. Demo reset uses TRUNCATE.
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    caseId: text("case_id"),
    at: ts("at").notNull().defaultNow(),
    actorType: text("actor_type").$type<ActorType>().notNull(),
    actorName: text("actor_name").notNull(),
    actorRole: text("actor_role"),
    eventType: text("event_type").notNull(),
    tool: text("tool"),
    input: jsonb("input"),
    output: jsonb("output"),
    model: text("model"),
    durationMs: integer("duration_ms"),
    runId: text("run_id"),
  },
  (t) => [index("audit_case_idx").on(t.caseId, t.at)],
);

/* ------------------------------------------------------- human decisions */

export type GateKind = "qa" | "approval";

export const decisions = pgTable(
  "decisions",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    gate: text("gate").$type<GateKind>().notNull(),
    /** qa: released | rejected; approval: approved | approved_with_edits | rejected */
    decision: text("decision").notNull(),
    note: text("note"),
    draftId: text("draft_id"),
    actorName: text("actor_name").notNull(),
    actorRole: text("actor_role").notNull(),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("decisions_case_idx").on(t.caseId)],
);

/* ------------------------------------------------------------------ drafts */

export type DraftKind = "protective_notice" | "claim_letter" | "info_request" | "reply";

export const drafts = pgTable(
  "drafts",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    kind: text("kind").$type<DraftKind>().notNull(),
    route: text("route").$type<RecoveryRoute>(),
    recipientName: text("recipient_name").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    amountEur: doublePrecision("amount_eur"),
    citations: jsonb("citations").$type<unknown[]>().notNull().default([]),
    annexes: jsonb("annexes").$type<string[]>().notNull().default([]),
    status: text("status").$type<"draft" | "awaiting_approval" | "approved" | "sent" | "rejected">().notNull(),
    version: integer("version").notNull().default(1),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("drafts_case_idx").on(t.caseId)],
);

/* ------------------------------------------------------------------ outbox */

/**
 * Simulated mail. Nothing ever leaves the app. Outgoing rows must reference an
 * approval decision: enforced by a CHECK constraint, not only in code.
 */
export const outboxMessages = pgTable(
  "outbox_messages",
  {
    id: text("id").primaryKey(),
    caseId: text("case_id")
      .notNull()
      .references(() => cases.id, { onDelete: "cascade" }),
    direction: text("direction").$type<"out" | "in">().notNull(),
    draftId: text("draft_id"),
    approvalDecisionId: text("approval_decision_id").references(() => decisions.id),
    counterparty: text("counterparty").notNull(),
    fromAddress: text("from_address").notNull(),
    toAddress: text("to_address").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    attachments: jsonb("attachments").$type<string[]>().notNull().default([]),
    simulated: boolean("simulated").notNull().default(true),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [
    index("outbox_case_idx").on(t.caseId, t.at),
    check("outbox_out_requires_approval", sql`${t.direction} = 'in' OR ${t.approvalDecisionId} IS NOT NULL`),
  ],
);

/* ---------------------------------------------------------------- settings */

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export type CaseRow = typeof cases.$inferSelect;
export type NewCaseRow = typeof cases.$inferInsert;
export type DocumentRow = typeof documents.$inferSelect;
export type AuditEventRow = typeof auditEvents.$inferSelect;
export type DecisionRow = typeof decisions.$inferSelect;
export type DraftRow = typeof drafts.$inferSelect;
export type OutboxRow = typeof outboxMessages.$inferSelect;
