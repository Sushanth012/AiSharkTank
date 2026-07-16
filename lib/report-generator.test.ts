import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyInvestorRoster,
  callWithRetry,
  isRetryableAiError,
  pitchReportSchema,
  stripCodeFence,
  telemetryErrorCode
} from "./report-generator";
import { demoReport } from "./demo-data";

afterEach(() => {
  vi.useRealTimers();
});

describe("AI provider boundaries", () => {
  it("retries transient provider failures and returns the eventual result", async () => {
    vi.useFakeTimers();
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error("busy"), { status: 503 }))
      .mockResolvedValue("ready");

    const result = callWithRetry(operation, 2);
    await vi.runAllTimersAsync();

    await expect(result).resolves.toBe("ready");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry invalid requests", async () => {
    const operation = vi.fn().mockRejectedValue(Object.assign(new Error("bad request"), { status: 400 }));
    await expect(callWithRetry(operation)).rejects.toThrow("bad request");
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("classifies only timeouts, conflicts, rate limits, and server errors as retryable", () => {
    expect(isRetryableAiError(Object.assign(new Error("rate"), { status: 429 }))).toBe(true);
    expect(isRetryableAiError(Object.assign(new Error("server"), { status: 500 }))).toBe(true);
    expect(isRetryableAiError(Object.assign(new Error("auth"), { status: 401 }))).toBe(false);
  });

  it("normalizes fenced JSON and rejects malformed report output", () => {
    expect(stripCodeFence("```json\n{\"ok\":true}\n```")).toBe('{"ok":true}');
    expect(() => pitchReportSchema.parse({ overallScore: 101 })).toThrow();
    expect(telemetryErrorCode(new SyntaxError("bad json"))).toBe("invalid_provider_output");
  });

  it("overwrites provider-supplied investor identities with the fictional product roster", () => {
    const providerPanel = demoReport.investorPanel.map((review) => ({
      ...review,
      name: "Untrusted provider name",
      focus: "Untrusted provider persona"
    }));

    const panel = applyInvestorRoster(providerPanel);
    expect(panel.map((review) => review.name)).toEqual([
      "Morgan Vale",
      "Alex Rowan",
      "Rina Calder",
      "Darius North",
      "Leah Quinn"
    ]);
    expect(panel[0].thesis).toBe(providerPanel[0].thesis);
  });
});
