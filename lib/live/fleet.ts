import type { CustodyParty } from "@/lib/domain/parties";
import { greatCircle } from "@/lib/geo/projection";
import { projectWorld } from "@/lib/geo/world";

/**
 * Synthetic live fleet. Every shipment repeats a realistic cold-chain trip
 * (truck → forwarder hub → airline acceptance and ramp → flight → import →
 * truck to consignee). Position and logger temperature are pure functions of
 * time, so the map is always populated, identical for every viewer, and needs
 * no database. All companies, products and loggers are fictional.
 */

const HOUR = 3_600_000;

export const AIRPORTS = {
  FRA: { city: "Frankfurt", lat: 50.03, lon: 8.56 },
  AMS: { city: "Amsterdam", lat: 52.31, lon: 4.76 },
  BRU: { city: "Brussels", lat: 50.9, lon: 4.48 },
  BSL: { city: "Basel", lat: 47.59, lon: 7.53 },
  ZRH: { city: "Zurich", lat: 47.46, lon: 8.55 },
  CDG: { city: "Paris", lat: 49.01, lon: 2.55 },
  LHR: { city: "London", lat: 51.47, lon: -0.45 },
  MXP: { city: "Milan", lat: 45.63, lon: 8.72 },
  MAD: { city: "Madrid", lat: 40.47, lon: -3.56 },
  CPH: { city: "Copenhagen", lat: 55.62, lon: 12.65 },
  DUB: { city: "Dublin", lat: 53.42, lon: -6.27 },
  BOS: { city: "Boston", lat: 42.36, lon: -71.01 },
  JFK: { city: "New York", lat: 40.64, lon: -73.78 },
  ORD: { city: "Chicago", lat: 41.97, lon: -87.9 },
  ATL: { city: "Atlanta", lat: 33.64, lon: -84.43 },
  RDU: { city: "Raleigh-Durham", lat: 35.88, lon: -78.79 },
  IND: { city: "Indianapolis", lat: 39.72, lon: -86.29 },
  LAX: { city: "Los Angeles", lat: 33.94, lon: -118.41 },
  YYZ: { city: "Toronto", lat: 43.68, lon: -79.63 },
  MEX: { city: "Mexico City", lat: 19.44, lon: -99.07 },
  GRU: { city: "São Paulo", lat: -23.43, lon: -46.47 },
  DXB: { city: "Dubai", lat: 25.25, lon: 55.36 },
  BOM: { city: "Mumbai", lat: 19.09, lon: 72.87 },
  SIN: { city: "Singapore", lat: 1.36, lon: 103.99 },
  HKG: { city: "Hong Kong", lat: 22.31, lon: 113.91 },
  PVG: { city: "Shanghai", lat: 31.14, lon: 121.81 },
  NRT: { city: "Tokyo", lat: 35.77, lon: 140.39 },
  ICN: { city: "Seoul", lat: 37.46, lon: 126.44 },
  SYD: { city: "Sydney", lat: -33.94, lon: 151.18 },
  JNB: { city: "Johannesburg", lat: -26.14, lon: 28.24 },
} as const;
export type Airport = keyof typeof AIRPORTS;

const FORWARDERS = ["NordStar Logistics", "Polder Freight Solutions", "Alpenkühl Logistik", "Harbor & Crane Logistics", "Sakura Cold Express", "Southern Cross Pharma Logistics"];
const AIRLINES = ["Boreal Air Cargo", "Westwind Cargo Airlines", "Aurora Freight Airlines", "Pacifica Cargo", "Corvus Cargo", "Halcyon Air Freight"];
const SHIPPERS = ["Rheinfeld Biologics", "Lumen Therapeutics", "Calder Pharma", "Vireo Vaccines", "Ostrava Biotech", "Kestrel Biosciences"];
const PRODUCTS = [
  "Orenvacept 40 mg PFS",
  "Lumetrazumab 200 mg vials",
  "Ventralix influenza vaccine",
  "Brivolimab 100 mg vials",
  "Avexatide pens",
  "Tesmarin vaccine",
  "Neprolux 5 mg ampoules",
  "Celvanib insulin pens",
];

