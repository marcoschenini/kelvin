import type { CaseSpec, ExcursionSpec } from "./spec";
import { atHours, HOUR_MS } from "./time";

/** Deterministic PRNG (mulberry32) so every seed produces identical files. */
export function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STEP_MIN = 5;
const LIMIT = 8.0;

/** Temperature contribution of one excursion at time t (hours). Returns null if outside its influence. */
function excursionTemp(ex: ExcursionSpec, tH: number): number | null {
  const start = ex.startH;
  const end = ex.startH + ex.minutes / 60;
  const riseH = 0.25; // 15 min to climb from base to the limit
  const fallH = ex.shape === "soak" ? 0.6 : 0.35;
  if (tH < start - riseH || tH > end + fallH) return null;
  if (tH < start) {
    // approaching the limit
    const x = (tH - (start - riseH)) / riseH;
    return -1 + x; // relative: -1 = base, 0 = limit (scaled later)
  }
  if (tH <= end) {
    const x = (tH - start) / (end - start || 1);
    const shape = ex.shape === "hump" ? Math.sin(Math.PI * x) : Math.min(1, Math.sin(Math.PI * x) * 1.9);
    return shape; // 0 = limit, 1 = peak
  }
  const x = (tH - end) / fallH;
  return -x; // back towards base
}

export interface LoggerRow {
  row: number;
  at: Date;
  tempC: number;
}

/**
 * Builds 5-minute readings from the first custody segment until delivery.
 * Readings above 8.0 °C appear exactly inside each excursion window, with the
 * configured peak hit at the excursion's apex.
 */
export function generateReadings(spec: CaseSpec, delivery: Date): LoggerRow[] {
  const rand = rng(`${spec.id}:logger`);
  const startH = Math.min(...spec.custody.map((c) => c.fromH));
  const rows: LoggerRow[] = [];
  let drift = 0;
  const totalSteps = Math.round((-startH * 60) / STEP_MIN);
  for (let i = 0; i <= totalSteps; i++) {
    const tH = startH + (i * STEP_MIN) / 60;
    drift = Math.max(-0.6, Math.min(0.6, drift + (rand() - 0.5) * 0.08));
    const base = spec.baseTempC + drift + (rand() - 0.5) * 0.18;
    let temp = base;
    for (const ex of spec.excursions) {
      const rel = excursionTemp(ex, tH);
      if (rel == null) continue;
      if (rel >= 0) temp = LIMIT + 0.05 + rel * (ex.peakC - LIMIT - 0.05);
      else temp = Math.max(base, LIMIT - 0.15 + rel * (LIMIT - 0.15 - base));
    }
    rows.push({ row: i + 1, at: atHours(delivery, tH), tempC: Math.round(temp * 10) / 10 });
  }
  // Pin the exact peak to the reading closest to each excursion apex.
  for (const ex of spec.excursions) {
    const apexH = ex.shape === "hump" ? ex.startH + ex.minutes / 120 : ex.startH + ex.minutes / 60 / 2;
    const apex = delivery.getTime() + apexH * HOUR_MS;
    let best = rows[0];
    for (const r of rows) if (Math.abs(r.at.getTime() - apex) < Math.abs(best.at.getTime() - apex)) best = r;
    best.tempC = ex.peakC;
  }
  return rows;
}

export function loggerCsv(spec: CaseSpec, delivery: Date): { csv: string; rows: LoggerRow[] } {
  const rows = generateReadings(spec, delivery);
  const header = [
    `# Device: ColdTrace CT-5 data logger`,
    `# Logger ID: ${spec.loggerId}`,
    `# Shipment: ${spec.shipmentRef}  AWB: ${spec.awbNumber}`,
    `# Product: ${spec.product.name}`,
    `# Alarm range: 2.0 to 8.0 C   Interval: ${STEP_MIN} min   Time zone: UTC`,
    `# Start: ${rows[0].at.toISOString()}  Stop: ${rows[rows.length - 1].at.toISOString()}`,
    `row,timestamp_utc,temperature_c`,
  ];
  const body = rows.map((r) => `${r.row},${r.at.toISOString().replace(".000Z", "Z")},${r.tempC.toFixed(1)}`);
  return { csv: [...header, ...body].join("\n") + "\n", rows };
}
