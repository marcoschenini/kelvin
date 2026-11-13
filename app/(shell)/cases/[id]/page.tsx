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
  Inbox,
  Mail,
  Map as MapIcon,
  Plane,
  Receipt,
  ScrollText,
  Send,
  ShieldCheck,
  Thermometer,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { AgentPanel, type PersistedRun } from "@/components/agent/agent-panel";
import { AgentRunProvider, type LiveStep } from "@/components/agent/agent-run-context";
import { RouteLabel } from "@/components/case/case-list";
import { CaseWorkflow } from "@/components/case/case-workflow";
import { CorrespondenceThread } from "@/components/case/correspondence";
import { getDb } from "@/lib/db/client";
import { awaitingReplyFrom } from "@/lib/counterparties/scripted";
import { JourneyMap } from "@/components/case/journey-map";
import { DeadlineList, RecoveryRoutes } from "@/components/case/recovery-routes";
import { TemperatureChart } from "@/components/case/temperature-chart";
import { CitationViewerProvider } from "@/components/documents/citation-viewer";
import { AiEyebrow, AiTile } from "@/components/kit/badges";
import { DeadlineRing } from "@/components/kit/deadline-ring";
import { StatusChip } from "@/components/kit/status-chip";
import { AiSurface, IconTile, SectionHeader } from "@/components/kit/surfaces";
import { PageContainer } from "@/components/shell/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { RunKind } from "@/lib/agent/events";
import type { CaseRecord } from "@/lib/case/record";
import type { DocumentKind } from "@/lib/db/schema";
import { STATUS_META } from "@/lib/domain/case-status";
import type { Citation } from "@/lib/domain/citation";
import { CUSTODY_META, ROUTE_META, type RecoveryRoute } from "@/lib/domain/parties";
import { formatDateTime, formatDateWithRelative, formatDuration, formatEUR, formatKg, formatTemp } from "@/lib/format";
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

