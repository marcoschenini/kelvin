/**
 * Formatting helpers. All dates are rendered in UTC so server and client agree
 * (cold-chain loggers and air waybills are UTC-stamped anyway).
 */

const DAY_MS = 86_400_000;

const eurFormatter = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const eurCompactFormatter = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** €200,000 */
export function formatEUR(value: number): string {
  return eurFormatter.format(Math.round(value));
}

/** €1.2M — for tight KPI tiles only */
export function formatEURCompact(value: number): string {
  return eurCompactFormatter.format(value);
}

const numberFormatter = new Intl.NumberFormat("en-GB");
export function formatNumber(value: number, digits = 0): string {
  return digits === 0
    ? numberFormatter.format(Math.round(value))
    : value.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatKg(value: number): string {
  return `${formatNumber(value)} kg`;
}

export function formatTemp(celsius: number): string {
  return `${celsius.toFixed(1)} °C`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});

type DateInput = Date | string | number;
const toDate = (d: DateInput) => (d instanceof Date ? d : new Date(d));

/** 12 Nov 2026 */
export function formatDate(d: DateInput): string {
  return dateFormatter.format(toDate(d));
}

/** 12 Nov, 14:05 */
export function formatDateTime(d: DateInput): string {
  return dateTimeFormatter.format(toDate(d));
}

/** 14:05 */
export function formatTime(d: DateInput): string {
  return timeFormatter.format(toDate(d));
}

/** Start of the UTC calendar day. */
function utcDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Whole calendar days from `now` to `target` (negative = in the past). */
export function daysUntil(target: DateInput, now: DateInput = new Date()): number {
  return Math.round((utcDay(toDate(target)) - utcDay(toDate(now))) / DAY_MS);
}

/** "today", "tomorrow", "in 3 days", "yesterday", "3 days ago" */
export function formatRelativeDays(target: DateInput, now: DateInput = new Date()): string {
  const n = daysUntil(target, now);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/** "12 Nov 2026 (in 3 days)" */
export function formatDateWithRelative(target: DateInput, now: DateInput = new Date()): string {
  return `${formatDate(target)} (${formatRelativeDays(target, now)})`;
}

/** Deadline phrasing: "3 days left", "Due today", "2 days overdue" */
export function formatDaysLeft(days: number): string {
  if (days === 0) return "Due today";
  if (days < 0) return `${-days} day${days === -1 ? "" : "s"} overdue`;
  return `${days} day${days === 1 ? "" : "s"} left`;
}
