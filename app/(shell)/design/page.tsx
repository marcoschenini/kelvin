import type { Metadata } from "next";
import {
  AlarmClock,
  CalendarClock,
  CheckCircle2,
  Clock,
  Euro,
  FileText,
  FolderOpen,
  HandCoins,
  Inbox,
  Mail,
  Scale,
  Send,
  ShieldCheck,
  Thermometer,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { KelvinGlyph, KelvinLogo } from "@/components/brand/logo";
import { AiBadge, AiEyebrow, AiTile, HumanDecisionBadge } from "@/components/kit/badges";
import { CitationChip, type Citation } from "@/components/kit/citation-chip";
import { DeadlinePill } from "@/components/kit/deadline-pill";
import { DeadlineRing } from "@/components/kit/deadline-ring";
import { KpiTile } from "@/components/kit/kpi-tile";
import { RouteChip } from "@/components/kit/route-chip";
import { StatusChip } from "@/components/kit/status-chip";
import { AiSurface, EmptyState, IconTile, OutcomeCard, SectionHeader } from "@/components/kit/surfaces";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { CASE_STATUSES } from "@/lib/domain/case-status";
import { CUSTODY_META, CUSTODY_PARTIES, RECOVERY_ROUTES } from "@/lib/domain/parties";
import { formatDateWithRelative, formatEUR } from "@/lib/format";

export const metadata: Metadata = { title: "Design system" };

const SWATCHES = [
  { name: "Background", var: "--background" },
  { name: "Card", var: "--card" },
  { name: "Foreground", var: "--foreground" },
  { name: "Muted text", var: "--muted-foreground" },
  { name: "Border", var: "--border" },
  { name: "AI from", var: "--ai-from" },
  { name: "AI to", var: "--ai-to" },
  { name: "Success", var: "--success" },
  { name: "Warning", var: "--warning" },
  { name: "Danger", var: "--danger" },
  { name: "Human", var: "--human" },
];

const CITATIONS: Citation[] = [
  { kind: "document", label: "Contract §7.2 · p.3" },
  { kind: "document", label: "AWB 020-48213377 · p.1" },
  { kind: "logger", label: "Logger r.214–232" },
  { kind: "email", label: "Email 14 Oct, 09:12" },
  { kind: "assumption", label: "Assumption: invoice value" },
];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function DesignSystemPage() {
  // Static reference date so the style guide is deterministic.
  const now = new Date("2026-11-09T09:00:00Z");
  return (
    <PageContainer className="flex flex-col gap-12">
      <PageHeader
        eyebrow={<AiEyebrow>Kelvin · design system</AiEyebrow>}
        title="Cold, precise, calm"
        description="Tokens and components every screen is built from. The visual language follows the agent-schema diagram."
      />

      <Section title="Brand">
        <div className="flex flex-wrap items-center gap-8 rounded-2xl border border-border bg-card p-8 shadow-card">
          <KelvinLogo className="scale-[1.6] origin-left" />
          <span className="w-16" />
          <KelvinGlyph className="size-14" />
          <KelvinGlyph variant="bare" className="size-14" />
          <AiTile size="lg" />
        </div>
      </Section>

      <Section title="Colour" description="Each semantic colour has a fill, an AA text shade and a soft surface.">
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {SWATCHES.map((s) => (
            <div key={s.var} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="h-14 border-b border-border" style={{ background: `var(${s.var})` }} />
              <div className="p-2.5">
                <div className="text-xs font-medium">{s.name}</div>
                <div className="font-mono text-[10px] text-muted-foreground">{s.var}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="bg-ai h-12 flex-1 rounded-xl" />
          {CUSTODY_PARTIES.map((p) => (
            <div key={p} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm">
              <span className="size-3 rounded-sm" style={{ background: CUSTODY_META[p].colorVar }} />
              {CUSTODY_META[p].label}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type" description="Inter with the optical-size axis; tabular numbers for money and dates.">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-8 shadow-card">
          <h1 className="text-5xl font-semibold tracking-[-0.035em]">Recover {formatEUR(190000)}</h1>
          <h2 className="text-2xl font-semibold">Excursion on the FRA ramp, airline custody</h2>
          <p className="max-w-2xl text-[15px] text-muted-foreground">
            The shipment reached 13.0 °C for 90 minutes while held by the carrier. Notice under Montreal Art. 31 is due{" "}
            <span className="num font-medium text-foreground">{formatDateWithRelative("2026-11-14T00:00:00Z", now)}</span>.
          </p>
          <div className="num flex gap-6 text-sm">
            <span>€200,000.00</span>
            <span>€3,712.80</span>
            <span>120 kg</span>
            <span>26 SDR/kg</span>
          </div>
        </div>
      </Section>

      <Section title="Status, deadlines, routes">
        <div className="flex flex-wrap gap-2">
          {CASE_STATUSES.map((s) => (
            <StatusChip key={s} status={s} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DeadlinePill daysLeft={12} />
          <DeadlinePill daysLeft={6} />
          <DeadlinePill daysLeft={2} />
          <DeadlinePill daysLeft={0} />
          <DeadlinePill daysLeft={-3} />
          <DeadlinePill daysLeft={null} />
          <span className="w-4" />
          {RECOVERY_ROUTES.map((r) => (
            <RouteChip key={r} route={r} recommended={r === "insurer"} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-8 rounded-2xl border border-border bg-card p-6 shadow-card">
          <DeadlineRing daysLeft={11} windowDays={14} label="Montreal notice" />
          <DeadlineRing daysLeft={5} windowDays={14} label="Montreal notice" />
          <DeadlineRing daysLeft={2} windowDays={14} label="Montreal notice" />
          <DeadlineRing daysLeft={-1} windowDays={14} label="Montreal notice" />
          <DeadlineRing daysLeft={null} windowDays={14} size={72} />
        </div>
      </Section>

      <Section title="Citations and human decisions">
        <div className="flex flex-wrap items-center gap-2">
          {CITATIONS.map((c) => (
            <CitationChip key={c.label} citation={c} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <HumanDecisionBadge />
          <AiBadge />
          <AiBadge label="Drafted by Kelvin" />
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            Approve <Kbd>A</Kbd> · Next case <Kbd>J</Kbd> · Previous <Kbd>K</Kbd>
          </span>
        </div>
      </Section>

      <Section title="KPI strip">
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <KpiTile label="Open cases" value={7} icon={FolderOpen} tone="ai" hint="3 awaiting a human" />
          <KpiTile label="At stake" value={1240000} format="eur" icon={Euro} tone="warning" hint="Value of open shipments" />
          <KpiTile label="Recovered" value={412500} format="eur" icon={HandCoins} tone="success" hint="Closed this quarter" emphasis="success" />
          <KpiTile label="Deadlines at risk" value={2} icon={AlarmClock} tone="danger" hint="Notice due in under 3 days" emphasis="danger" />
        </div>
      </Section>

      <Section title="Agent flow surfaces" description="The diagram, rebuilt from components.">
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: Thermometer, title: "Sensors", d: "Temperature & time data" },
            { icon: FileText, title: "Contracts", d: "Duties, limits & insurance" },
            { icon: Mail, title: "Documents", d: "Emails, waybills & reports" },
          ].map((x) => (
            <div key={x.title} className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 shadow-card">
              <IconTile icon={x.icon} tone="ai" />
              <div>
                <div className="font-semibold">{x.title}</div>
                <div className="text-sm text-muted-foreground">{x.d}</div>
              </div>
            </div>
          ))}
        </div>
        <AiSurface>
          <div className="flex flex-col gap-5 p-6">
            <div className="flex items-center gap-5">
              <AiTile size="lg" />
              <div className="border-l border-border pl-5">
                <AiEyebrow />
                <div className="text-xl font-semibold tracking-tight">Collects the data and prepares the case</div>
                <div className="text-sm text-muted-foreground">
                  Rebuilds the incident, checks contracts and deadlines, and flags missing information.
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[
                { icon: CalendarClock, title: "Timeline", d: "Who held the cargo, when" },
                { icon: Scale, title: "Liability", d: "Carrier, forwarder, insurer" },
                { icon: Clock, title: "Deadlines", d: "e.g. 14-day notice limit" },
              ].map((x) => (
                <div key={x.title} className="flex items-center gap-4 rounded-xl border border-border bg-card p-4">
                  <x.icon className="size-6 text-ai-fg" strokeWidth={1.75} aria-hidden="true" />
                  <div>
                    <div className="font-semibold">{x.title}</div>
                    <div className="text-sm text-muted-foreground">{x.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </AiSurface>
        <div className="flex items-center gap-5 rounded-xl border border-border bg-card p-5 shadow-card">
          <span className="num grid size-9 place-items-center rounded-full bg-ai-soft font-semibold text-ai-fg">2</span>
          <IconTile icon={ShieldCheck} tone="neutral" />
          <div className="flex-1 border-l border-border pl-5">
            <div className="font-semibold">Damage and liability check</div>
            <div className="text-sm text-muted-foreground">
              The quality team decides if the medicine is usable; the agent checks the cover.
            </div>
          </div>
          <HumanDecisionBadge />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <OutcomeCard tone="success" icon={CheckCircle2} title="No claim" description="Case closed with the reason, kept for audit." />
          <OutcomeCard tone="warning" icon={TriangleAlert} title="Possible claim" description="Evidence file and claim amount prepared." />
        </div>
        <div className="flex items-center gap-5 rounded-xl border border-border bg-card p-5 shadow-card">
          <span className="num grid size-9 place-items-center rounded-full bg-ai-soft font-semibold text-ai-fg">3</span>
          <IconTile icon={UserRound} tone="neutral" />
          <div className="flex-1 border-l border-border pl-5">
            <div className="font-semibold">Human approval</div>
            <div className="text-sm text-muted-foreground">A manager authorises the claim before anything is sent.</div>
          </div>
          <HumanDecisionBadge />
        </div>
      </Section>

      <Section title="Buttons, cards, loading, empty">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ai">
            <Send data-icon="inline-start" />
            Approve and send
          </Button>
          <Button>Primary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Reject</Button>
          <Button variant="ai" size="lg">
            Large action
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Recovery routes</CardTitle>
              <CardDescription>Ranked by expected recoverable €</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">Card content sits on a 20px rhythm.</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
              <Skeleton className="h-3 w-2/3" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <SectionHeader title="Correspondence" description="Outbox and replies" icon={Mail} />
            </CardHeader>
          </Card>
        </div>
        <EmptyState icon={Inbox} title="Nothing here yet" description="Empty states explain what will appear and offer one next step." />
      </Section>
    </PageContainer>
  );
}
