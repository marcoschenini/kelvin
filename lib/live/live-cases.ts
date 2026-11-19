import "server-only";
import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { auditEvents, cases, documents } from "@/lib/db/schema";
import { DEFAULT_PERSONA_ID } from "@/lib/domain/personas";
import { putFile } from "@/lib/storage";
import { CLIENT, FLEET, tempAt, type FleetShipment } from "./fleet";

const HOUR = 3_600_000;
const STEP_H = 1 / 12; // 5-minute logger interval, as in the demo seed
const STEP_MIN = 5;

/** `live-07` + trip 12345 → `live-07-t12345` (the ship id already starts with "live-"). */
export const liveCaseId = (shipId: string, tripIndex: number) => `${shipId.startsWith("live-") ? shipId : `live-${shipId}`}-t${tripIndex}`;

const sampleCount = (ship: FleetShipment) => Math.floor(ship.tripHours / STEP_H + 1e-9);

/** Excursion over a whole trip (>8 or <2 °C, 5-minute readings), or null when the trip stayed in range. */
export function tripExcursion(ship: FleetShipment, tripIndex: number): { peakC: number; minutesOutOfRange: number; start: number; end: number } | null {
  let peak = -Infinity;
  let minutes = 0;
  let start = -1;
  let end = -1;
  for (let i = 0; i <= sampleCount(ship); i++) {
    const h = i * STEP_H;
    const v = tempAt(ship, h, tripIndex);
    if (v > 8 || v < 2) {
      peak = Math.max(peak, v);
      minutes += STEP_MIN;
      if (start < 0) start = h;
      end = h;
    }
  }
  return minutes ? { peakC: Math.round(peak * 10) / 10, minutesOutOfRange: minutes, start, end } : null;
}

function loggerCsv(ship: FleetShipment, tripIndex: number, tripStart: Date): string {
  const n = sampleCount(ship);
  const at = (i: number) => new Date(tripStart.getTime() + Math.round(i * STEP_H * HOUR));
  const header = [
    `# Device: ColdTrace CT-5 data logger`,
    `# Logger ID: ${ship.loggerId}`,
    `# Shipment: ${ship.shipmentRef}  AWB: n/a`,
    `# Product: ${ship.product}`,
    `# Alarm range: 2.0 to 8.0 C   Interval: ${STEP_MIN} min   Time zone: UTC`,
    `# Start: ${at(0).toISOString()}  Stop: ${at(n).toISOString()}`,
    `row,timestamp_utc,temperature_c`,
  ];
  const body = Array.from({ length: n + 1 }, (_, i) => `${i + 1},${at(i).toISOString().replace(".000Z", "Z")},${tempAt(ship, i * STEP_H, tripIndex).toFixed(1)}`);
  return [...header, ...body].join("\n") + "\n";
}

function handlingJson(ship: FleetShipment, tripStart: Date): string {
  let acc = 0;
  const events = ship.legs.map((l, i) => {
    const from = new Date(tripStart.getTime() + acc * HOUR);
    acc += l.hours;
    return {
      seq: i + 1,
      from_utc: from.toISOString(),
      to_utc: new Date(tripStart.getTime() + acc * HOUR).toISOString(),
      custodian_role: l.role,
      custodian: l.custodian,
      location: l.activity,
      activity: l.activity,
      temperature_controlled: true,
      reference: i === 3 ? ship.flight : null,
    };
  });
  return JSON.stringify({ source: "Kelvin live monitoring (track & trace)", shipment_ref: ship.shipmentRef, awb: null, flight: ship.flight, events }, null, 2) + "\n";
}

/** Opens a claims case for a delivered live trip with an excursion. Idempotent. Trip dates are anchored so it ends at `deliveredAt`. */
export async function createLiveCase(db: DB, shipId: string, tripIndex: number, deliveredAt: Date = new Date()): Promise<{ caseId: string; created: boolean } | null> {
  const ship = FLEET.find((s) => s.id === shipId);
  if (!ship) return null;
  const exc = tripExcursion(ship, tripIndex);
  if (!exc) return null;
  const id = liveCaseId(ship.id, tripIndex);
  const [existing] = await db.select({ id: cases.id }).from(cases).where(eq(cases.id, id));
  if (existing) return { caseId: id, created: false };

  const tripStart = new Date(deliveredAt.getTime() - ship.tripHours * HOUR);
  const files = [
    { kind: "logger" as const, title: `Logger ${ship.loggerId}`, filename: `logger-${ship.loggerId}.csv`, mime: "text/csv", text: loggerCsv(ship, tripIndex, tripStart) },
    { kind: "handling_events" as const, title: "Handling events (track & trace)", filename: `handling-events-${ship.shipmentRef}.json`, mime: "application/json", text: handlingJson(ship, tripStart) },
  ].map((f, i) => ({ ...f, id: `${id}-${f.kind}-${String(i + 1).padStart(2, "0")}`, bytes: new TextEncoder().encode(f.text) }));
  for (const f of files) await putFile(`cases/${id}/${f.filename}`, f.bytes);

  await db.insert(cases).values({
    id,
    shipmentRef: ship.shipmentRef,
    title: `Live monitoring: ${ship.shipmentRef} ${ship.origin} → ${ship.destination}`,
    scenario: "live",
    status: "new",
    ownerPersonaId: DEFAULT_PERSONA_ID,
    product: ship.product,
    origin: ship.origin,
    destination: ship.destination,
    valueEur: ship.valueEur,
    weightKg: ship.weightKg,
    shipperName: ship.shipper || CLIENT,
    deliveredAt,
    discoveredAt: deliveredAt,
    record: {},
    createdAt: deliveredAt,
    updatedAt: deliveredAt,
  });
  await db.insert(documents).values(
    files.map((f) => ({ id: f.id, caseId: id, kind: f.kind, title: f.title, filename: f.filename, mime: f.mime, storagePath: `cases/${id}/${f.filename}`, sizeBytes: f.bytes.byteLength, pages: null, createdAt: deliveredAt })),
  );
  await db.insert(auditEvents).values([
    {
      caseId: id,
      at: deliveredAt,
      actorType: "system",
      actorName: "Kelvin live monitoring",
      eventType: "case_opened",
      input: { source: "live monitoring", note: "Case opened from live monitoring", shipId: ship.id, tripIndex },
      output: { shipmentRef: ship.shipmentRef, peakC: exc.peakC, minutesOutOfRange: exc.minutesOutOfRange, documents: files.length },
    },
    ...files.map((f) => ({
      caseId: id,
      at: deliveredAt,
      actorType: "system" as const,
      actorName: "Kelvin intake",
      eventType: "document_received",
      input: { filename: f.filename, kind: f.kind },
      output: { documentId: f.id, bytes: f.bytes.byteLength, pages: null },
    })),
  ]);
  return { caseId: id, created: true };
}

/** Opens cases for every trip with an excursion that ended (real time) within the lookback. Returns how many were created. */
export async function syncLiveCases(db: DB, now: number = Date.now(), lookbackHours = 72): Promise<number> {
  let created = 0;
  for (const ship of FLEET) {
    if (!ship.profile) continue; // only profiled trips can leave 2–8 °C
    const endOf = (k: number) => (k * ship.cycleHours - ship.offsetHours + ship.tripHours) * HOUR;
    const kMax = Math.floor((now / HOUR + ship.offsetHours - ship.tripHours) / ship.cycleHours);
    for (let k = kMax; endOf(k) >= now - lookbackHours * HOUR; k--) {
      const r = await createLiveCase(db, ship.id, k, new Date(endOf(k)));
      if (r?.created) created++;
    }
  }
  return created;
}
