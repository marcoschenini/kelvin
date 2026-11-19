import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { ResetDemoButton } from "@/components/settings/reset-demo";
import { RulesForm } from "@/components/settings/rules-form";
import { ThemeToggle } from "@/components/shell/theme";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { dbMode, getDb } from "@/lib/db/client";
import { storageMode } from "@/lib/storage";
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
    <div className="flex flex-col gap-4">
      <dl className="num grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
      <div>
        <dt className="eyebrow text-[10.5px] text-muted-foreground">Provider</dt>
        <dd className="mt-1 font-medium">{provider}</dd>
      </div>
      <div>
        <dt className="eyebrow text-[10.5px] text-muted-foreground">Model</dt>
        <dd className="mt-1 font-mono text-[13px]">{model}</dd>
      </div>
      <div>
        <dt className="eyebrow text-[10.5px] text-muted-foreground">Effort</dt>
        <dd className="mt-1 font-medium">{process.env.AI_EFFORT ?? "medium"}</dd>
      </div>
      <div>
        <dt className="eyebrow text-[10.5px] text-muted-foreground">Mode</dt>
        <dd className={live ? "mt-1 font-medium text-success-fg" : "mt-1 font-medium text-warning-fg"}>
          {live ? "Live model with tools" : "Deterministic planner (no API key set)"}
        </dd>
      </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Set AI_PROVIDER, AI_MODEL, AI_EFFORT and ANTHROPIC_API_KEY or OPENROUTER_API_KEY in .env.local, then restart the server.
      </p>
    </div>
  );
}

async function DataSection() {
  await connection();
  const hosted = dbMode() === "supabase";
  const files = storageMode();
  let host = "";
  try {
    if (hosted && process.env.DATABASE_URL) host = new URL(process.env.DATABASE_URL).hostname;
  } catch {
    /* malformed URL: the database open already reports it */
  }
  return (
    <div className="flex flex-col gap-4">
      <dl className="num grid grid-cols-2 gap-4 text-sm lg:grid-cols-3">
      <div>
        <dt className="eyebrow text-[10.5px] text-muted-foreground">Database</dt>
        <dd className="mt-1 font-medium">{hosted ? "Supabase Postgres" : "Embedded Postgres (PGlite)"}</dd>
        {host ? <dd className="mt-1 truncate font-mono text-[12px] text-muted-foreground">{host}</dd> : null}
      </div>
      <div>
        <dt className="eyebrow text-[10.5px] text-muted-foreground">Documents</dt>
        <dd className="mt-1 font-medium">{files === "supabase" ? `Supabase Storage · ${process.env.SUPABASE_BUCKET || "kelvin-documents"}` : "Files on this server"}</dd>
      </div>
      <div>
        <dt className="eyebrow text-[10.5px] text-muted-foreground">Sharing</dt>
        <dd className={hosted && files === "supabase" ? "mt-1 font-medium text-success-fg" : "mt-1 font-medium text-warning-fg"}>
          {hosted && files === "supabase" ? "Shared by every instance and developer" : hosted ? "Database shared, documents local" : "This machine only"}
        </dd>
      </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        Set DB_MODE=supabase, DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to use Supabase. Seed it once with npm run seed. Reset demo resets the data for everyone using it.
      </p>
    </div>
  );
}

/** One settings row: label column on the left (4 of 12), content on the right (8 of 12). */
function Row({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="grid grid-cols-1 gap-5 px-6 py-7 lg:grid-cols-12 lg:gap-8 lg:px-8">
      <div className="lg:col-span-4">
        <h2 id={id} className="text-[1.15rem] leading-tight font-semibold">
          {title}
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0 lg:col-span-8">{children}</div>
    </section>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="eyebrow font-sans text-muted-foreground">{label}</h2>
      <div className="divide-y divide-border surface">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <PageContainer className="flex flex-col gap-10">
      <PageHeader eyebrow="Workspace" title="Settings" description="Analysis engine, rules configuration, data, appearance and demo reset." />

      <Group label="Analysis">
        <Row id="engine" title="Analysis engine" description="Configured through environment variables.">
          <Suspense fallback={<Skeleton className="h-12 w-full" />}>
            <ModelSection />
          </Suspense>
        </Row>
        <Row id="rules" title="Rules" description="Values the rules engine uses for caps and deadlines. Decision support only, not legal advice.">
          <Suspense fallback={<Skeleton className="h-16 w-full" />}>
            <RulesSection />
          </Suspense>
        </Row>
      </Group>

      <Group label="Workspace">
        <Row id="data" title="Data" description="Where cases, the audit trail and documents are stored.">
          <Suspense fallback={<Skeleton className="h-12 w-full" />}>
            <DataSection />
          </Suspense>
        </Row>
        <Row id="appearance" title="Appearance" description="Light theme by default. The dark theme stays available for dim rooms.">
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
              <div>
                <div className="text-sm font-medium">Theme</div>
                <div className="text-xs text-muted-foreground">Switch between light and dark.</div>
              </div>
              <ThemeToggle className="size-9 border border-border" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border px-4 py-3">
              <div>
                <div className="text-sm font-medium">Design system</div>
                <div className="text-xs text-muted-foreground">Colours, type, components and the status vocabulary used across Kelvin.</div>
              </div>
              <Link href="/design" className={cn(buttonVariants({ variant: "outline" }))}>
                Open design system
                <ArrowRight data-icon="inline-end" />
              </Link>
            </div>
          </div>
        </Row>
        <Row id="demo" title="Demo reset" description="Re-seeds demo cases A, B and C with dates anchored to today, so deadlines count down correctly on demo day.">
          <ResetDemoButton />
        </Row>
      </Group>
    </PageContainer>
  );
}
