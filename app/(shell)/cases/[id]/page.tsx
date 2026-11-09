import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  ChevronLeft,
  ExternalLink,
  FileJson,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  History,
  Mail,
  Plane,
  Receipt,
  ScrollText,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { RouteLabel } from "@/components/case/case-list";
import { AiEyebrow, AiTile } from "@/components/kit/badges";
import { DeadlineRing } from "@/components/kit/deadline-ring";
import { StatusChip } from "@/components/kit/status-chip";
import { AiSurface, SectionHeader } from "@/components/kit/surfaces";
import { PageContainer } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { DocumentKind } from "@/lib/db/schema";
import { formatDateTime, formatDateWithRelative, formatEUR, formatKg, formatMs } from "@/lib/format";
import { getCase, latestRunWithSteps, listAudit, listDecisions, listDocuments, listDrafts, listOutbox } from "@/lib/queries/cases";
import { CaseWorkflow } from "@/components/case/case-workflow";
import { CitationChip } from "@/components/kit/citation-chip";
import { STATUS_META } from "@/lib/domain/case-status";
import type { Citation } from "@/lib/domain/citation";

export const metadata: Metadata = { title: "Case" };

const DOC_ICON: Record<DocumentKind, LucideIcon> = {
  logger: FileSpreadsheet,
  awb: Plane,
  handling_events: FileJson,
  handling_report: ScrollText,
  contract: FileText,
  policy: ShieldCheck,
  invoice: Receipt,
  email: Mail,
  evidence_pack: FolderArchive,
  other: FileText,
};

const DOC_LABEL: Record<DocumentKind, string> = {
  logger: "Logger CSV",
  awb: "Air waybill",
  handling_events: "Handling events",
  handling_report: "Handling report",
  contract: "Contract",
  policy: "Policy",
  invoice: "Invoice",
  email: "Email",
  evidence_pack: "Evidence pack",
  other: "Document",
};

