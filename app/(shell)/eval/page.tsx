import type { Metadata } from "next";
import { FlaskConical } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/kit/surfaces";

export const metadata: Metadata = { title: "Evaluation" };

export default function EvalPage() {
  return (
    <PageContainer className="flex flex-col gap-8">
      <PageHeader
        title="Evaluation"
        description="Route accuracy, deadline accuracy and citation coverage across the evaluation cases."
      />
      <EmptyState
        icon={FlaskConical}
        title="No evaluation runs yet"
        description="The harness and its 20+ answer-keyed cases arrive in milestone 6."
      />
    </PageContainer>
  );
}
