import { describe, expect, it } from "vitest";
import {
  daysUntil,
  formatDate,
  formatDateWithRelative,
  formatDaysLeft,
  formatDuration,
  formatEUR,
} from "@/lib/format";

const now = new Date("2026-11-09T22:30:00Z");

describe("formatEUR", () => {
  it("formats whole euros with thousands separators", () => {
    expect(formatEUR(200000)).toBe("€200,000");
    expect(formatEUR(3712.8)).toBe("€3,713");
  });
});

describe("dates", () => {
  it("renders day month year in UTC", () => {
    expect(formatDate("2026-11-12T23:59:00Z")).toBe("12 Nov 2026");
  });
  it("counts calendar days, not 24h blocks", () => {
    expect(daysUntil("2026-11-10T01:00:00Z", now)).toBe(1);
    expect(daysUntil("2026-11-09T00:00:00Z", now)).toBe(0);
    expect(daysUntil("2026-11-06T12:00:00Z", now)).toBe(-3);
  });
  it("adds a relative suffix", () => {
    expect(formatDateWithRelative("2026-11-12T00:00:00Z", now)).toBe("12 Nov 2026 (in 3 days)");
    expect(formatDateWithRelative("2026-11-10T00:00:00Z", now)).toBe("10 Nov 2026 (tomorrow)");
    expect(formatDateWithRelative("2026-11-07T00:00:00Z", now)).toBe("7 Nov 2026 (2 days ago)");
  });
  it("phrases deadlines", () => {
    expect(formatDaysLeft(3)).toBe("3 days left");
    expect(formatDaysLeft(1)).toBe("1 day left");
    expect(formatDaysLeft(0)).toBe("Due today");
    expect(formatDaysLeft(-1)).toBe("1 day overdue");
    expect(formatDaysLeft(-4)).toBe("4 days overdue");
  });
});

describe("formatDuration", () => {
  it("handles minutes and hours", () => {
    expect(formatDuration(25)).toBe("25 min");
    expect(formatDuration(90)).toBe("1 h 30 min");
    expect(formatDuration(240)).toBe("4 h");
  });
});