function Card({ title, description, icon, children, className }: { title: string; description?: string; icon: LucideIcon; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5", className)}>
      <SectionHeader title={title} description={description} icon={icon} />
      <div className="mt-4">{children}</div>
    </section>
  );
}

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
  const record = c.record as CaseRecord;
  const qaRow = decisionRows.find((d) => d.gate === "qa");
  const qa: "pending" | "released" | "rejected" = qaRow ? (qaRow.decision === "released" ? "released" : "rejected") : "pending";
  const journey = buildJourney(record);
  const main = record.excursions?.find((e) => e.direction === "high") ?? record.excursions?.[0];
  const attr = record.custody?.attribution;
  const top = record.ranking?.find((r) => r.recommended);
  const handled = new Set(record.handledMessageIds ?? []);
  const unhandled = outbox.filter((m) => m.direction === "in" && !handled.has(m.id));
  const approvedDrafts = drafts.filter((d) => d.status === "approved");
  const closed = c.status.startsWith("closed_");
  // The agent picks up automatically whenever there is work only it can do.
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

  return (
    <CitationViewerProvider>
      <AgentRunProvider caseId={c.id} autoStart={autoStart} autoStartKey={autoStartKey}>
        <div className="flex flex-col gap-6">
          {/* ---------- header ---------- */}
          <header className="grid grid-cols-1 items-center gap-5 rounded-2xl border border-border bg-card p-4 shadow-card sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-6 sm:p-6">
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="num text-[1.5rem] leading-none font-semibold tracking-[-0.025em] sm:text-[1.75rem]">{c.shipmentRef}</h1>
                <StatusChip status={c.status} />
              </div>
              <p className="text-[15px] text-muted-foreground">{c.title}</p>
              <dl className="num mt-1 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:flex sm:flex-wrap sm:gap-x-8 sm:gap-y-2">
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
                  <dd className="mt-0.5 font-medium">{c.weightKg == null ? "—" : c.declaredValueEur != null ? formatEUR(c.declaredValueEur) : "NVD"}</dd>
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
            <div className="flex items-center gap-3 border-t border-border pt-4 sm:flex-col sm:gap-1 sm:border-0 sm:pt-0">
              <DeadlineRing daysLeft={c.daysLeft} windowDays={c.nearestDeadlineWindowDays ?? 14} label={c.nearestDeadlineLabel ?? undefined} />
              {c.nearestDeadlineLabel && <span className="max-w-[12rem] text-[12px] leading-tight text-muted-foreground sm:max-w-[9rem] sm:text-center sm:text-[11px]">{c.nearestDeadlineLabel}</span>}
            </div>
          </header>

          {/* ---------- what the agent found, at a glance ---------- */}
          {main && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="flex items-center gap-4 rounded-xl border border-warning/25 bg-warning-soft/60 p-4">
                <IconTile icon={Thermometer} tone="warning" />
                <div>
                  <div className="text-xs text-muted-foreground">Excursion</div>
                  <div className="num font-semibold">
                    {formatTemp(main.peakC)} peak · {formatDuration(main.minutes)}
                  </div>
                  <div className="num text-xs text-muted-foreground">{formatDateTime(main.start)} UTC</div>
                </div>
              </div>
              <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-card">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: attr ? CUSTODY_META[attr.role].colorVar : "var(--muted)" }}>
                  <Waypoints className="size-[18px] text-white" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">Held by when it got warm</div>
                  <div className="truncate font-semibold">{attr ? attr.custodian : "Not yet established"}</div>
                  <div className="truncate text-xs text-muted-foreground">{attr ? attr.location : "Run the investigation"}</div>
                </div>
              </div>
              <div className={cn("flex items-center gap-4 rounded-xl p-4", top ? "border-ai shadow-glow" : "border border-border bg-card shadow-card")}>
                <AiTile size="md" />
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">{qa === "released" ? "Outcome" : "Recommended route"}</div>
                  <div className="num truncate font-semibold">
                    {qa === "released" ? "No claim: product released" : top ? `${ROUTE_META[top.route].label} · ${formatEUR(top.recoverableEur)}` : "Pending"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {top ? `${Math.round(top.probability * 100)}% likely · ${qa === "pending" ? "if QA rejects" : "QA rejected"}` : STATUS_META[c.status].description}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            {/* ---------- agent: sticky right column, first on small screens ---------- */}
            <aside className="xl:col-start-2 xl:row-span-2 xl:row-start-1">
              <AiSurface>
                <div className="flex flex-col gap-5 p-4 sm:p-5">
                  <div className="flex items-start gap-4">
                    <AiTile size="md" />
                    <div className="min-w-0">
                      <AiEyebrow />
                      <div className="text-[15px] leading-snug font-semibold tracking-tight">{STATUS_META[c.status].description}</div>
                    </div>
                  </div>
                  <CaseWorkflow
                    caseId={c.id}
                    status={c.status}
                    qa={qa}
                    drafts={drafts.map((d) => ({ id: d.id, kind: d.kind, recipientName: d.recipientName, subject: d.subject, status: d.status, amountEur: d.amountEur }))}
                    negotiation={record.negotiation ? { offerEur: record.negotiation.offerEur, claimEur: record.negotiation.claimEur, counterparty: record.negotiation.counterparty } : null}
                    awaitingReplyFrom={waitingFor}
                    recoveredEur={c.recoveredEur}
                    closedReason={c.closedReason}
                  />
                  <div className="max-h-[60vh] overflow-y-auto pr-1 xl:max-h-[calc(100dvh-22rem)]">
                    <AgentPanel runs={persistedRuns} />
                  </div>
                </div>
              </AiSurface>
            </aside>

            {/* ---------- left column ---------- */}
            {readings.length > 0 && (
              <Card title="Temperature and custody" description="Logger readings against the 2–8 °C range, with who held the cargo underneath" icon={Thermometer} className="xl:col-start-1">
                <TemperatureChart readings={readings} excursions={record.excursions ?? []} segments={record.custody?.segments ?? []} />
                {!record.custody && <p className="mt-2 text-xs text-muted-foreground">Custody bands appear once the agent has rebuilt the timeline.</p>}
              </Card>
            )}

            {journey && (
              <Card title="Shipment journey" description="Where the cargo travelled, who held it, and where it got warm" icon={MapIcon} className="xl:col-start-1">
                <JourneyMap journey={journey} deliveredAt={c.deliveredAt?.toISOString() ?? null} />
              </Card>
            )}

            {record.ranking && (
              <Card title="Recovery routes" description="Ranked by expected recoverable amount; caps, deductibles and deadlines come from the rules engine" icon={Send} className="xl:col-span-2">
                <RecoveryRoutes ranking={record.ranking} citations={routeCitations(record)} qaPending={qa === "pending"} />
                {record.deadlines && (
                  <div className="mt-5">
                    <div className="eyebrow mb-1 text-muted-foreground">All deadlines</div>
                    <DeadlineList deadlines={record.deadlines} />
                  </div>
                )}
              </Card>
            )}

            <Card title="Documents" description="Everything the agent read" icon={FileText} className="xl:col-span-2">
              <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
                {docs.map((d) => {
                  const Icon = DOC_ICON[d.kind] ?? FileText;
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
                            {DOC_LABEL[d.kind] ?? "Document"}
                            {d.pages ? ` · ${d.pages} page${d.pages > 1 ? "s" : ""}` : ""} · {Math.max(1, Math.round(d.sizeBytes / 1024))} KB
                          </span>
                        </span>
                        <ExternalLink className="size-3.5 text-subtle" aria-hidden="true" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card title="Correspondence" description={`${outbox.length} message(s) in the simulated Outbox · ${drafts.filter((d) => d.status !== "sent").length} draft(s)`} icon={Inbox} className="xl:col-span-2">
              <CorrespondenceThread
                caseId={c.id}
                messages={outbox.map((m) => ({ id: m.id, direction: m.direction, counterparty: m.counterparty, fromAddress: m.fromAddress, toAddress: m.toAddress, subject: m.subject, body: m.body, attachments: m.attachments, at: m.at.toISOString(), draftId: m.draftId }))}
                drafts={drafts.filter((d) => d.status !== "sent").map((d) => ({ id: d.id, kind: d.kind, status: d.status, subject: d.subject, recipientName: d.recipientName, body: d.body, citations: (d.citations as unknown[]).length }))}
              />
            </Card>

            <Card title="Audit log" description="Append-only record of every event, newest first" icon={History} className="xl:col-span-2">
              <ol className="flex flex-col gap-2.5">
                {[...audit].reverse().map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm">
                    <span
                      className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", e.actorType === "human" ? "bg-human" : e.actorType === "agent" ? "bg-ai" : "bg-subtle")}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{e.tool ?? e.eventType.replace(/_/g, " ")}</span>{" "}
                      <span className="text-muted-foreground">
                        by {e.actorName}
                        {e.actorRole ? ` (${e.actorRole})` : ""}
                      </span>
                    </span>
                    <span className="num shrink-0 text-xs text-subtle">
                      {formatDateTime(e.at)}
                      {e.durationMs != null ? ` · ${e.durationMs} ms` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          </div>
        </div>
      </AgentRunProvider>
    </CitationViewerProvider>
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
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    </div>
  );
}

export default function CasePage({ params }: PageProps<"/cases/[id]">) {
  return (
    <PageContainer className="flex flex-col gap-5">
      <Link href="/cases" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden="true" />
        Cases
      </Link>
      <Suspense fallback={<CaseSkeleton />}>
        <CaseContent params={params} />
      </Suspense>
    </PageContainer>
  );
}
