import type { Metadata } from "next";
import { Database, RotateCcw, Settings2 } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { ResetDemoButton } from "@/components/settings/reset-demo";
import { EmptyState, SectionHeader } from "@/components/kit/surfaces";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PageContainer className="flex flex-col gap-8">
      <PageHeader title="Settings" description="Model and provider, rules configuration and demo reset." />

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

      <EmptyState
        icon={Settings2}
        title="Model and rules settings arrive with the agent"
        description="Provider and model selection, the SDR rate and the early-notice threshold are wired up in milestone 3."
      />
    </PageContainer>
  );
}
