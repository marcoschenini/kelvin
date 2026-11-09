CREATE TABLE "agent_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"kind" text NOT NULL,
	"mode" text NOT NULL,
	"model" text,
	"status" text NOT NULL,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"recording_path" text
);
--> statement-breakpoint
CREATE TABLE "agent_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"case_id" text NOT NULL,
	"seq" integer NOT NULL,
	"tool" text NOT NULL,
	"summary" text,
	"input" jsonb,
	"output" jsonb,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"case_id" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_name" text NOT NULL,
	"actor_role" text,
	"event_type" text NOT NULL,
	"tool" text,
	"input" jsonb,
	"output" jsonb,
	"model" text,
	"duration_ms" integer,
	"run_id" text
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" text PRIMARY KEY NOT NULL,
	"shipment_ref" text NOT NULL,
	"title" text NOT NULL,
	"scenario" text NOT NULL,
	"code" text,
	"product" text,
	"awb_number" text,
	"origin" text,
	"destination" text,
	"value_eur" double precision,
	"weight_kg" double precision,
	"declared_value_eur" double precision,
	"shipper_name" text,
	"consignee_name" text,
	"status" text DEFAULT 'new' NOT NULL,
	"owner_persona_id" text,
	"delivered_at" timestamp with time zone,
	"discovered_at" timestamp with time zone,
	"recommended_route" text,
	"nearest_deadline_at" timestamp with time zone,
	"nearest_deadline_label" text,
	"nearest_deadline_window_days" integer,
	"claim_amount_eur" double precision,
	"recovered_eur" double precision,
	"closed_reason" text,
	"record" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"gate" text NOT NULL,
	"decision" text NOT NULL,
	"note" text,
	"draft_id" text,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_pages" (
	"document_id" text NOT NULL,
	"page" integer NOT NULL,
	"text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"storage_path" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"pages" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"kind" text NOT NULL,
	"route" text,
	"recipient_name" text NOT NULL,
	"recipient_email" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"amount_eur" double precision,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"annexes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"case_id" text NOT NULL,
	"direction" text NOT NULL,
	"draft_id" text,
	"approval_decision_id" text,
	"counterparty" text NOT NULL,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"simulated" boolean DEFAULT true NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_out_requires_approval" CHECK ("outbox_messages"."direction" = 'in' OR "outbox_messages"."approval_decision_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drafts" ADD CONSTRAINT "drafts_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_approval_decision_id_decisions_id_fk" FOREIGN KEY ("approval_decision_id") REFERENCES "public"."decisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_runs_case_idx" ON "agent_runs" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "agent_steps_run_idx" ON "agent_steps" USING btree ("run_id","seq");--> statement-breakpoint
CREATE INDEX "audit_case_idx" ON "audit_events" USING btree ("case_id","at");--> statement-breakpoint
CREATE INDEX "cases_status_idx" ON "cases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cases_scenario_idx" ON "cases" USING btree ("scenario");--> statement-breakpoint
CREATE INDEX "decisions_case_idx" ON "decisions" USING btree ("case_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_pages_pk" ON "document_pages" USING btree ("document_id","page");--> statement-breakpoint
CREATE INDEX "documents_case_idx" ON "documents" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "drafts_case_idx" ON "drafts" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "outbox_case_idx" ON "outbox_messages" USING btree ("case_id","at");