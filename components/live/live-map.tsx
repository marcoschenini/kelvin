"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Boxes, Building2, Euro, Gauge, Plane, Search, ShieldAlert, Thermometer, Truck, Warehouse, X, type LucideIcon } from "lucide-react";
import worldDots from "@/lib/geo/world-dots.json";
import { REGIONS, type RegionId } from "@/lib/geo/world";
import { CUSTODY_META } from "@/lib/domain/parties";
import { formatDateTime, formatEUR, formatEURCompact, formatTemp } from "@/lib/format";
import { AIRPORTS, FLEET, demoCaseFor, history, routePath, simulate, type LiveState, type LiveStatus } from "@/lib/live/fleet";
import { cn } from "@/lib/utils";

const W = worldDots.width;
const H = worldDots.height;
const SPEEDS = [1, 60, 600] as const;

const STATUS: Record<LiveStatus, { label: string; chip: string; dot: string; rank: number }> = {
  excursion: { label: "Excursion", chip: "bg-warning text-white", dot: "bg-warning", rank: 0 },
  at_risk: { label: "At risk", chip: "bg-warning-soft text-warning-fg ring-1 ring-inset ring-warning/30", dot: "bg-warning/60", rank: 1 },
  in_range: { label: "In range", chip: "bg-success-soft text-success-fg ring-1 ring-inset ring-success/25", dot: "bg-success", rank: 2 },
};

const subscribe = () => () => {};
const useMounted = () => useSyncExternalStore(subscribe, () => true, () => false);

/** Simulation clock: real time × speed, continuous when the speed changes. */
function useSimClock(speed: number) {
  const anchor = useRef<{ real: number; sim: number; speed: number } | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const real = Date.now();
    const prev = anchor.current;
    const sim = prev ? prev.sim + (real - prev.real) * prev.speed : real;
    anchor.current = { real, sim, speed };
    const tick = () => {
      const a = anchor.current!;
      setNow(a.sim + (Date.now() - a.real) * a.speed);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [speed]);
  return now;
}

