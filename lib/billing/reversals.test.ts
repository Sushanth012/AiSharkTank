import { describe, expect, it } from "vitest";
import { hasActiveDispute, objectId, requirePositiveAmount } from "./reversals";

describe("billing reversal helpers", () => {
  it("treats open and lost disputes as active liabilities", () => {
    expect(hasActiveDispute([{ status: "needs_response" }])).toBe(true);
    expect(hasActiveDispute([{ status: "lost" }])).toBe(true);
    expect(
      hasActiveDispute([{ status: "won" }, { status: "warning_closed" }, { status: "prevented" }])
    ).toBe(false);
  });

  it("normalizes expandable Stripe IDs", () => {
    expect(objectId("pi_123")).toBe("pi_123");
    expect(objectId({ id: "pi_456" })).toBe("pi_456");
    expect(objectId(null)).toBeNull();
  });

  it("rejects missing, fractional, or non-positive settled amounts", () => {
    expect(requirePositiveAmount(799, "Payment amount")).toBe(799);
    expect(() => requirePositiveAmount(0, "Payment amount")).toThrow("positive integer");
    expect(() => requirePositiveAmount(1.5, "Payment amount")).toThrow("positive integer");
  });
});
