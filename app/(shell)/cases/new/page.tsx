import type { Metadata } from "next";
import { UploadCloud } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/kit/surfaces";

export const metadata: Metadata = { title: "New case" };

export default function NewCasePage() {
  return (
    <PageContainer className="flex flex-col gap-8">
      <PageHeader
        title="New case"
        description="Drop the logger CSV, air waybill, contract, policy and invoice. The agent starts on its own."
      />
      <EmptyState
        icon={UploadCloud}
        title="Upload arrives in milestone 2"
        description="Drag-and-drop intake and the demo cases A, B and C are built with the data model and seed generator."
      />
    </PageContainer>
  );
}
