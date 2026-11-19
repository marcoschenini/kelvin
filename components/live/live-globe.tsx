"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { animate } from "motion/react";
import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import landTopo from "world-atlas/land-110m.json";
import { CUSTODY_META } from "@/lib/domain/parties";
import { AIRPORTS, type LiveState } from "@/lib/live/fleet";
import type { RegionId } from "@/lib/geo/world";
import { formatTemp } from "@/lib/format";
import { cn } from "@/lib/utils";

/*
 * Interactive globe for the live view: drag (or arrow keys) to turn it, it drifts slowly when idle,
 * region buttons and a selected shipment turn it to face them. Same Natural Earth 1:110m land as the flat map.
 */
const VW = 1000;
const VH = 560;
const R = 255;

const topo = landTopo as unknown as Topology;
const LAND = feature(topo, topo.objects.land);
const GRATICULE = geoGraticule10();
const SPHERE = { type: "Sphere" } as const;
const HUBS = Object.values(AIRPORTS).map((a) => [a.lon, a.lat] as [number, number]);

/** Rotation [λ, φ] that brings each region to the front. */
const REGION_VIEW: Record<RegionId, [number, number]> = {
  world: [-20, -25],
  europe: [-10, -42],
  americas: [85, -35],
  asia: [-115, -18],
};

const wrap = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;

