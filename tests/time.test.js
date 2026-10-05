import { describe, it, expect } from "vitest";
import { timeToMinutes, minutesToTime, isValidTimeRange, getDayOfWeek } from "../utils/time.js";

describe("timeToMinutes / minutesToTime", () => {
  it("converts HH:MM to minutes", () => {
    expect(timeToMinutes("09:00")).toBe(540);
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("23:59")).toBe(23 * 60 + 59);
  });

  it("round-trips", () => {
    for (const t of ["09:00", "14:30", "00:15"]) {
      expect(minutesToTime(timeToMinutes(t))).toBe(t);
    }
  });

  it("pads output", () => {
    expect(minutesToTime(0)).toBe("00:00");
    expect(minutesToTime(545)).toBe("09:05");
  });
});

describe("isValidTimeRange", () => {
  it("accepts start < end", () => {
    expect(isValidTimeRange("09:00", "10:00")).toBe(true);
  });

  it("rejects start >= end", () => {
    expect(isValidTimeRange("10:00", "10:00")).toBe(false);
    expect(isValidTimeRange("11:00", "10:00")).toBe(false);
  });
});

describe("getDayOfWeek", () => {
  it("returns 0-6 for known dates", () => {
    // 2026-10-05 is Monday -> 1
    expect(getDayOfWeek("2026-10-05")).toBe(1);
    expect(getDayOfWeek("2026-10-04")).toBe(0);
  });
});
