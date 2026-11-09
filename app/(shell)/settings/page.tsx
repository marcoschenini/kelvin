import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { Bot, Database, RotateCcw, Scale } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { ResetDemoButton } from "@/components/settings/reset-demo";
import { RulesForm } from "@/components/settings/rules-form";
import { SectionHeader } from "@/components/kit/surfaces";
import { Skeleton } from "@/components/ui/skeleton";
import { getDb } from "@/lib/db/client";
import { DEFAULT_MODEL, hasModelCredentials, providerName } from "@/lib/agent/provider";
import { loadRules } from "@/lib/rules/load";

export const metadata: Metadata = { title: "Settings" };

async function RulesSection() {
  await connection();
  const rules = await loadRules(await getDb());
  return <RulesForm rules={rules} />;
}

async function ModelSection() {
  await connection();
  const live = hasModelCredentials();
  const provider = providerName();
  const model = process.env.AI_MODEL ?? (provider === "openrouter" ? `anthropic/${DEFAULT_MODEL}` : DEFAULT_MODEL);
  return (
    <dl className="num grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
      <div>
        <dt className="text-xs text-muted-foreground">Provider</dt>
        <dd className="mt-0.5 font-medium">{provider}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Model</dt>
        <dd className="mt-0.5 font-mono text-[13px]">{model}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Effort</dt>
        <dd className="mt-0.5 font-medium">{process.env.AI_EFFORT ?? "medium"}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Agent mode</dt>
        <dd className={live ? "mt-0.5 font-medium text-success-fg" : "mt-0.5 font-medium text-warning-fg"}>
          {live ? "Live (LLM with tools)" : "Deterministic planner (no API key set)"}
        </dd>
      </div>
      <p className="col-span-full text-xs text-muted-foreground">
        Set AI_PROVIDER, AI_MODEL, AI_EFFORT and ANTHROPIC_API_KEY or OPENROUTER_API_KEY in .env.local, then restart the server.
      </p>
    </dl>
  );
}

export default function SettingsPage() {
  return (
    <PageContainer className="flex flex-col gap-8">
      <PageHeader title="Settings" description="Model and provider, rules configuration and demo reset." />

      <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-card">
        <SectionHeader icon={Bot} title="Agent model" description="Configured through environment variables" />
        <Suspense fallback={<Skeleton className="h-12 w-full" />}>
          <ModelSection />
        </Suspense>
      </section>

      <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 shadow-card">
        <SectionHeader icon={Scale} title="Rules" description="Values the rules engine uses for caps and deadlines. Decision support only, not legal advice." />
        <Suspense fallback={<Skeleton className="h-16 w-full" />}>
          <RulesSection />
        </Suspense>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-card">
        <SectionHeader
          icon={RotateCcw}
          title="Demo reset"
          description="Re-seeds demo cases A, B and C with dates anchored to today, so deadlines count down correctly on demo day."
        />
        <ResetDemoButton />
      </section>

      <section className="flex items-center gap-4 rounded-2xl border border-border bg-card p-6 shadow-card">
        <SectionHeader
          icon={Database}
          title="Data"
          description={`Mode: ${process.env.DB_MODE === "supabase" ? "Supabase (hosted Postgres)" : "Local (embedded Postgres in .data/)"}`}
        />
      </section>
    </PageContainer>
  );
}
