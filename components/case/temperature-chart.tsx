"use client";

import { useMemo } from "react";
import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CustodySegmentRecord, ExcursionWindow } from "@/lib/case/record";
import { CUSTODY_META } from "@/lib/domain/parties";
import { formatDateTime, formatDuration, formatTemp } from "@/lib/format";

const Y_AXIS_W = 40;
const RIGHT = 12;

interface Point {
  t: number;
  c: number;
  row: number;
  /** Same value only when out of range, so the excursion segment draws in amber */
  hot: number | null;
}

/** Merge consecutive segments held by the same custodian into one band. */
function custodyRuns(segments: CustodySegmentRecord[]) {
  const runs: { role: CustodySegmentRecord["role"]; custodian: string; from: number; to: number; uncontrolled: boolean }[] = [];
  for (const s of segments) {
    const from = Date.parse(s.from);
    const to = Date.parse(s.to);
    const last = runs[runs.length - 1];
    if (last && last.custodian === s.custodian) {
      last.to = to;
      last.uncontrolled ||= !s.controlled;
    } else runs.push({ role: s.role, custodian: s.custodian, from, to, uncontrolled: !s.controlled });
  }
  return runs;
}

function TooltipBody({ active, payload, segments }: { active?: boolean; payload?: { payload: Point }[]; segments: CustodySegmentRecord[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const iso = new Date(p.t).toISOString();
  const seg = segments.find((s) => s.from <= iso && iso < s.to);
  const out = p.c > 8 || p.c < 2;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-raised">
      <div className="num text-muted-foreground">{formatDateTime(p.t)} UTC · row {p.row}</div>
      <div className={out ? "num mt-0.5 text-sm font-semibold text-warning-fg" : "num mt-0.5 text-sm font-semibold"}>{formatTemp(p.c)}</div>
      {seg && (
        <div className="mt-1 flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: CUSTODY_META[seg.role].colorVar }} aria-hidden="true" />
          <span className="text-foreground">{seg.custodian}</span>
        </div>
      )}
      {seg && <div className="text-muted-foreground">{seg.location}</div>}
    </div>
  );
}

export function TemperatureChart({
  readings,
  excursions,
  segments,
}: {
  readings: { t: number; c: number; row: number }[];
  excursions: ExcursionWindow[];
  segments: CustodySegmentRecord[];
}) {
  const data: Point[] = useMemo(() => readings.map((r) => ({ ...r, hot: r.c > 8 || r.c < 2 ? r.c : null })), [readings]);
  const tMin = readings[0]?.t ?? 0;
  const tMax = readings[readings.length - 1]?.t ?? 1;
  const yMax = Math.max(16, Math.ceil((Math.max(...readings.map((r) => r.c)) + 1) / 2) * 2);
  const runs = useMemo(() => custodyRuns(segments), [segments]);
  const ticks = useMemo(() => {
    const n = 6;
    return Array.from({ length: n + 1 }, (_, i) => tMin + ((tMax - tMin) * i) / n);
  }, [tMin, tMax]);
  const pct = (t: number) => `${(Math.min(Math.max(t, tMin), tMax) - tMin) / (tMax - tMin) * 100}%`;
  const main = excursions.find((e) => e.direction === "high") ?? excursions[0];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <svg width="18" height="6" aria-hidden="true"><line x1="1" y1="3" x2="17" y2="3" stroke="var(--chart-ink)" strokeWidth="2" /></svg>
          Logger temperature (5-min readings)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-cold-soft ring-1 ring-cold/30" aria-hidden="true" />
          Required 2–8 °C
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-warning-soft ring-1 ring-warning/40" aria-hidden="true" />
          Excursion
        </span>
        {main && (
          <span className="num ml-auto font-medium text-warning-fg">
            Peak {formatTemp(main.peakC)} · {formatDuration(main.minutes)} out of range
          </span>
        )}
      </div>

      <div className="h-64" role="img" aria-label={`Temperature over ${readings.length} readings${main ? `, peaking at ${formatTemp(main.peakC)} for ${formatDuration(main.minutes)} above 8 °C` : ", always within range"}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: RIGHT, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <ReferenceArea y1={2} y2={8} fill="var(--cold-soft)" fillOpacity={1} stroke="none" ifOverflow="hidden" />
            {excursions.map((e) => (
              <ReferenceArea key={e.index} x1={Date.parse(e.start)} x2={Date.parse(e.end)} fill="var(--warning-soft)" fillOpacity={1} stroke="var(--warning)" strokeOpacity={0.35} />
            ))}
            <ReferenceLine y={8} stroke="var(--cold)" strokeDasharray="4 4" strokeOpacity={0.6} />
            <ReferenceLine y={2} stroke="var(--cold)" strokeDasharray="4 4" strokeOpacity={0.6} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[tMin, tMax]}
              ticks={ticks}
              tickFormatter={(t: number) => formatDateTime(t)}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={24}
            />
            <YAxis
              width={Y_AXIS_W}
              domain={[0, yMax]}
              ticks={[0, 2, 4, 8, 12, 16, ...(yMax > 16 ? [yMax] : [])]}
              tickFormatter={(v: number) => `${v}°`}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<TooltipBody segments={segments} />} cursor={{ stroke: "var(--subtle)", strokeWidth: 1 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="c" stroke="var(--chart-ink)" strokeWidth={1.75} dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="hot" stroke="var(--warning)" strokeWidth={2.5} dot={false} activeDot={false} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* custody bands on the same time axis */}
      <div style={{ marginLeft: Y_AXIS_W, marginRight: RIGHT }}>
        <div className="relative h-3 overflow-hidden rounded-full bg-muted">
          {runs.map((r, i) => (
            <span
              key={i}
              className="absolute inset-y-0 border-r-2 border-card last:border-r-0"
              style={{ left: pct(r.from), width: `calc(${pct(r.to)} - ${pct(r.from)})`, background: CUSTODY_META[r.role].colorVar }}
              title={`${r.custodian} (${CUSTODY_META[r.role].label}) ${formatDateTime(r.from)}–${formatDateTime(r.to)} UTC`}
            />
          ))}
        </div>
        <div className="relative mt-1.5 hidden h-9 sm:block">
          {runs.map((r, i) => {
            const width = ((Math.min(r.to, tMax) - Math.max(r.from, tMin)) / (tMax - tMin)) * 100;
            if (width < 9) return null;
            return (
              <span key={i} className="absolute overflow-hidden pr-1 text-[11px] leading-tight" style={{ left: pct(r.from), width: `${width}%` }}>
                <span className="block truncate font-medium text-foreground">{r.custodian.replace(/ (GmbH|B\.V\.|Inc\.|LLC)$/, "")}</span>
                <span className="block truncate text-muted-foreground">{CUSTODY_META[r.role].label}</span>
              </span>
            );
          })}
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] sm:hidden">
          {runs.map((r, i) => (
            <li key={i} className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm" style={{ background: CUSTODY_META[r.role].colorVar }} aria-hidden="true" />
              <span className="text-foreground">{r.custodian.replace(/ (GmbH|B.V.|Inc.|LLC)$/, "")}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
