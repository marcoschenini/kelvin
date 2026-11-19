import { describe, expect, it } from "vitest";
import { excursionShownEnd } from "@/lib/case/record";

describe("excursionShownEnd", () => {
  it("shown end minus start equals minutes (N readings at 5-min interval)", () => {
    const start = "2025-03-01T10:00:00.000Z";
    for (const n of [1, 6, 37]) {
      const minutes = n * 5;
      const end = excursionShownEnd({ start, minutes });
      expect((Date.parse(end) - Date.parse(start)) / 60_000).toBe(minutes);
    }
  });
});
