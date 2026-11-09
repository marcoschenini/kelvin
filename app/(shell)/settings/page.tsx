import type { Metadata } from "next";
import { Settings2 } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/kit/surfaces";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <PageContainer className="flex flex-col gap-8">
      <PageHeader title="Settings" description="Model and provider, rules configuration and demo reset." />
      <EmptyState
        icon={Settings2}
        title="Settings arrive with the rules engine"
        description="SDR rate, early-notice threshold and provider selection are wired up in milestone 3."
      />
    </PageContainer>
  );
}
