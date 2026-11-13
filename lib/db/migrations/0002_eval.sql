CREATE TABLE "eval_results" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"case_id" text NOT NULL,
	"title" text NOT NULL,
	"tests" text NOT NULL,
	"key" jsonb NOT NULL,
	"actual" jsonb NOT NULL,
	"checks" jsonb NOT NULL,
	"correct" boolean NOT NULL,
	"citation_coverage" double precision,
	"duration_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"model" text,
	"status" text NOT NULL,
	"total" integer NOT NULL,
	"summary" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_run_id_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eval_results_run_idx" ON "eval_results" USING btree ("run_id");