function durationText(ms: number) {
  const m = Math.max(0, Math.round(ms / 60_000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min`;
}

function LegIcon({ s, className, style }: { s: LiveState; className?: string; style?: React.CSSProperties }) {
  const p = { className, style, "aria-hidden": true as const };
  if (s.leg.mode === "air") return <Plane {...p} />;
  if (s.leg.mode === "road") return <Truck {...p} />;
  return s.leg.role === "airline" ? <Plane {...p} /> : s.leg.role === "forwarder" ? <Warehouse {...p} /> : <Building2 {...p} />;
}

function StatusChip({ status }: { status: LiveStatus }) {
  return <span className={cn("inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold", STATUS[status].chip)}>{STATUS[status].label}</span>;
}

function Sparkline({ points, now }: { points: { t: number; c: number }[]; now: number }) {
  if (points.length < 2) return null;
  const w = 300;
  const h = 84;
  const t0 = points[0].t;
  const t1 = Math.max(points[points.length - 1].t, t0 + 1);
  const yMax = Math.max(12, Math.ceil(Math.max(...points.map((p) => p.c)) + 1));
  const x = (t: number) => ((t - t0) / (t1 - t0)) * w;
  const y = (c: number) => h - (c / yMax) * h;
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.c).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" role="img" aria-label="Logger temperature, last 12 hours">
      <rect x={0} y={y(8)} width={w} height={y(2) - y(8)} fill="var(--cold-soft)" />
      <line x1={0} x2={w} y1={y(8)} y2={y(8)} stroke="var(--cold)" strokeDasharray="3 3" strokeOpacity={0.6} />
      <line x1={0} x2={w} y1={y(2)} y2={y(2)} stroke="var(--cold)" strokeDasharray="3 3" strokeOpacity={0.6} />
      <path d={d} fill="none" stroke="var(--chart-ink)" strokeWidth={1.75} strokeLinejoin="round" />
      {points.map((p, i) =>
        p.c > 8 || p.c < 2 ? <circle key={i} cx={x(p.t)} cy={y(p.c)} r={2} fill="var(--warning)" /> : null,
      )}
      <text x={2} y={y(8) - 3} className="fill-muted-foreground text-[9px]">8 °C</text>
      <text x={w - 2} y={h - 2} textAnchor="end" className="fill-muted-foreground text-[9px]">
        {formatDateTime(now)}
      </text>
    </svg>
  );
}

function Detail({ s, now, onClose }: { s: LiveState; now: number; onClose: () => void }) {
  const ship = s.ship;
  const pts = useMemo(() => history(s, now), [s, now]);
  const demo = demoCaseFor(s.leg.role);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="num text-lg font-semibold">{ship.shipmentRef}</span>
            <StatusChip status={s.status} />
          </div>
          <div className="num mt-0.5 text-sm text-muted-foreground">
            {ship.origin} {AIRPORTS[ship.origin].city} → {ship.destination} {AIRPORTS[ship.destination].city}
          </div>
        </div>
        <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back to all shipments">
          <X className="size-4" />
        </button>
      </div>

      <div className="rounded-xl border border-border p-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="grid size-7 place-items-center rounded-lg text-white" style={{ background: CUSTODY_META[s.leg.role].colorVar }}>
            <LegIcon s={s} className="size-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{s.leg.activity}</span>
            <span className="block text-xs text-muted-foreground">
              Held by {s.leg.custodian} ({CUSTODY_META[s.leg.role].label.toLowerCase()})
            </span>
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="bg-ai h-full rounded-full" style={{ width: `${Math.round(s.progress * 100)}%` }} />
        </div>
        <div className="num mt-1.5 flex justify-between text-[11px] text-muted-foreground">
          <span>{Math.round(s.progress * 100)}% of trip</span>
          <span>ETA {formatDateTime(s.eta)} UTC · in {durationText(s.eta - now)}</span>
        </div>
      </div>

      <div className="rounded-xl border border-border p-3">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-xs text-muted-foreground">Logger now</div>
            <div className={cn("num text-2xl leading-tight font-semibold", s.tempC > 8 || s.tempC < 2 ? "text-warning-fg" : "")}>{formatTemp(s.tempC)}</div>
          </div>
          <div className="num text-right text-xs text-muted-foreground">
            Trip peak <span className={cn("font-semibold", s.tripPeakC > 8 ? "text-warning-fg" : "text-foreground")}>{formatTemp(s.tripPeakC)}</span>
            {s.minutesOutOfRange > 0 && <div>{s.minutesOutOfRange} min out of range</div>}
          </div>
        </div>
        <Sparkline points={pts} now={now} />
        <div className="text-[11px] text-muted-foreground">Logger {ship.loggerId} · last 12 h, 15-min readings</div>
      </div>

      {s.status === "excursion" && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm">
          <div className="flex items-center gap-1.5 font-semibold text-warning-fg">
            <ShieldAlert className="size-4" aria-hidden="true" />
            Alert raised to the claims team
          </div>
          <p className="mt-1 text-muted-foreground">
            The logger left 2–8 °C on this trip. Kelvin opens a case as soon as the shipment is delivered and the logger file arrives.
          </p>
          <Link href={`/cases/${demo.id}`} className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-ai-fg hover:underline">
            See how Kelvin handles it: {demo.label}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}

      <dl className="num grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Product</dt>
          <dd className="font-medium">{ship.product}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Value</dt>
          <dd className="font-medium">{formatEUR(ship.valueEur)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Shipper</dt>
          <dd className="font-medium">{ship.shipper}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Weight</dt>
          <dd className="font-medium">{ship.weightKg} kg</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Forwarder</dt>
          <dd className="font-medium">{ship.forwarder}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Airline</dt>
          <dd className="font-medium">
            {ship.airline} · {ship.flight}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function LiveMap() {
  const mounted = useMounted();
  const reduce = useReducedMotion();
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(60);
  const now = useSimClock(speed);
  const [region, setRegion] = useState<RegionId>("world");
  const [filter, setFilter] = useState<LiveStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const states = useMemo(() => (now ? FLEET.map((s) => simulate(s, now)).filter((s) => s.inTransit) : []), [now]);
  const counts = useMemo(() => {
    const c = { all: states.length, in_range: 0, at_risk: 0, excursion: 0 } as Record<LiveStatus | "all", number>;
    for (const s of states) c[s.status]++;
    return c;
  }, [states]);
  const value = states.reduce((sum, s) => sum + s.ship.valueEur, 0);
  const q = query.trim().toLowerCase();
  const visible = states
    .filter((s) => filter === "all" || s.status === filter)
    .filter(
      (s) =>
        !q ||
        [s.ship.shipmentRef, s.ship.product, s.ship.origin, s.ship.destination, AIRPORTS[s.ship.origin].city, AIRPORTS[s.ship.destination].city, s.leg.custodian]
          .join(" ")
          .toLowerCase()
          .includes(q),
    )
    .sort((a, b) => STATUS[a.status].rank - STATUS[b.status].rank || a.ship.shipmentRef.localeCompare(b.ship.shipmentRef));
  const sel = states.find((s) => s.ship.id === selected) ?? null;
  const hov = states.find((s) => s.ship.id === hover) ?? null;
  // Zoom: fit the region box inside the map frame, centred and clamped to the map.
  const box = REGIONS[region].box;
  const zs = Math.min(W / box[2], H / box[3]);
  const vw = W / zs;
  const vh = H / zs;
  const x0 = Math.min(Math.max(box[0] + box[2] / 2 - vw / 2, 0), W - vw);
  const y0 = Math.min(Math.max(box[1] + box[3] / 2 - vh / 2, 0), H - vh);
  const k = 1 / zs; // keeps markers the same on-screen size when zoomed
  const pct = (v: number, axis: "x" | "y") => (axis === "x" ? ((v - x0) / vw) * 100 : ((v - y0) / vh) * 100);
  const routes = useMemo(() => (sel ? routePath(sel.ship) : []), [sel]);

  const kpis: { label: string; value: string; icon: LucideIcon; tone: string }[] = [
    { label: "In transit", value: String(counts.all), icon: Boxes, tone: "bg-ai-soft text-ai-fg" },
    { label: "Value in transit", value: formatEURCompact(value), icon: Euro, tone: "bg-muted text-muted-foreground" },
    { label: "In range", value: String(counts.in_range), icon: Gauge, tone: "bg-success-soft text-success" },
    { label: "At risk", value: String(counts.at_risk), icon: Thermometer, tone: "bg-warning-soft text-warning" },
    { label: "Excursions", value: String(counts.excursion), icon: ShieldAlert, tone: "bg-warning-soft text-warning" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((kp) => (
          <div key={kp.label} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-card">
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", kp.tone)}>
              <kp.icon className="size-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs text-muted-foreground">{kp.label}</span>
              <span className="num block text-lg leading-tight font-semibold">{mounted ? kp.value : "–"}</span>
            </span>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border bg-card p-0.5" role="group" aria-label="Zoom to region">
          {(Object.keys(REGIONS) as RegionId[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRegion(r)}
              aria-pressed={region === r}
              className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", region === r ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
            >
              {REGIONS[r].label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
          {(["all", "excursion", "at_risk", "in_range"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors",
                filter === f ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {f !== "all" && <span className={cn("size-2 rounded-full", STATUS[f].dot)} aria-hidden="true" />}
              {f === "all" ? "All" : STATUS[f].label}
              <span className="num opacity-70">{mounted ? counts[f] : ""}</span>
            </button>
          ))}
        </div>
        <label className="relative ml-auto flex min-w-[12rem] flex-1 items-center sm:flex-none">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-subtle" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search shipment, city, product"
            className="h-8 w-full rounded-lg border border-border bg-card pr-2 pl-8 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-60"
            aria-label="Search shipments"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Map */}
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-card">
          <div className="relative" style={{ aspectRatio: `${W} / ${H}` }}>
            <svg
              className="absolute inset-0 size-full"
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="xMidYMid meet"
              role="img"
              aria-label={`Live map of ${counts.all} shipments in transit, ${counts.excursion} with an excursion and ${counts.at_risk} at risk. The list beside the map has the same data.`}
            >
              <g
                style={{
                  transform: `scale(${zs}) translate(${-x0}px, ${-y0}px)`,
                  transformOrigin: "0 0",
                  transition: reduce ? undefined : "transform 600ms cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              >
              <g fill="var(--map-land)">
                {worldDots.dots.map(([x, y], i) => (
                  <circle key={i} cx={x} cy={y} r={1.5} />
                ))}
              </g>

              {/* selected route */}
              {routes.map((d, i) => (
                <path key={i} d={d} fill="none" stroke={CUSTODY_META[sel!.leg.role].colorVar} strokeWidth={1.6 * k} strokeDasharray={`${5 * k} ${4 * k}`} strokeLinecap="round" opacity={0.9} />
              ))}

              {mounted &&
                visible.map((s) => {
                  const isSel = s.ship.id === selected;
                  const color = CUSTODY_META[s.leg.role].colorVar;
                  const r = (s.leg.mode === "stay" ? 3.6 : 3) * k * (isSel ? 1.4 : 1);
                  return (
                    <g
                      key={s.ship.id}
                      style={{ transform: `translate(${s.xy[0]}px, ${s.xy[1]}px)`, transition: reduce || speed === 1 ? undefined : "transform 1s linear" }}
                      onMouseEnter={() => setHover(s.ship.id)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => setSelected(s.ship.id)}
                      className="cursor-pointer"
                    >
                      <circle r={10 * k} fill="transparent" />
                      {s.status === "excursion" && !reduce && (
                        <motion.circle
                          r={r}
                          fill="none"
                          stroke="var(--warning)"
                          strokeWidth={1.5 * k}
                          initial={{ scale: 1, opacity: 0.8 }}
                          animate={{ scale: 3, opacity: 0 }}
                          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                        />
                      )}
                      <circle
                        r={r}
                        fill={s.status === "excursion" ? "var(--warning)" : s.leg.mode === "stay" ? "var(--card)" : color}
                        stroke={s.status === "at_risk" ? "var(--warning)" : s.status === "excursion" ? "var(--card)" : color}
                        strokeWidth={(s.status === "at_risk" ? 2 : 1.4) * k}
                      />
                      {isSel && <circle r={r + 3.5 * k} fill="none" stroke="var(--foreground)" strokeWidth={1 * k} />}
                    </g>
                  );
                })}
              </g>
            </svg>

            {!mounted && <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Connecting to loggers…</div>}

            {/* hover tooltip */}
            {hov && mounted && (
              <div
                className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-lg border border-border bg-popover p-2.5 text-xs shadow-raised"
                style={{ left: `${pct(hov.xy[0], "x")}%`, top: `${pct(hov.xy[1], "y")}%` }}
                role="tooltip"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="num font-semibold">{hov.ship.shipmentRef}</span>
                  <StatusChip status={hov.status} />
                </div>
                <div className="num mt-0.5 text-muted-foreground">
                  {hov.ship.origin} → {hov.ship.destination} · {formatTemp(hov.tempC)}
                </div>
                <div className="mt-0.5 truncate">{hov.leg.activity}</div>
              </div>
            )}
          </div>

          {/* legend + clock */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: "var(--custody-airline)" }} />
              Airline
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ background: "var(--custody-forwarder)" }} />
              Forwarder
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border-2 border-subtle bg-card" />
              At a hub
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full border-2 border-warning bg-card" />
              At risk
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full bg-warning" />
              Excursion
            </span>
            <span className="ml-auto flex items-center gap-2">
              <span className="num">{mounted ? `${formatDateTime(now)} UTC` : ""}</span>
              <span className="flex rounded-md border border-border p-0.5" role="group" aria-label="Simulation speed">
                {SPEEDS.map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => setSpeed(sp)}
                    aria-pressed={speed === sp}
                    className={cn("num rounded px-1.5 py-0.5 text-[11px] font-medium", speed === sp ? "bg-foreground text-background" : "hover:text-foreground")}
                  >
                    {sp === 1 ? "Live" : `${sp}×`}
                  </button>
                ))}
              </span>
            </span>
          </div>
        </div>

        {/* Side panel */}
        <aside className="rounded-2xl border border-border bg-card p-4 shadow-card">
          {sel ? (
              <div key="detail" className="animate-in fade-in-0 slide-in-from-right-2 duration-200">
                <Detail s={sel} now={now} onClose={() => setSelected(null)} />
              </div>
            ) : (
              <div key="list" className="animate-in fade-in-0 slide-in-from-left-2 duration-200">
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="text-[15px] font-semibold">Shipments in transit</h2>
                  <span className="num text-xs text-muted-foreground">{mounted ? visible.length : ""}</span>
                </div>
                <ul className="-mx-1 flex max-h-[34rem] flex-col overflow-y-auto" aria-label="Shipments">
                  {visible.map((s) => {
                    return (
                      <li key={s.ship.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(s.ship.id)}
                          onMouseEnter={() => setHover(s.ship.id)}
                          onMouseLeave={() => setHover(null)}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted"
                        >
                          <span className={cn("size-2 shrink-0 rounded-full", STATUS[s.status].dot)} aria-label={STATUS[s.status].label} />
                          <span className="min-w-0 flex-1">
                            <span className="num block text-sm font-medium">
                              {s.ship.shipmentRef} <span className="font-normal text-muted-foreground">{s.ship.origin} → {s.ship.destination}</span>
                            </span>
                            <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                              <LegIcon s={s} className="size-3 shrink-0" style={{ color: CUSTODY_META[s.leg.role].colorVar }} />
                              <span className="truncate">{s.leg.activity}</span>
                            </span>
                          </span>
                          <span className={cn("num text-sm font-semibold", s.tempC > 8 || s.tempC < 2 ? "text-warning-fg" : "")}>{formatTemp(s.tempC)}</span>
                        </button>
                      </li>
                    );
                  })}
                  {mounted && visible.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted-foreground">No shipment matches.</li>}
                </ul>
              </div>
            )}
        </aside>
      </div>
      <p className="text-xs text-muted-foreground">
        Synthetic data: shipments, companies, positions and logger readings are simulated. Speeds above Live run a time-lapse of the same schedule.
      </p>
    </div>
  );
}
