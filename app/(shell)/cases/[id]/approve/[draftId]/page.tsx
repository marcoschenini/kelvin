import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ApprovalScreen } from "@/components/approval/approval-screen";
import { CitationViewerProvider } from "@/components/documents/citation-viewer";
import { PageContainer } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { CaseRecord } from "@/lib/case/record";
import type { Citation } from "@/lib/domain/citation";
import { formatDateTime, formatDuration, formatTemp } from "@/lib/format";
import { getCase, listDocuments, listDrafts } from "@/lib/queries/cases";

export const metadata: Metadata = { title: "Review and approve" };

async function Content({ params }: { params: Promise<{ id: string; draftId: string }> }) {
  await connection();
  const { id, draftId } = await params;
  const [c, drafts, docs] = await Promise.all([getCase(id), listDrafts(id), listDocuments(id)]);
  const draft = drafts.find((d) => d.id === draftId);
  if (!c || !draft) notFound();
  const record = c.record as CaseRecord;
  const ex = record.excursions?.find((e) => e.direction === "high") ?? record.excursions?.[0];
  const route = draft.route ?? c.recommendedRoute;
  const deadline = record.deadlines?.find((d) => d.route === route && d.kind === "notice") ?? null;
  return (
    <ApprovalScreen
      draft={{
        id: draft.id,
        kind: draft.kind,
        subject: draft.subject,
        body: draft.body,
        recipientName: draft.recipientName,
        recipientEmail: draft.recipientEmail,
        amountEur: draft.amountEur,
        annexes: draft.annexes,
        citations: draft.citations as Citation[],
        status: draft.status,
      }}
      ctx={{
        caseId: c.id,
        shipmentRef: c.shipmentRef,
        route: route ?? null,
        excursion: ex ? `${formatTemp(ex.peakC)} peak, ${formatDuration(ex.minutes)} above 8 °C from ${formatDateTime(ex.start)} UTC` : null,
        custodian: record.custody?.attribution ? `${record.custody.attribution.custodian} at ${record.custody.attribution.location}` : null,
        deadline: deadline ? { label: deadline.label, daysLeft: deadline.daysLeft, dueAt: deadline.dueAt } : null,
        evidencePackId: docs.find((d) => d.kind === "evidence_pack")?.id ?? null,
        registry: record.citations ?? {},
      }}
    />
  );
}

export default function ApprovePage({ params }: PageProps<"/cases/[id]/approve/[draftId]">) {
  return (
    <PageContainer>
      <CitationViewerProvider>
        <Suspense
          fallback={
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
              <Skeleton className="h-[36rem] rounded-2xl" />
              <Skeleton className="h-80 rounded-2xl" />
            </div>
          }
        >
          <Content params={params} />
        </Suspense>
      </CitationViewerProvider>
    </PageContainer>
  );
}
