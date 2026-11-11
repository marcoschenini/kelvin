"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Building2, Factory, Plane, Thermometer, Truck, Warehouse, type LucideIcon } from "lucide-react";
import landDots from "@/lib/geo/land-dots.json";
import type { ChainStep, Journey, JourneyStop } from "@/lib/geo/journey";
import { CUSTODY_META, type CustodyParty } from "@/lib/domain/parties";
import { formatDateTime, formatDuration, formatTemp, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const W = landDots.width;
const H = landDots.height;
const roleColor = (r: CustodyParty) => CUSTODY_META[r].colorVar;

const STAY_ICON: Record<CustodyParty, LucideIcon> = { shipper: Factory, forwarder: Warehouse, airline: Plane, consignee: Building2 };

function Legend() {
  const item = (color: string, label: string, dashed = false) => (
    <span className="inline-flex items-center gap-1.5">
      <svg width="18" height="6" aria-hidden="true">
        <line x1="1" y1="3" x2="17" y2="3" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={dashed ? "3 3" : undefined} />
      </svg>
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {item("var(--custody-forwarder)", "Forwarder")}
      {item("var(--custody-airline)", "Airline (flight dashed)", true)}
      {item("var(--custody-shipper)", "Shipper / consignee")}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-warning ring-2 ring-warning/25" aria-hidden="true" />
        Excursion
      </span>
    </div>
  );
}

/** Two clusters (origin, destination) with a label each, so labels never collide. */
function clusterLabel(stops: JourneyStop[], side: "origin" | "destination") {
  const s = stops.filter((x) => x.side === side);
  if (!s.length) return null;
  const x = s.reduce((a, b) => a + b.x, 0) / s.length;
  const y = s.reduce((a, b) => a + b.y, 0) / s.length;
  return { x, y, text: s.map((p) => p.short).join(" · ") };
}

export function JourneyMap({ journey, deliveredAt }: { journey: Journey; deliveredAt: string | null }) {
  const reduce = useReducedMotion();
  const [hover, setHover] = useState<JourneyStop | null>(null);
  const origin = useMemo(() => clusterLabel(journey.stops, "origin"), [journey.stops]);
  const dest = useMemo(() => clusterLabel(journey.stops, "destination"), [journey.stops]);
  const ex = journey.excursion;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  return (
    <div className="flex flex-col gap-4">
      <Legend />
      <div className="relative overflow-hidden rounded-xl border border-border bg-muted/30" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="absolute inset-0 size-full"
          role="img"
          aria-label={`Shipment route map. ${journey.chain.length} custody steps${ex ? `. Excursion to ${formatTemp(ex.peakC)} while held by ${ex.custodian} at ${ex.placeName}.` : "."}`}
        >
          <g fill="var(--map-land)">
            {landDots.dots.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={2} />
            ))}
          </g>
          <text x={W * 0.47} y={H * 0.55} textAnchor="middle" className="fill-subtle text-[13px] italic" style={{ letterSpacing: "0.3em" }}>
            NORTH ATLANTIC
          </text>

          {/* legs */}
          {journey.legs.map((l, i) => (
            <motion.path
              key={l.seq}
              d={l.d}
              fill="none"
              stroke={roleColor(l.role)}
              strokeWidth={l.mode === "air" ? 2.25 : 3}
              strokeLinecap="round"
              strokeDasharray={l.mode === "air" ? "7 6" : undefined}
              initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: l.mode === "air" ? 0.9 : 0.35, delay: 0.1 + i * 0.08, ease: [0.2, 0, 0, 1] }}
            />
          ))}

          {/* stops */}
          {journey.stops.map((s) => {
            const role = s.roles[s.roles.length - 1] ?? "forwarder";
            return (
              <g key={s.id} onMouseEnter={() => setHover(s)} onMouseLeave={() => setHover(null)} className="cursor-default">
                <circle cx={s.x} cy={s.y} r={12} fill="transparent" />
                <circle cx={s.x} cy={s.y} r={4.5} fill="var(--card)" stroke={roleColor(role)} strokeWidth={2.5} />
              </g>
            );
          })}

          {/* cluster labels */}
          {/* labels sit on the ocean side of each cluster so they never leave the map */}
          {origin && (
            <text x={origin.x - 16} y={origin.y + 30} textAnchor="end" className="fill-foreground text-[14px] font-medium">
              {origin.text}
            </text>
          )}
          {dest && (
            <text x={dest.x + 16} y={dest.y + 30} className="fill-foreground text-[14px] font-medium">
              {dest.text}
            </text>
          )}

          {/* excursion marker */}
          {ex && (
            <g aria-hidden="true">
              {!reduce && (
                <motion.circle
                  cx={ex.x}
                  cy={ex.y}
                  r={9}
                  fill="none"
                  stroke="var(--warning)"
                  strokeWidth={2}
                  initial={{ scale: 1, opacity: 0.7 }}
                  animate={{ scale: 2.4, opacity: 0 }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                  style={{ transformOrigin: `${ex.x}px ${ex.y}px` }}
                />
              )}
              <line x1={ex.x} y1={ex.y + 10} x2={ex.x} y2={H - 118} stroke="var(--warning)" strokeWidth={1.25} strokeDasharray="3 3" strokeOpacity={0.8} />
              <circle cx={ex.x} cy={ex.y} r={7} fill="var(--warning)" stroke="var(--card)" strokeWidth={2} />
            </g>
          )}
        </svg>

        {/* excursion callout (HTML so it can wrap and use tokens) */}
        {ex && (
          <div
            className={cn(
              "pointer-events-none absolute bottom-3 hidden w-64 rounded-xl border border-warning/30 bg-card/95 p-3 text-xs shadow-raised backdrop-blur sm:block",
              ex.x > W * 0.5 ? "right-3" : "left-3",
            )}
          >
            <div className="flex items-center gap-1.5 font-semibold text-warning-fg">
              <Thermometer className="size-3.5" aria-hidden="true" />
              {formatTemp(ex.peakC)} peak · {formatDuration(ex.minutes)} above 8 °C
            </div>
            <div className="mt-1 text-foreground">{ex.placeName}</div>
            <div className="mt-0.5 text-muted-foreground">
              Held by {ex.custodian} ({CUSTODY_META[ex.role].label.toLowerCase()}) · {formatDateTime(ex.start)} UTC
            </div>
          </div>
        )}

        {/* stop tooltip */}
        {hover && (
          <div
            className="pointer-events-none absolute z-10 w-64 -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-lg border border-border bg-popover p-3 text-xs shadow-raised"
            style={{ left: pct(hover.x, W), top: pct(hover.y, H) }}
            role="tooltip"
          >
            <div className="font-semibold">{hover.name}</div>
            <ul className="mt-1.5 flex flex-col gap-1">
              {hover.events.map((e) => (
                <li key={e.seq} className="flex gap-2">
                  <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: roleColor(e.role) }} />
                  <span>
                    <span className="text-foreground">{e.custodian}</span>
                    <span className="block text-muted-foreground">
                      {e.activity} · {formatDateTime(e.from)}–{formatTime(e.to)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {ex && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft/60 p-3 text-xs sm:hidden">
          <div className="flex items-center gap-1.5 font-semibold text-warning-fg">
            <Thermometer className="size-3.5" aria-hidden="true" />
            {formatTemp(ex.peakC)} peak · {formatDuration(ex.minutes)} above 8 °C
          </div>
          <div className="mt-1 text-foreground">{ex.placeName}</div>
          <div className="mt-0.5 text-muted-foreground">
            Held by {ex.custodian} · {formatDateTime(ex.start)} UTC
          </div>
        </div>
      )}
      <CustodyChain chain={journey.chain} deliveredAt={deliveredAt} />
      {journey.unplaced > 0 && <p className="text-xs text-muted-foreground">{journey.unplaced} handling step(s) could not be placed on the map; they are listed in the chain.</p>}
    </div>
  );
}

/** Step-by-step tracking strip: who held the cargo, where, and when. */
export function CustodyChain({ chain, deliveredAt }: { chain: ChainStep[]; deliveredAt: string | null }) {
  return (
    <ol className="flex snap-x gap-2 overflow-x-auto pb-1" aria-label="Custody chain">
      {chain.map((s, i) => {
        const Icon = s.mode === "air" ? Plane : s.mode === "road" ? Truck : STAY_ICON[s.role];
        return (
          <li
            key={s.seq}
            className={cn(
              "relative flex w-40 shrink-0 snap-start flex-col gap-1 overflow-hidden rounded-lg border bg-card p-2.5 pt-3 text-xs",
              s.excursion ? "border-warning/50 bg-warning-soft/60" : "border-border",
            )}
          >
            <span className="absolute inset-x-0 top-0 h-1" style={{ background: CUSTODY_META[s.role].colorVar }} aria-hidden="true" />
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="line-clamp-2 text-muted-foreground">{s.activity}</span>
            <span className="num mt-auto text-[11px] text-subtle">
              {formatDateTime(s.from)}
              {i === chain.length - 1 && deliveredAt ? " → delivered" : ""}
            </span>
            <span className="text-[11px] font-medium" style={{ color: "var(--muted-foreground)" }}>
              {CUSTODY_META[s.role].label}
              {!s.controlled && <span className="text-warning-fg"> · ambient</span>}
            </span>
            {s.excursion && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warning-fg">
                <Thermometer className="size-3" aria-hidden="true" />
                Excursion here
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