async function CaseContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const c = await getCase(id);
  if (!c) notFound();
  const [docs, audit, run, drafts, decisionRows, outbox] = await Promise.all([
    listDocuments(id),
    listAudit(id),
    latestRunWithSteps(id),
    listDrafts(id),
    listDecisions(id),
    listOutbox(id),
  ]);
  const qaRow = decisionRows.find((d) => d.gate === "qa");
  const qa: "pending" | "released" | "rejected" = qaRow ? (qaRow.decision === "released" ? "released" : "rejected") : "pending";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-6 rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="num text-[1.75rem] leading-none font-semibold tracking-[-0.025em]">{c.shipmentRef}</h1>
            <StatusChip status={c.status} />
          </div>
          <p className="text-[15px] text-muted-foreground">{c.title}</p>
          <dl className="num mt-1 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Route</dt>
              <dd className="mt-0.5">
                <RouteLabel origin={c.origin} destination={c.destination} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Value</dt>
              <dd className="mt-0.5 font-medium">{c.valueEur != null ? formatEUR(c.valueEur) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Weight</dt>
              <dd className="mt-0.5 font-medium">{c.weightKg != null ? formatKg(c.weightKg) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Declared value</dt>
              <dd className="mt-0.5 font-medium">
                {c.weightKg == null ? "—" : c.declaredValueEur != null ? formatEUR(c.declaredValueEur) : "NVD"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Delivered</dt>
              <dd className="mt-0.5 font-medium">{c.deliveredAt ? formatDateWithRelative(c.deliveredAt) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Product</dt>
              <dd className="mt-0.5 font-medium">{c.product ?? "—"}</dd>
            </div>
          </dl>
        </div>
        <DeadlineRing
          daysLeft={c.daysLeft}
          windowDays={c.nearestDeadlineWindowDays ?? 14}
          label={c.nearestDeadlineLabel ?? undefined}
        />
      </header>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Agent (interim layout until milestone 4) */}
        <div className="flex flex-col gap-6">
          <AiSurface>
            <div className="flex flex-col gap-5 p-6">
              <div className="flex items-start gap-5">
                <AiTile size="lg" />
                <div className="border-l border-border pl-5">
                  <AiEyebrow />
                  <div className="text-lg font-semibold tracking-tight">{STATUS_META[c.status].description}</div>
                  <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                    {run.runs.length ? `${run.runs.length} agent run${run.runs.length > 1 ? "s" : ""} so far. ` : `${docs.length} documents received. `}
                    {c.recommendedRoute && c.claimAmountEur ? `Recommended route: ${c.recommendedRoute} (${formatEUR(c.claimAmountEur)}).` : ""}
                  </p>
                </div>
              </div>
              <CaseWorkflow
                caseId={c.id}
                status={c.status}
                qa={qa}
                drafts={drafts.map((d) => ({ id: d.id, kind: d.kind, recipientName: d.recipientName, subject: d.subject, status: d.status, amountEur: d.amountEur }))}
              />
            </div>
          </AiSurface>

          {run.steps.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <SectionHeader title="Agent activity" description="Every step, with its sources" icon={Sparkles} />
              <ol className="mt-4 flex flex-col gap-3">
                {run.steps.map((s) => (
                  <li key={s.id} className="flex gap-3 text-sm">
                    <span className={s.tool === "message" ? "mt-1.5 size-1.5 shrink-0 rounded-full bg-ai" : "mt-1.5 size-1.5 shrink-0 rounded-full bg-success"} aria-hidden="true" />
                    <span className="min-w-0">
                      {s.tool === "message" ? (
                        <span className="text-muted-foreground italic">{s.summary}</span>
                      ) : (
                        <>
                          <span className="font-mono text-xs text-muted-foreground">{s.tool}</span>
                          <span className="num ml-2 text-xs text-subtle">{s.durationMs != null ? formatMs(s.durationMs) : ""}</span>
                          <span className="block">{s.summary}</span>
                          {(s.citations as Citation[]).length > 0 && (
                            <span className="mt-1.5 flex flex-wrap gap-1">
                              {(s.citations as Citation[]).slice(0, 8).map((ci, i) => (
                                <CitationChip key={`${ci.id}-${i}`} citation={ci} />
                              ))}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {drafts.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <SectionHeader title="Drafts and Outbox" description={`${outbox.length} message(s) in the simulated Outbox`} icon={Mail} />
              <ul className="mt-4 flex flex-col gap-2">
                {drafts.map((d) => (
                  <li key={d.id}>
                    <details className="rounded-xl border border-border px-4 py-3">
                      <summary className="cursor-pointer text-sm">
                        <span className="font-medium">{d.subject}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {d.kind.replace(/_/g, " ")} · {d.status.replace(/_/g, " ")} · {(d.citations as unknown[]).length} citations
                        </span>
                      </summary>
                      <pre className="mt-3 font-sans text-sm whitespace-pre-wrap text-foreground/90">{d.body}</pre>
                    </details>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Audit */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-card xl:row-span-2">
          <SectionHeader title="Audit log" description="Append-only record of every event" icon={History} />
          <ol className="mt-4 flex flex-col gap-3">
            {audit.map((e) => (
              <li key={e.id} className="flex gap-3 text-sm">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-subtle" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="font-medium">{e.eventType.replace(/_/g, " ")}</span>{" "}
                  <span className="text-muted-foreground">by {e.actorName}</span>
                  {e.eventType === "document_received" ? (
                    <span className="block truncate font-mono text-[11px] text-muted-foreground">
                      {String((e.input as { filename?: string } | null)?.filename ?? "")}
                    </span>
                  ) : null}
                  <span className="num block text-xs text-subtle">{formatDateTime(e.at)} UTC</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* Documents */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
          <SectionHeader title="Documents" description="Everything the agent will read" icon={FileText} />
          <ul className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
            {docs.map((d) => {
              const Icon = DOC_ICON[d.kind];
              return (
                <li key={d.id}>
                  <a
                    href={`/api/documents/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-center gap-3 rounded-xl border border-border px-3.5 py-3 transition-colors hover:border-ai-from/30 hover:bg-ai-soft/50"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground group-hover:bg-ai-soft group-hover:text-ai-fg">
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{d.title}</span>
                      <span className="num block text-xs text-muted-foreground">
                        {DOC_LABEL[d.kind]}
                        {d.pages ? ` · ${d.pages} page${d.pages > 1 ? "s" : ""}` : ""} · {Math.max(1, Math.round(d.sizeBytes / 1024))} KB
                      </span>
                    </span>
                    <ExternalLink className="size-3.5 text-subtle" aria-hidden="true" />
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function CaseSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-80" />
          <Skeleton className="h-4 w-[30rem]" />
        </div>
        <Skeleton className="size-24 rounded-full" />
      </div>
      <Skeleton className="h-40 rounded-2xl" />
    </div>
  );
}

export default function CasePage({ params }: PageProps<"/cases/[id]">) {
  return (
    <PageContainer className="flex flex-col gap-5">
      <Link href="/" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Cases
      </Link>
      <Suspense fallback={<CaseSkeleton />}>
        <CaseContent params={params} />
      </Suspense>
    </PageContainer>
  );
}
