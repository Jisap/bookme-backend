import { describe, it, expect } from "vitest";
import { calculatePlatformSplit, formatMinorMoney, PLATFORM_FEE_RATE } from "../utils/money.js";

describe("calculatePlatformSplit", () => {
  it("splits 10% fee / 90% payout", () => {
    const { platformFeeAmount, providerPayoutAmount } = calculatePlatformSplit(10000);
    expect(PLATFORM_FEE_RATE).toBe(0.1);
    expect(platformFeeAmount).toBe(1000);
    expect(providerPayoutAmount).toBe(9000);
  });

  it("rounds fee correctly", () => {
    // 333 * 0.1 = 33.3 -> 33, payout 300
    const { platformFeeAmount, providerPayoutAmount } = calculatePlatformSplit(333);
    expect(platformFeeAmount).toBe(33);
    expect(providerPayoutAmount).toBe(300);
  });

  it("returns zeros for invalid input (regression: Number.isInfinite crash)", () => {
    expect(calculatePlatformSplit(undefined)).toEqual({ platformFeeAmount: 0, providerPayoutAmount: 0 });
    expect(calculatePlatformSplit(NaN)).toEqual({ platformFeeAmount: 0, providerPayoutAmount: 0 });
    expect(calculatePlatformSplit(Infinity)).toEqual({ platformFeeAmount: 0, providerPayoutAmount: 0 });
    expect(calculatePlatformSplit(-500)).toEqual({ platformFeeAmount: 0, providerPayoutAmount: 0 });
  });

  it("fee + payout equals amount", () => {
    for (const amount of [0, 100, 999, 50000]) {
      const { platformFeeAmount, providerPayoutAmount } = calculatePlatformSplit(amount);
      expect(platformFeeAmount + providerPayoutAmount).toBe(amount);
    }
  });
});

describe("formatMinorMoney", () => {
  it("converts minor units to major", () => {
    expect(formatMinorMoney(50000, "usd")).toContain("500");
    expect(formatMinorMoney(0, "usd")).toContain("0");
  });
});
