import { describe, it, expect } from "vitest";
import slugify from "../utils/slug.js";

describe("slugify", () => {
  it("lowercases and replaces spaces", () => {
    expect(slugify("Mental Clinic")).toBe("mental-clinic");
  });

  it("strips special chars and collapses dashes", () => {
    expect(slugify("  Café & Spa -- Premium  ")).toBe("caf-spa-premium");
  });

  it("handles empty / null safely", () => {
    expect(slugify("")).toBe("");
    expect(slugify(null)).toBe("");
    expect(slugify(undefined)).toBe("");
  });
});
