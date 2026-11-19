import { withCurrentDays } from "@/lib/rules/deadlines";
import { loadRules } from "@/lib/rules/load";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileJson,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  Mail,
  Plane,
  Receipt,
  ScrollText,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { AgentPanel, type PersistedRun } from "@/components/agent/agent-panel";
import { AgentRunProvider, type LiveStep } from "@/components/agent/agent-run-context";
import { AnalysisStatus, PendingWhileRunning } from "@/components/case/analysis-status";
import { AskKelvin } from "@/components/case/ask-kelvin";
import { chatModelInfo } from "@/lib/chat/llm";
import { MissingDocsUpload } from "@/components/case/missing-docs-upload";
import { missingDocuments } from "@/lib/case/missing-docs";
import { RouteLabel } from "@/components/case/case-list";
import { CaseWorkflow } from "@/components/case/case-workflow";
import { QaDecisionCard } from "@/components/case/qa-decision-card";
import { CorrespondenceThread } from "@/components/case/correspondence";
import { RecommendationCard, deriveRecommendation } from "@/components/case/recommendation-card";
import { getDb } from "@/lib/db/client";
import { awaitingReplyFrom } from "@/lib/counterparties/scripted";
import { JourneyMap } from "@/components/case/journey-map";
import { ClaimPlan, DeadlineList, RecoveryRoutes } from "@/components/case/recovery-routes";
import { TemperatureChart } from "@/components/case/temperature-chart";
import { CitationViewerProvider } from "@/components/documents/citation-viewer";
import { StatusChip } from "@/components/kit/status-chip";
import { SectionHeader } from "@/components/kit/surfaces";
import { PageContainer } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { RunKind } from "@/lib/agent/events";
import type { CaseRecord } from "@/lib/case/record";
import type { DocumentKind } from "@/lib/db/schema";
import type { Citation } from "@/lib/domain/citation";
import { CUSTODY_META, type RecoveryRoute } from "@/lib/domain/parties";
import { formatDate, formatDateTime, formatDuration, formatEUR, formatKg, formatTemp } from "@/lib/format";
import { buildJourney } from "@/lib/geo/journey";
import { getCase, latestRunWithSteps, listAudit, listDecisions, listDocuments, listDrafts, listOutbox, loadReadings } from "@/lib/queries/cases";
import { cn } from "@/lib/utils";

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

function clip(v: unknown, max = 3000): unknown {
  const s = JSON.stringify(v);
  return s && s.length > max ? { truncated: true, preview: s.slice(0, max) } : v;
}

function routeCitations(record: CaseRecord): Record<RecoveryRoute, Citation[]> {
  const reg = record.citations ?? {};
  const pick = (...ids: (string | undefined)[]) => ids.filter((id): id is string => !!id && !!reg[id]).map((id) => reg[id]);
  const c = record.contract?.clauses ?? {};
  const p = record.policy?.clauses ?? {};
  const custody = record.custody?.attribution?.citationIds ?? [];
  return {
    carrier: pick(record.shipment?.citations?.awb, ...custody),
    forwarder: pick(c.hub_storage?.citationId, c.liability_basis?.citationId, c.liability_cap?.citationId, c.air_carriers?.citationId, c.notice?.citationId),
    insurer: pick(p.temperature_cover?.citationId, p.minimum_duration?.citationId, p.settlement?.citationId, p.deductible?.citationId, p.notification?.citationId, p.preservation?.citationId),
  };
}

function Card({ title, description, eyebrow, children, className, action }: { title: string; description?: string; eyebrow?: string; children: React.ReactNode; className?: string; action?: React.ReactNode }) {
  return (
    <section className={cn("min-w-0 surface p-5 sm:p-7", className)}>
      <SectionHeader title={title} description={description} eyebrow={eyebrow} action={action} />
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Group heading between blocks of cards: overline with a hairline rule. */
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4 pt-4">
        <h2 className="eyebrow shrink-0 font-sans text-muted-foreground">{label}</h2>
        <span className="h-px flex-1 bg-border" aria-hidden="true" />
      </div>
      {children}
    </div>
  );
}

