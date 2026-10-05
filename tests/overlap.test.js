import { describe, it, expect } from "vitest";
import { timeOverlap, timesOverlap } from "../utils/overlap.js";

describe("timeOverlap", () => {
  it("detects inner overlap", () => {
    expect(timeOverlap("09:00", "10:00", "09:30", "09:45")).toBe(true);
  });

  it("allows adjacent ranges", () => {
    expect(timeOverlap("09:00", "10:00", "10:00", "11:00")).toBe(false);
  });

  it("detects partial overlap", () => {
    expect(timeOverlap("09:00", "10:00", "09:30", "10:30")).toBe(true);
  });

  it("returns false for disjoint ranges", () => {
    expect(timeOverlap("09:00", "10:00", "11:00", "12:00")).toBe(false);
  });

  it("keeps backwards-compatible alias", () => {
    expect(timesOverlap).toBe(timeOverlap);
  });
});
