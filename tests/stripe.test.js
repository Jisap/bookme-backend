import { describe, it, expect } from "vitest";
import { toStripeAmount } from "../utils/stripe.js";

describe("toStripeAmount", () => {
  it("converts units to minor units", () => {
    expect(toStripeAmount(50)).toBe(5000);
    expect(toStripeAmount("19.99")).toBe(1999);
  });

  it("returns 0 for missing input", () => {
    expect(toStripeAmount(undefined)).toBe(0);
    expect(toStripeAmount(null)).toBe(0);
  });
});