function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="eyebrow text-[10.5px] text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-heading text-[17px] leading-snug font-semibold break-words text-foreground [font-variant-numeric:lining-nums_tabular-nums]">{children}</dd>
    </div>
  );
}

const ACTOR_LABEL: Record<string, string> = { human: "Person", agent: "Kelvin", system: "System" };

async function CaseContent({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const c = await getCase(id);
  if (!c) notFound();
  const [docs, audit, run, drafts, decisionRows, outbox, readings] = await Promise.all([
    listDocuments(id),
    listAudit(id),
    latestRunWithSteps(id),
    listDrafts(id),
    listDecisions(id),
    listOutbox(id),
    loadReadings(id),
  ]);
  const record = withCurrentDays(c.record as CaseRecord, new Date(), await loadRules(await getDb()));
  const qaRow = decisionRows.find((d) => d.gate === "qa");
  const qa: "pending" | "released" | "rejected" = qaRow ? (qaRow.decision === "released" ? "released" : "rejected") : (record.qa?.status ?? "pending");
  const journey = buildJourney(record);
  const main = record.excursions?.find((e) => e.direction === "high") ?? record.excursions?.[0];
  const attr = record.custody?.attribution;
  const handled = new Set(record.handledMessageIds ?? []);
  const unhandled = outbox.filter((m) => m.direction === "in" && !handled.has(m.id));
  const approvedDrafts = drafts.filter((d) => d.status === "approved");
  const closed = c.status.startsWith("closed_");
  // Kelvin picks up automatically whenever there is work only it can do.
  const autoStart: RunKind | null = run.busy
    ? null
    : c.status === "new"
      ? "investigate"
      : (c.status === "awaiting_qa" && qa === "rejected") || (c.status === "claim_prepared" && !drafts.some((d) => d.kind === "claim_letter" && d.status === "awaiting_approval"))
        ? "prepare_claim"
        : c.status === "no_claim"
          ? "close"
          : !closed && (approvedDrafts.length > 0 || unhandled.length > 0)
            ? "follow_up"
            : null;
  const autoStartKey = `${approvedDrafts.map((d) => d.id).join(",")}|${unhandled.map((m) => m.id).join(",")}`;
  const waitingFor = !closed && !approvedDrafts.length && !unhandled.length ? await awaitingReplyFrom(await getDb(), id) : null;

  const persistedRuns: PersistedRun[] = [...run.runs].reverse().map((r) => ({
    id: r.id,
    kind: r.kind as RunKind,
    mode: r.mode,
    model: r.model,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    steps: run.steps
      .filter((s) => s.runId === r.id)
      .sort((a, b) => a.seq - b.seq)
      .map(
        (s): LiveStep => ({
          seq: s.seq,
          tool: s.tool,
          status: s.status,
          summary: s.summary ?? undefined,
          text: s.tool === "message" ? (s.summary ?? "") : undefined,
          durationMs: s.durationMs ?? undefined,
          citations: s.citations as Citation[],
          input: s.tool === "message" ? undefined : clip(s.input),
          output: s.tool === "message" ? undefined : clip(s.output),
        }),
      ),
  }));

  const rec = deriveRecommendation({ status: c.status, record, qa, recoveredEur: c.recoveredEur, valueEur: c.valueEur });
  const missing = missingDocuments(docs);
  const openDrafts = drafts.filter((d) => d.status !== "sent");

  return (
    <CitationViewerProvider>
      <AgentRunProvider caseId={c.id} autoStart={autoStart} autoStartKey={autoStartKey}>
        <div className="flex flex-col gap-6">
          <nav aria-label="Breadcrumb">
            <ol className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <li>
                <Link href="/cases" className="rounded-sm hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  Cases
                </Link>
              </li>
              <li aria-hidden="true">
                <ChevronRight className="size-3.5" />
              </li>
              <li aria-current="page" className="num text-foreground">
                {c.shipmentRef}
              </li>
            </ol>
          </nav>

          {/* ---------- header ---------- */}
          <header className="flex flex-col gap-6 border-b border-border pb-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="eyebrow text-muted-foreground">
                  {c.code && c.scenario === "demo" ? `Case ${c.code} · ` : "Case · "}Temperature excursion
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h1 className="text-[2.375rem] leading-[1.02] font-semibold tracking-[-0.02em] sm:text-[3.25rem]">{c.shipmentRef}</h1>
                  <StatusChip status={c.status} />
                </div>
                <p className="mt-2 text-[15px] text-muted-foreground">{c.title}</p>
                {(c.scenario as string) === "live" && (
                  <p className="mt-1 text-sm text-muted-foreground">Opened from live monitoring when the shipment was delivered.</p>
                )}
              </div>
              <AskKelvin
                caseId={c.id}
                status={c.status}
                hasClaim={(record.claimPlan?.length ?? 0) > 0 && qa !== "released" && record.qaAssessment?.verdict !== "usable"}
                {...chatModelInfo()}
              />
            </div>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 xl:grid-cols-7 xl:gap-x-0 xl:divide-x xl:divide-border [&>div]:xl:px-5 [&>div:first-child]:xl:pl-0">
              <Fact label="Route">
                <RouteLabel origin={c.origin} destination={c.destination} />
              </Fact>
              <Fact label="Product" className="xl:col-span-2">
                {c.product ?? "—"}
              </Fact>
              <Fact label="Value">{c.valueEur != null ? formatEUR(c.valueEur) : "—"}</Fact>
              <Fact label="Weight">{c.weightKg != null ? formatKg(c.weightKg) : "—"}</Fact>
              <Fact label="Declared value">{c.weightKg == null ? "—" : c.declaredValueEur != null ? formatEUR(c.declaredValueEur) : "NVD"}</Fact>
              <Fact label="Delivered">{c.deliveredAt ? formatDate(c.deliveredAt) : "—"}</Fact>
            </dl>
          </header>

          <AnalysisStatus />

          {/* ---------- the output first ---------- */}
          <PendingWhileRunning ready={rec.ready} lines={4} className="min-h-64">
            <RecommendationCard
              rec={rec}
              deadline={{ label: c.nearestDeadlineLabel, at: c.nearestDeadlineAt, daysLeft: c.daysLeft }}
              actionTitle={closed ? "Outcome" : "Next action"}
              action={
                <CaseWorkflow
                  caseId={c.id}
                  status={c.status}
                  qa={qa}
                  drafts={drafts.map((d) => ({ id: d.id, kind: d.kind, recipientName: d.recipientName, subject: d.subject, status: d.status, amountEur: d.amountEur }))}
                  negotiation={record.negotiation ? { offerEur: record.negotiation.offerEur, claimEur: record.negotiation.claimEur, counterparty: record.negotiation.counterparty } : null}
                  awaitingReplyFrom={waitingFor}
                  recoveredEur={c.recoveredEur}
                  closedReason={c.closedReason}
                  agentUnsure={record.qaAssessment?.verdict === "unsure"}
                />
              }
            />
          </PendingWhileRunning>

          {/* ---------- evidence ---------- */}
          <Group label="Evidence">
            {readings.length > 0 && (
              <Card eyebrow="Logger" title="Temperature and custody" description="Logger readings against the 2–8 °C range, with the party holding the cargo underneath">
                {main && (
                  <dl className="mb-5 grid grid-cols-1 gap-4 rounded-lg border border-border bg-muted/50 px-5 py-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border">
                    <div className="sm:pr-5">
                      <dt className="eyebrow text-[10.5px] text-muted-foreground">Excursion</dt>
                      <dd className="num mt-1 font-semibold text-warning-fg">
                        {formatTemp(main.peakC)} peak · {formatDuration(main.minutes)}
                      </dd>
                      <dd className="num text-xs text-muted-foreground">From {formatDateTime(main.start)} UTC</dd>
                    </div>
                    <div className="min-w-0 sm:px-5">
                      <dt className="eyebrow text-[10.5px] text-muted-foreground">In custody of</dt>
                      <dd className="mt-1 flex items-center gap-2 font-semibold">
                        {attr && <span className="size-2.5 shrink-0 rounded-sm" style={{ background: CUSTODY_META[attr.role].colorVar }} aria-hidden="true" />}
                        <span className="truncate">{attr ? attr.custodian : "Not yet established"}</span>
                      </dd>
                      <dd className="truncate text-xs text-muted-foreground">{attr ? attr.location : "Established by the analysis"}</dd>
                    </div>
                    <div className="min-w-0 sm:pl-5">
                      <dt className="eyebrow text-[10.5px] text-muted-foreground">Activity</dt>
                      <dd className="mt-1 truncate font-semibold">{attr ? attr.activity : "—"}</dd>
                      <dd className="text-xs text-muted-foreground">{attr ? (attr.controlled ? "Temperature-controlled segment" : "Uncontrolled (ambient) segment") : ""}</dd>
                    </div>
                  </dl>
                )}
                <TemperatureChart readings={readings} excursions={record.excursions ?? []} segments={record.custody?.segments ?? []} />
                {!record.custody && <p className="mt-2 text-xs text-muted-foreground">Custody bands appear once the custody timeline has been rebuilt.</p>}
              </Card>
            )}

            <PendingWhileRunning ready={!!record.qaAssessment} lines={3}>
              {record.qaAssessment && (
                <QaDecisionCard assessment={record.qaAssessment} humanQa={qa !== "pending" ? qa : null} citation={record.qaAssessment.citationId ? record.citations?.[record.qaAssessment.citationId] : undefined} />
              )}
            </PendingWhileRunning>

            {journey && (
              <Card eyebrow="Route" title="Shipment journey" description="Where the cargo travelled, who held it, and where the temperature rose">
                <JourneyMap journey={journey} deliveredAt={c.deliveredAt?.toISOString() ?? null} />
              </Card>
            )}
          </Group>

          {/* ---------- recovery ---------- */}
          <PendingWhileRunning ready={!!record.ranking} lines={4}>
            {record.ranking && (
              <Group label="Recovery">
                <Card eyebrow="Recovery routes" title={record.claimPlan?.length ? "Claim plan and recovery routes" : "Recovery routes"} description="Ranked by expected recoverable amount. Caps, deductibles and deadlines come from the rules engine.">
                  {record.claimPlan && record.claimPlan.length > 0 && <ClaimPlan plan={record.claimPlan} extraCosts={record.extraCosts ?? []} />}
                  <RecoveryRoutes ranking={record.ranking} citations={routeCitations(record)} qaPending={qa === "pending"} />
                  {record.deadlines && (
                    <div className="mt-8">
                      <h3 className="eyebrow font-sans text-muted-foreground">All deadlines</h3>
                      <DeadlineList deadlines={record.deadlines} />
                    </div>
                  )}
                </Card>
              </Group>
            )}
          </PendingWhileRunning>

          {/* ---------- records ---------- */}
          <Group label="Records">
            <Card eyebrow="Documents" title="Case file" description={`${docs.length} document${docs.length === 1 ? "" : "s"} reviewed for this case`}>
              <ul className="grid grid-cols-1 divide-y divide-border border-y border-border md:grid-cols-2 md:gap-x-8 md:divide-y-0 [&>li]:md:border-b [&>li]:md:border-border">
                {docs.map((d) => {
                  const Icon = DOC_ICON[d.kind] ?? FileText;
                  return (
                    <li key={d.id}>
                      <a
                        href={`/api/documents/${d.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="group flex items-center gap-3 px-1 py-3 transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <Icon className="size-4 shrink-0 text-subtle group-hover:text-ai-fg" strokeWidth={1.75} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium group-hover:underline group-hover:underline-offset-2">{d.title}</span>
                          <span className="num block text-xs text-muted-foreground">
                            {DOC_LABEL[d.kind] ?? "Document"}
                            {d.pages ? ` · ${d.pages} page${d.pages > 1 ? "s" : ""}` : ""} · {Math.max(1, Math.round(d.sizeBytes / 1024))} KB
                          </span>
                        </span>
                        <ExternalLink className="size-3.5 text-subtle" aria-hidden="true" />
                        <span className="sr-only">(opens in a new tab)</span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {missing.length > 0 && (
              <Card eyebrow="Documents" title="Documents still missing" description="Add them so the next analysis can use them.">
                <MissingDocsUpload caseId={c.id} missing={missing.map((m) => m.label)} />
              </Card>
            )}

            <Card eyebrow="Correspondence" title="Messages and drafts" description={`${outbox.length} message${outbox.length === 1 ? "" : "s"} in the simulated Outbox · ${openDrafts.length} draft${openDrafts.length === 1 ? "" : "s"}`}>
              <CorrespondenceThread
                caseId={c.id}
                messages={outbox.map((m) => ({ id: m.id, direction: m.direction, counterparty: m.counterparty, fromAddress: m.fromAddress, toAddress: m.toAddress, subject: m.subject, body: m.body, attachments: m.attachments, at: m.at.toISOString(), draftId: m.draftId }))}
                followUp={{ appealDraftIds: (record.followUp?.appeals ?? []).map((a) => a.draftId), remindersSent: record.followUp?.remindersSent ?? [] }}
                drafts={openDrafts.map((d) => ({ id: d.id, kind: d.kind, status: d.status, subject: d.subject, recipientName: d.recipientName, body: d.body, citations: (d.citations as unknown[]).length }))}
              />
            </Card>
          </Group>

          {/* ---------- details: closed by default ---------- */}
          <details className="group/details mt-4 surface">
            <summary className="flex cursor-pointer list-none items-center gap-4 rounded-xl px-5 py-4 select-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-7 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1">
                <span className="block font-heading text-[1.05rem] font-semibold">Analysis details &amp; audit trail</span>
                <span className="block text-sm text-muted-foreground">
                  Each step of the analysis with its sources, and the append-only audit log · {persistedRuns.length} run{persistedRuns.length === 1 ? "" : "s"}, {audit.length} event{audit.length === 1 ? "" : "s"}
                </span>
              </span>
              <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform duration-200 group-open/details:rotate-180" aria-hidden="true" />
            </summary>
            <div className="grid grid-cols-1 gap-8 border-t border-border px-5 py-6 sm:px-7 xl:grid-cols-12">
              <section aria-labelledby="steps-heading" className="min-w-0 xl:col-span-7">
                <h3 id="steps-heading" className="eyebrow font-sans text-muted-foreground">
                  Analysis steps
                </h3>
                <div className="mt-3">
                  <AgentPanel runs={persistedRuns} />
                </div>
              </section>
              <section aria-labelledby="audit-heading" className="min-w-0 xl:col-span-5 xl:border-l xl:border-border xl:pl-8">
                <h3 id="audit-heading" className="eyebrow font-sans text-muted-foreground">
                  Audit trail <span className="font-normal normal-case tracking-normal">· newest first</span>
                </h3>
                <ol className="mt-3 divide-y divide-border border-y border-border">
                  {[...audit].reverse().map((e) => (
                    <li key={e.id} className="flex gap-3 py-2.5 text-[13px]">
                      <span
                        className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", e.actorType === "human" ? "ring-1 ring-human ring-offset-1 ring-offset-card" : e.actorType === "agent" ? "bg-ai" : "bg-subtle")}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{e.tool ?? e.eventType.replace(/_/g, " ")}</span>
                        <span className="block text-xs text-muted-foreground">
                          <span className="sr-only">{ACTOR_LABEL[e.actorType] ?? e.actorType}: </span>
                          {e.actorName}
                          {e.actorRole ? ` (${e.actorRole})` : ""}
                        </span>
                      </span>
                      <span className="num shrink-0 text-right text-xs text-subtle">
                        {formatDateTime(e.at)}
                        {e.durationMs != null && <span className="block">{e.durationMs} ms</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </details>
        </div>
      </AgentRunProvider>
    </CitationViewerProvider>
  );
}

function CaseSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-4 w-36" />
      <div className="flex flex-col gap-4 border-b border-border pb-7">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="mt-2 grid grid-cols-4 gap-6 lg:grid-cols-7">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      </div>
      <Skeleton className="h-72 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

export default function CasePage({ params }: PageProps<"/cases/[id]">) {
  return (
    <PageContainer className="flex flex-col gap-6">
      <Suspense fallback={<CaseSkeleton />}>
        <CaseContent params={params} />
      </Suspense>
    </PageContainer>
  );
}
