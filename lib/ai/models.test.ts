import { describe, expect, it } from "vitest";
import { AiBudgetExceededError, assertWithinBudget, estimateRunCost } from "./models";

describe("DeepSeek cost controls", () => {
  it("prices flash input and output tokens", () => {
    expect(
      estimateRunCost({ model: "deepseek-v4-flash", inputTokens: 10_000, outputTokens: 2_000 })
    ).toBeCloseTo(0.00196, 8);
  });

  it("applies the lower cached-input rate", () => {
    const uncached = estimateRunCost({
      model: "deepseek-v4-pro",
      inputTokens: 10_000,
      outputTokens: 1_000
    });
    const cached = estimateRunCost({
      model: "deepseek-v4-pro",
      inputTokens: 10_000,
      cachedInputTokens: 10_000,
      outputTokens: 1_000
    });
    expect(cached).toBeLessThan(uncached);
  });

  it("stops a run that would exceed its budget", () => {
    expect(() => assertWithinBudget(0.16, 0.15)).toThrow(AiBudgetExceededError);
  });
});