export function LiveGlobe({
  states,
  selected,
  hover,
  region,
  reduce,
  label,
  onSelect,
  onHover,
}: {
  states: LiveState[];
  selected: string | null;
  hover: string | null;
  region: RegionId;
  reduce: boolean;
  label: string;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const [rot, setRot] = useState<[number, number]>(REGION_VIEW.world);
  const rotRef = useRef(rot);
  useEffect(() => {
    rotRef.current = rot;
  }, [rot]);
  const drag = useRef<{ x: number; y: number; r: [number, number]; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // Turn smoothly to a target rotation (shortest way round).
  const turnTo = (target: [number, number]) => {
    const [l0, p0] = rotRef.current;
    const dl = wrap(target[0] - l0);
    const dp = target[1] - p0;
    if (reduce) return setRot([wrap(l0 + dl), p0 + dp]);
    return animate(0, 1, { duration: 0.9, ease: [0.4, 0, 0.2, 1], onUpdate: (t) => setRot([wrap(l0 + dl * t), p0 + dp * t]) });
  };

  useEffect(() => {
    const a = turnTo(REGION_VIEW[region]);
    return () => a?.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  const selState = states.find((s) => s.ship.id === selected);
  const selLat = selState?.latLon[0];
  const selLon = selState?.latLon[1];
  useEffect(() => {
    if (selLat == null || selLon == null) return;
    const a = turnTo([-selLon, Math.max(-60, Math.min(60, -selLat))]);
    return () => a?.stop();
    // Only when a different shipment is selected, not on every simulation tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Slow drift when nobody is interacting.
  const idle = !reduce && !dragging && !hover && !selected;
  useEffect(() => {
    if (!idle) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = t - last;
      last = t;
      setRot(([l, p]) => [wrap(l + dt * 0.006), p]);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [idle]);

  const projection = useMemo(() => geoOrthographic().translate([VW / 2, VH / 2]).scale(R).rotate(rot).clipAngle(90), [rot]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const front: [number, number] = [-rot[0], -rot[1]];
  const onFront = (lonLat: [number, number]) => geoDistance(lonLat, front) < Math.PI / 2 - 0.02;

  const lanes = useMemo(
    () =>
      states.map((s) => ({
        id: s.ship.id,
        color: s.status === "excursion" ? "var(--warning)" : CUSTODY_META[s.leg.role].colorVar,
        geo: {
          type: "MultiLineString" as const,
          coordinates: s.ship.legs.filter((l) => l.mode !== "stay").map((l) => [[l.from[1], l.from[0]], [l.to[1], l.to[0]]]),
        },
      })),
    [states],
  );

  const toPct = (x: number, y: number) => ({ left: `${(x / VW) * 100}%`, top: `${(y / VH) * 100}%` });
  const hov = states.find((s) => s.ship.id === hover);
  const hovXY = hov && onFront([hov.latLon[1], hov.latLon[0]]) ? projection([hov.latLon[1], hov.latLon[0]]) : null;

  // Pointer: drag anywhere on the globe to turn it.
  const scale = () => {
    const r = svgRef.current?.getBoundingClientRect();
    return r ? VW / r.width : 1;
  };
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, r: rotRef.current, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const k = (scale() * 90) / R; // ~ degrees per screen pixel at the globe centre
    const dx = (e.clientX - d.x) * k * 0.6;
    const dy = (e.clientY - d.y) * k * 0.6;
    if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true;
    setRot([wrap(d.r[0] + dx), Math.max(-75, Math.min(75, d.r[1] - dy))]);
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 30 : 10;
    const [l, p] = rotRef.current;
    const next: Record<string, [number, number]> = {
      ArrowLeft: [wrap(l + step), p],
      ArrowRight: [wrap(l - step), p],
      ArrowUp: [l, Math.max(-75, p - step)],
      ArrowDown: [l, Math.min(75, p + step)],
    };
    if (next[e.key]) {
      e.preventDefault();
      setRot(next[e.key]);
    }
  };

  return (
    <div className="relative" style={{ aspectRatio: `${VW} / ${VH}` }}>
      <svg
        ref={svgRef}
        className={cn("absolute inset-0 size-full touch-none select-none focus-visible:outline-none", dragging ? "cursor-grabbing" : "cursor-grab")}
        viewBox={`0 0 ${VW} ${VH}`}
        role="img"
        aria-label={`${label} Drag or use the arrow keys to turn the globe.`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <path d={path(SPHERE) ?? undefined} fill="var(--map-ocean)" stroke="var(--map-coast)" strokeWidth={1} />
        <path d={path(GRATICULE) ?? undefined} fill="none" stroke="var(--map-land)" strokeWidth={0.6} opacity={0.7} />
        <path d={path(LAND) ?? undefined} fill="var(--map-land)" stroke="var(--map-coast)" strokeWidth={0.6} strokeLinejoin="round" />

        {lanes.map((l) => (
          <path
            key={l.id}
            d={path(l.geo) ?? undefined}
            fill="none"
            stroke={l.color}
            strokeWidth={l.id === selected ? 2 : 1}
            strokeDasharray={l.id === selected ? "6 4" : undefined}
            strokeLinecap="round"
            opacity={l.id === selected ? 0.95 : selected ? 0.12 : 0.4}
          />
        ))}

        {HUBS.filter(onFront).map((h) => {
          const [x, y] = projection(h) ?? [0, 0];
          return <circle key={`${h[0]},${h[1]}`} cx={x} cy={y} r={1.8} fill="var(--muted-foreground)" opacity={0.7} aria-hidden="true" />;
        })}

        {states.map((s) => {
          const ll: [number, number] = [s.latLon[1], s.latLon[0]];
          if (!onFront(ll)) return null;
          const [x, y] = projection(ll) ?? [0, 0];
          const isSel = s.ship.id === selected;
          const color = CUSTODY_META[s.leg.role].colorVar;
          const r = (s.leg.mode === "stay" ? 4.5 : 3.8) * (isSel ? 1.35 : 1);
          return (
            <g
              key={s.ship.id}
              transform={`translate(${x} ${y})`}
              className="cursor-pointer"
              onPointerDown={(e) => e.stopPropagation()}
              onPointerEnter={() => onHover(s.ship.id)}
              onPointerLeave={() => onHover(null)}
              onClick={() => onSelect(s.ship.id)}
            >
              <circle r={11} fill="transparent" />
              {s.status === "excursion" && <circle r={r + 4} fill="none" stroke="var(--warning)" strokeWidth={1.5} opacity={0.6} />}
              <circle
                r={r}
                fill={s.status === "excursion" ? "var(--warning)" : s.leg.mode === "stay" ? "var(--card)" : color}
                stroke={s.status === "at_risk" ? "var(--warning)" : s.status === "excursion" ? "var(--card)" : color}
                strokeWidth={s.status === "at_risk" ? 2.2 : 1.5}
              />
              {isSel && <circle r={r + 4.5} fill="none" stroke="var(--foreground)" strokeWidth={1.2} />}
            </g>
          );
        })}
      </svg>

      {hov && hovXY && (
        <div
          className="pointer-events-none absolute z-10 w-52 -translate-x-1/2 -translate-y-[calc(100%+12px)] rounded-lg border border-border bg-popover p-2.5 text-xs shadow-raised"
          style={toPct(hovXY[0], hovXY[1])}
          role="tooltip"
        >
          <div className="num font-semibold">
            {hov.ref} · {hov.ship.origin} → {hov.ship.destination}
          </div>
          <div className="mt-0.5 text-muted-foreground">{hov.leg.activity}</div>
          <div className="num mt-1 font-medium">{formatTemp(hov.tempC)}</div>
        </div>
      )}
    </div>
  );
}