/** [origin, destination, excursion profile]. Profiles make a few trips go wrong on purpose. */
type Profile = null | { kind: "excursion" | "near_miss"; leg: number; at: number; hours: number; peakC: number };
const LANES: [Airport, Airport, Profile][] = [
  ["FRA", "BOS", { kind: "excursion", leg: 2, at: 0.5, hours: 1.5, peakC: 12.8 }],
  ["AMS", "JFK", { kind: "excursion", leg: 1, at: 0.2, hours: 3.5, peakC: 14.6 }],
  ["BRU", "ORD", null],
  ["BSL", "SIN", { kind: "near_miss", leg: 4, at: 0.4, hours: 2, peakC: 7.7 }],
  ["ZRH", "NRT", null],
  ["CDG", "GRU", null],
  ["LHR", "DXB", null],
  ["MXP", "ATL", null],
  ["FRA", "PVG", { kind: "excursion", leg: 4, at: 0.3, hours: 2.5, peakC: 10.9 }],
  ["CPH", "RDU", null],
  ["DUB", "IND", null],
  ["AMS", "SIN", null],
  ["FRA", "YYZ", { kind: "near_miss", leg: 2, at: 0.6, hours: 1, peakC: 7.6 }],
  ["MAD", "MEX", null],
  ["BSL", "BOS", null],
  ["ZRH", "ICN", null],
  ["CDG", "JNB", null],
  ["LHR", "JFK", null],
  ["BRU", "HKG", { kind: "near_miss", leg: 1, at: 0.5, hours: 1.5, peakC: 7.8 }],
  ["SIN", "SYD", null],
  ["ICN", "LAX", null],
  ["BOM", "LHR", { kind: "excursion", leg: 0, at: 0.5, hours: 1, peakC: 9.4 }],
  ["DXB", "FRA", null],
  ["JFK", "CPH", null],
  ["BOS", "AMS", null],
  ["PVG", "FRA", null],
  ["GRU", "MAD", null],
  ["NRT", "ORD", null],
  ["HKG", "SYD", null],
  ["MXP", "DXB", null],
];

export type LegMode = "road" | "stay" | "air";

interface Leg {
  mode: LegMode;
  role: CustodyParty;
  custodian: string;
  activity: string;
  hours: number;
  from: [number, number];
  to: [number, number];
}

export interface FleetShipment {
  id: string;
  shipmentRef: string;
  product: string;
  shipper: string;
  forwarder: string;
  airline: string;
  flight: string;
  origin: Airport;
  destination: Airport;
  valueEur: number;
  weightKg: number;
  loggerId: string;
  baseC: number;
  profile: Profile;
  legs: Leg[];
  tripHours: number;
  cycleHours: number;
  offsetHours: number;
}

/** Deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

function buildFleet(): FleetShipment[] {
  const rand = rng(20261113);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  return LANES.map(([o, d, profile], i) => {
    const A = AIRPORTS[o];
    const B = AIRPORTS[d];
    const forwarder = pick(FORWARDERS);
    const airline = pick(AIRLINES);
    const site = (p: { lat: number; lon: number }): [number, number] => [p.lat + (rand() - 0.5) * 1.2, p.lon + (rand() - 0.5) * 1.6];
    const shipperSite = site(A);
    const consigneeSite = site(B);
    const flightHours = Math.round((distanceKm(A, B) / 820 + 0.6) * 10) / 10;
    const legs: Leg[] = [
      { mode: "road", role: "forwarder", custodian: forwarder, activity: `Reefer truck to ${A.city} hub`, hours: 1.5 + rand() * 2, from: shipperSite, to: [A.lat, A.lon] },
      { mode: "stay", role: "forwarder", custodian: forwarder, activity: `${forwarder} cold room, ${o}`, hours: 3 + rand() * 4, from: [A.lat, A.lon], to: [A.lat, A.lon] },
      { mode: "stay", role: "airline", custodian: airline, activity: `Acceptance and ramp, ${o}`, hours: 3 + rand() * 2, from: [A.lat, A.lon], to: [A.lat, A.lon] },
      { mode: "air", role: "airline", custodian: airline, activity: `Flight ${o} → ${d}`, hours: flightHours, from: [A.lat, A.lon], to: [B.lat, B.lon] },
      { mode: "stay", role: "airline", custodian: airline, activity: `Import cool room, ${d}`, hours: 4 + rand() * 5, from: [B.lat, B.lon], to: [B.lat, B.lon] },
      { mode: "road", role: "forwarder", custodian: forwarder, activity: `Reefer truck to consignee, ${B.city}`, hours: 1.5 + rand() * 2.5, from: [B.lat, B.lon], to: consigneeSite },
    ];
    const tripHours = legs.reduce((s, l) => s + l.hours, 0);
    const cycleHours = tripHours + 2 + rand() * 6;
    const code = airline.slice(0, 1) + airline.split(" ")[1].slice(0, 1);
    return {
      id: `live-${String(i + 1).padStart(2, "0")}`,
      shipmentRef: `KV-${(41200 + i * 37).toString()}`,
      product: pick(PRODUCTS),
      shipper: pick(SHIPPERS),
      forwarder,
      airline,
      flight: `${code} ${100 + Math.floor(rand() * 800)}`,
      origin: o,
      destination: d,
      valueEur: Math.round((60 + rand() * 440) * 1000 / 500) * 500,
      weightKg: Math.round(40 + rand() * 260),
      loggerId: `CT5-${90000 + Math.floor(rand() * 9999)}`,
      baseC: 4.4 + rand() * 1.2,
      profile,
      legs,
      tripHours,
      cycleHours,
      offsetHours: rand() * cycleHours,
    };
  });
}

export const FLEET = buildFleet();

/* -------------------------------------------------------------- simulation */

export type LiveStatus = "in_range" | "at_risk" | "excursion";

export interface LiveState {
  ship: FleetShipment;
  /** false between trips (delivered, next trip not started) */
  inTransit: boolean;
  tripStart: number;
  eta: number;
  progress: number;
  legIndex: number;
  leg: Leg;
  latLon: [number, number];
  xy: [number, number];
  tempC: number;
  /** Highest reading on this trip so far */
  tripPeakC: number;
  minutesOutOfRange: number;
  status: LiveStatus;
}

/** Hours since the trip started → which leg, how far into it. */
function locate(ship: FleetShipment, h: number) {
  let acc = 0;
  for (let i = 0; i < ship.legs.length; i++) {
    const l = ship.legs[i];
    if (h < acc + l.hours) return { legIndex: i, frac: (h - acc) / l.hours, legStart: acc };
    acc += l.hours;
  }
  return { legIndex: ship.legs.length - 1, frac: 1, legStart: acc - ship.legs[ship.legs.length - 1].hours };
}

/** Logger temperature at `h` hours into the trip (deterministic, smooth noise). */
export function tempAt(ship: FleetShipment, h: number, tripIndex: number): number {
  const seed = ship.baseC * 10 + tripIndex * 1.7;
  let t = ship.baseC + 0.35 * Math.sin(h / 2.7 + seed) + 0.18 * Math.sin(h * 1.9 + seed * 2) + 0.08 * Math.sin(h * 7.3 + seed);
  const p = ship.profile;
  if (p) {
    let acc = 0;
    for (let i = 0; i < p.leg; i++) acc += ship.legs[i].hours;
    const start = acc + ship.legs[p.leg].hours * p.at;
    const end = start + p.hours;
    if (h > start - 0.4 && h < end + 0.6) {
      const x = h < start ? (h - (start - 0.4)) / 0.4 : h > end ? 1 - (h - end) / 0.6 : 1;
      const shape = h >= start && h <= end ? Math.sin((Math.PI * (h - start)) / (end - start || 1)) * 0.75 + 0.25 : 0;
      const peak = h >= start && h <= end ? 8 + (p.peakC - 8) * shape : 7.6;
      t = t + (Math.max(t, peak) - t) * Math.max(0, Math.min(1, x));
    }
  }
  return Math.round(t * 10) / 10;
}

