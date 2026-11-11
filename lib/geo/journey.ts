import type { CaseRecord, CustodySegmentRecord } from "@/lib/case/record";
import type { CustodyParty } from "@/lib/domain/parties";
import { greatCircle, project } from "./projection";

/**
 * Turns custody segments into a map journey: stops (places), legs (road or air)
 * and where the excursion happened. Place names are resolved from the free-text
 * locations in the handling events with a small gazetteer of cargo hubs.
 */

interface Place {
  id: string;
  name: string;
  short: string;
  lat: number;
  lon: number;
  match: RegExp;
}

/** Order matters: more specific patterns first. */
const PLACES: Place[] = [
  { id: "MARBURG", name: "Marburg, DE", short: "Marburg", lat: 50.81, lon: 8.77, match: /marburg/i },
  { id: "LEIDEN", name: "Leiden, NL", short: "Leiden", lat: 52.16, lon: 4.49, match: /leiden/i },
  { id: "AMS", name: "Amsterdam Schiphol (AMS)", short: "AMS", lat: 52.31, lon: 4.76, match: /schiphol|\bAMS\b/i },
  { id: "FRA", name: "Frankfurt Airport (FRA)", short: "FRA", lat: 50.03, lon: 8.56, match: /\bFRA\b|frankfurt|cargo city/i },
  { id: "CHELSEA", name: "Chelsea, MA", short: "Chelsea", lat: 42.39, lon: -71.03, match: /chelsea/i },
  { id: "BOS", name: "Boston Logan (BOS)", short: "BOS", lat: 42.36, lon: -71.01, match: /\bBOS\b|logan/i },
  { id: "BOSTON", name: "Boston, MA", short: "Boston", lat: 42.35, lon: -71.05, match: /boston/i },
  { id: "JAMAICA", name: "Jamaica, NY", short: "Jamaica NY", lat: 40.7, lon: -73.8, match: /jamaica/i },
  { id: "JFK", name: "New York JFK (JFK)", short: "JFK", lat: 40.64, lon: -73.78, match: /\bJFK\b/i },
  { id: "NEWARK", name: "Newark, NJ", short: "Newark", lat: 40.74, lon: -74.17, match: /newark/i },
];

function resolve(text: string): Place | null {
  return PLACES.find((p) => p.match.test(text)) ?? null;
}

/** "Road Marburg -> Frankfurt", "Flight BO 404 FRA -> BOS" → [from, to] */
function resolveMove(location: string): [Place, Place] | null {
  const m = location.match(/(.+?)\s*(?:->|→)\s*(.+)/);
  if (!m) return null;
  const a = resolve(m[1]);
  const b = resolve(m[2]);
  return a && b ? [a, b] : null;
}

export interface JourneyStop {
  id: string;
  name: string;
  short: string;
  x: number;
  y: number;
  roles: CustodyParty[];
  /** Segments that happened here (for the tooltip) */
  events: { seq: number; role: CustodyParty; custodian: string; activity: string; from: string; to: string }[];
  side: "origin" | "destination";
}

export interface JourneyLeg {
  seq: number;
  mode: "road" | "air";
  role: CustodyParty;
  custodian: string;
  from: string;
  to: string;
  d: string;
  /** Midpoint for labels */
  mid: [number, number];
}

export interface Journey {
  stops: JourneyStop[];
  legs: JourneyLeg[];
  excursion: {
    x: number;
    y: number;
    placeName: string;
    peakC: number;
    minutes: number;
    custodian: string;
    role: CustodyParty;
    activity: string;
    start: string;
  } | null;
  /** Segments whose location could not be placed on the map */
  unplaced: number;
  /** The full custody chain, in order, for the tracking strip */
  chain: ChainStep[];
}

export interface ChainStep {
  seq: number;
  role: CustodyParty;
  custodian: string;
  mode: "stay" | "road" | "air";
  label: string;
  activity: string;
  from: string;
  to: string;
  controlled: boolean;
  excursion: boolean;
}

const pathOf = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

export function buildJourney(record: CaseRecord): Journey | null {
  const segments: CustodySegmentRecord[] = record.custody?.segments ?? [];
  if (!segments.length) return null;
  const stops = new Map<string, JourneyStop>();
  const legs: JourneyLeg[] = [];
  let unplaced = 0;

  const stopFor = (p: Place) => {
    let s = stops.get(p.id);
    if (!s) {
      const [x, y] = project(p.lat, p.lon);
      s = { id: p.id, name: p.name, short: p.short, x, y, roles: [], events: [], side: p.lon < -30 ? "destination" : "origin" };
      stops.set(p.id, s);
    }
    return s;
  };

  const positions = new Map<number, [number, number]>();
  const chain: ChainStep[] = [];
  const attrSeq = record.custody?.attribution?.segmentSeq;
  for (const seg of segments) {
    const move = resolveMove(seg.location);
    const ev = { seq: seg.seq, role: seg.role, custodian: seg.custodian, activity: seg.activity, from: seg.from, to: seg.to };
    const step = (mode: ChainStep["mode"], label: string) =>
      chain.push({ seq: seg.seq, role: seg.role, custodian: seg.custodian, mode, label, activity: seg.activity, from: seg.from, to: seg.to, controlled: seg.controlled, excursion: seg.seq === attrSeq });
    if (move) {
      const [a, b] = move;
      stopFor(a);
      stopFor(b);
      const air = /flight/i.test(seg.location) || /flight/i.test(seg.activity);
      const pts: [number, number][] = air ? greatCircle([a.lat, a.lon], [b.lat, b.lon]).map(([lat, lon]) => project(lat, lon)) : [project(a.lat, a.lon), project(b.lat, b.lon)];
      const mid = pts[Math.floor(pts.length / 2)];
      step(air ? "air" : "road", `${a.short} → ${b.short}`);
      legs.push({ seq: seg.seq, mode: air ? "air" : "road", role: seg.role, custodian: seg.custodian, from: a.short, to: b.short, d: pathOf(pts), mid });
      positions.set(seg.seq, mid);
      continue;
    }
    const p = resolve(seg.location);
    if (!p) {
      unplaced++;
      step("stay", seg.location.split(/[,-]/)[0].trim());
      continue;
    }
    step("stay", p.short);
    const s = stopFor(p);
    if (!s.roles.includes(seg.role)) s.roles.push(seg.role);
    s.events.push(ev);
    positions.set(seg.seq, [s.x, s.y]);
  }

  let excursion: Journey["excursion"] = null;
  const attr = record.custody?.attribution;
  const ex = record.excursions?.find((e) => e.direction === "high") ?? record.excursions?.[0];
  if (attr && ex) {
    const pos = positions.get(attr.segmentSeq);
    if (pos) {
      const seg = segments.find((s) => s.seq === attr.segmentSeq)!;
      excursion = {
        x: pos[0],
        y: pos[1],
        placeName: seg.location,
        peakC: ex.peakC,
        minutes: ex.minutes,
        custodian: attr.custodian,
        role: attr.role,
        activity: attr.activity,
        start: ex.start,
      };
    }
  }
  return { stops: [...stops.values()], legs, excursion, unplaced, chain };
}
