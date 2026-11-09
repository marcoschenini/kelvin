/** Demo clock helpers: every case is anchored relative to "now" at seed time. */

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

/** Delivery always happens at 14:00 UTC, `daysAgo` calendar days before `now`. */
export function deliveryInstant(now: Date, daysAgo: number): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 14, 0, 0));
  return new Date(d.getTime() - daysAgo * DAY_MS);
}

export function atHours(delivery: Date, h: number): Date {
  return new Date(delivery.getTime() + h * HOUR_MS);
}

/** 2026-11-07 14:05 */
export function isoMinute(d: Date): string {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** 7 Nov 2026 */
export function longDate(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}

/** 07NOV26 (air waybill style) */
export function awbDate(d: Date): string {
  const m = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][d.getUTCMonth()];
  return `${String(d.getUTCDate()).padStart(2, "0")}${m}${String(d.getUTCFullYear()).slice(2)}`;
}

/** RFC 2822 date for .eml files */
export function rfc2822(d: Date): string {
  return d.toUTCString().replace("GMT", "+0000");
}

/**
 * Resolves relative-time placeholders in spec text against the delivery instant:
 *   {h:-39.5}    -> "2026-11-07 18:30 UTC"
 *   {t:-39.5}    -> "18:30"
 *   {date:-2}    -> "7 Nov 2026"   (argument in hours)
 */
export function resolveTemplate(text: string, delivery: Date): string {
  return text
    .replace(/\{h:(-?[\d.]+)\}/g, (_, h) => `${isoMinute(atHours(delivery, Number(h)))} UTC`)
    .replace(/\{t:(-?[\d.]+)\}/g, (_, h) => isoMinute(atHours(delivery, Number(h))).slice(11))
    .replace(/\{date:(-?[\d.]+)\}/g, (_, h) => longDate(atHours(delivery, Number(h))));
}