export function simulate(ship: FleetShipment, now: number): LiveState {
  const sinceEpoch = now / HOUR + ship.offsetHours;
  const tripIndex = Math.floor(sinceEpoch / ship.cycleHours);
  const h = sinceEpoch - tripIndex * ship.cycleHours;
  const tripStart = now - h * HOUR;
  const inTransit = h < ship.tripHours;
  const hh = Math.min(h, ship.tripHours);
  const { legIndex, frac } = locate(ship, hh);
  const leg = ship.legs[legIndex];
  let latLon: [number, number];
  if (leg.mode === "air") {
    const pts = greatCircle(leg.from, leg.to, 64);
    latLon = pts[Math.min(pts.length - 1, Math.round(frac * (pts.length - 1)))];
  } else if (leg.mode === "road") {
    latLon = [leg.from[0] + (leg.to[0] - leg.from[0]) * frac, leg.from[1] + (leg.to[1] - leg.from[1]) * frac];
  } else latLon = leg.from;

  let peak = -Infinity;
  let outMin = 0;
  for (let x = 0; x <= hh; x += 1 / 6) {
    const v = tempAt(ship, x, tripIndex);
    peak = Math.max(peak, v);
    if (v > 8 || v < 2) outMin += 10;
  }
  const tempC = tempAt(ship, hh, tripIndex);
  const status: LiveStatus = peak > 8 ? "excursion" : tempC >= 7.3 || peak >= 7.5 ? "at_risk" : "in_range";
  return {
    ship,
    inTransit,
    tripStart,
    eta: tripStart + ship.tripHours * HOUR,
    progress: hh / ship.tripHours,
    legIndex,
    leg,
    latLon,
    xy: projectWorld(latLon[0], latLon[1]),
    tempC,
    tripPeakC: Math.round(peak * 10) / 10,
    minutesOutOfRange: outMin,
    status,
  };
}

/** Readings for the sparkline: every 15 minutes over the last `hours` of this trip. */
export function history(state: LiveState, now: number, hours = 12): { t: number; c: number }[] {
  const tripIndex = Math.floor((now / HOUR + state.ship.offsetHours) / state.ship.cycleHours);
  const hh = (Math.min(now, state.eta) - state.tripStart) / HOUR;
  const out: { t: number; c: number }[] = [];
  for (let x = Math.max(0, hh - hours); x <= hh + 1e-9; x += 0.25) {
    out.push({ t: state.tripStart + x * HOUR, c: tempAt(state.ship, x, tripIndex) });
  }
  return out;
}

/** SVG path of the whole route in world-map units (split where it crosses the map seam). */
export function routePath(ship: FleetShipment): string[] {
  const pts: [number, number][] = [];
  for (const l of ship.legs) {
    if (l.mode === "air") greatCircle(l.from, l.to, 64).forEach((p) => pts.push(projectWorld(p[0], p[1])));
    else if (l.mode === "road") {
      pts.push(projectWorld(l.from[0], l.from[1]));
      pts.push(projectWorld(l.to[0], l.to[1]));
    }
  }
  const paths: string[] = [];
  let cur = "";
  pts.forEach(([x, y], i) => {
    const jump = i > 0 && Math.abs(x - pts[i - 1][0]) > 400;
    cur += `${!cur || jump ? (cur ? "|" : "") + "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)} `;
  });
  for (const p of cur.split("|")) if (p.trim()) paths.push(p.trim());
  return paths;
}

/** Which demo case shows how Kelvin handles an excursion in this custody. */
export function demoCaseFor(role: CustodyParty): { id: string; label: string } {
  return role === "airline" ? { id: "demo-b", label: "Demo case B (airline custody)" } : { id: "demo-c", label: "Demo case C (forwarder custody)" };
}
