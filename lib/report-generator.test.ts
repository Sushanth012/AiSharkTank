import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyInvestorRoster,
  buildPrompt,
  buildSectionPrompt,
  callWithRetry,
  generateInvestmentReport,
  isRetryableAiError,
  pitchReportSchema,
  ReportGenerationExhaustedError,
  stripCodeFence,
  telemetryErrorCode,
  type ReportSectionRequest
} from "./report-generator";
import { demoReport, demoYcEvaluation, sampleProfile } from "./demo-data";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
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

  it("builds a dedicated YC application prompt around the five application questions", () => {
    const prompt = JSON.parse(buildPrompt({
      profile: { ...sampleProfile, reviewMode: "yc" },
      transcript: "We help students sell dorm items before move-out.",
      deckText: ""
    }));

    expect(prompt.task).toContain("YC application video");
    expect(prompt.constraints.join(" ")).toContain("Why are these founders right");
    expect(prompt.outputShape.ycEvaluation.ideaClarity.nextStep).toBe("string");
    expect(prompt.profile.reviewMode).toBe("yc");
  });

  it("keeps section prompts free of instructions for fields they cannot return", () => {
    const input = {
      profile: { ...sampleProfile, reviewMode: "yc" as const },
      transcript: "A YC application pitch",
      deckText: ""
    };
    const panelPrompt = JSON.parse(buildSectionPrompt(input, "panel"));
    const ycPrompt = JSON.parse(buildSectionPrompt(input, "yc"));

    expect(panelPrompt.constraints.join(" ")).not.toContain("Set ycEvaluation");
    expect(panelPrompt.constraints.join(" ")).not.toContain("matching riskGuidance");
    expect(ycPrompt.constraints.join(" ")).not.toContain("exactly five investor perspectives");
    expect(ycPrompt.outputShape).toEqual({ ycEvaluation: expect.any(Object) });
  });

  it("keeps investor reports backward compatible and validates the new guidance fields", () => {
    const parsed = pitchReportSchema.parse(demoReport);
    const prompt = JSON.parse(buildPrompt({ profile: sampleProfile, transcript: "", deckText: "" }));

    expect(parsed.reviewMode).toBe("investor");
    expect(parsed.ycEvaluation).toBeNull();
    expect(parsed.riskGuidance).toHaveLength(parsed.risks.length);
    expect(prompt.outputShape.ycEvaluation).toBeNull();
  });

  it("overwrites provider-supplied investor identities with the fictional product roster", () => {
    const providerPanel = demoReport.investorPanel.map((review) => ({
      ...review,
      name: "Untrusted provider name",
      focus: "Untrusted provider persona"
    }));

    const panel = applyInvestorRoster(providerPanel);
    expect(panel.map((review) => review.name)).toEqual([
      "Mark Cuban",
      "Barbara Corcoran",
      "Kevin O’Leary",
      "Lori Greiner",
      "Daymond John"
    ]);
    expect(panel[0].thesis).toBe(providerPanel[0].thesis);
  });
});

describe("parallel report generation", () => {
  it("runs premium report sections in parallel and combines them server-side", async () => {
    const started: string[] = [];
    const releases = new Map<string, () => void>();
    const completion = vi.fn((request: ReportSectionRequest) => {
      started.push(request.section);
      return new Promise<ReturnType<typeof sectionCompletion>>((resolve) => {
        releases.set(request.section, () => resolve(sectionCompletion(request.section)));
      });
    });

    const reportPromise = generateInvestmentReport(
      { profile: sampleProfile, transcript: "A short pitch", tier: "premium" },
      { completion, provider: "deepseek", model: "deepseek-v4-pro", timeoutMs: 5_000 }
    );

    await vi.waitFor(() => expect(started).toEqual(["core", "panel", "evidence"]));
    releases.forEach((release) => release());

    const report = await reportPromise;
    expect(report.executiveSummary).toBe(demoReport.executiveSummary);
    expect(report.investorPanel).toHaveLength(5);
    expect(report.timeline).toEqual(demoReport.timeline);
    expect(report.ycEvaluation).toBeNull();
  });

  it("retries truncated JSON once and records response diagnostics for every attempt", async () => {
    const telemetry: Array<Record<string, unknown>> = [];
    let coreAttempts = 0;

    const report = await generateInvestmentReport(
      {
        profile: sampleProfile,
        transcript: "A short pitch",
        tier: "premium",
        onTelemetry: async (event) => { telemetry.push(event as unknown as Record<string, unknown>); }
      },
      {
        completion: async (request) => {
          if (request.section === "core" && coreAttempts++ === 0) {
            return {
              content: '{"overallScore":72,"executiveSummary":"cut off',
              finishReason: "length",
              inputTokens: 120,
              cachedInputTokens: 0,
              outputTokens: 600
            };
          }
          return sectionCompletion(request.section);
        },
        provider: "deepseek",
        model: "deepseek-v4-pro",
        timeoutMs: 5_000,
        maxAttempts: 2,
        sleep: async () => undefined
      }
    );

    expect(report.overallScore).toBe(demoReport.overallScore);
    expect(coreAttempts).toBe(2);
    expect(telemetry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        section: "core",
        attempt: 1,
        status: "failed",
        finishReason: "length",
        failureReason: "truncated",
        responseCharacters: 46,
        outputTokens: 600
      }),
      expect.objectContaining({ section: "core", attempt: 2, status: "complete" })
    ]));
  });

  it("times out a stalled provider attempt and retries it", async () => {
    vi.useFakeTimers();
    let coreAttempts = 0;
    const telemetry: Array<Record<string, unknown>> = [];

    const reportPromise = generateInvestmentReport(
      {
        profile: sampleProfile,
        transcript: "A short pitch",
        tier: "premium",
        onTelemetry: async (event) => { telemetry.push(event as unknown as Record<string, unknown>); }
      },
      {
        completion: (request) => {
          if (request.section === "core" && coreAttempts++ === 0) {
            return new Promise((_, reject) => {
              request.signal.addEventListener("abort", () => {
                reject(new DOMException("Aborted", "AbortError"));
              }, { once: true });
            });
          }
          return Promise.resolve(sectionCompletion(request.section));
        },
        provider: "deepseek",
        model: "deepseek-v4-pro",
        timeoutMs: 100,
        maxAttempts: 2,
        sleep: async () => undefined
      }
    );

    await vi.advanceTimersByTimeAsync(101);
    await expect(reportPromise).resolves.toMatchObject({ overallScore: demoReport.overallScore });
    expect(telemetry).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "core", attempt: 1, failureReason: "timeout" })
    ]));
  });

  it("retries malformed JSON even when the provider reports a normal stop", async () => {
    let coreAttempts = 0;
    const telemetry: Array<Record<string, unknown>> = [];
    const report = await generateInvestmentReport(
      {
        profile: sampleProfile,
        transcript: "A short pitch",
        tier: "premium",
        onTelemetry: async (event) => { telemetry.push(event as unknown as Record<string, unknown>); }
      },
      {
        completion: async (request) => {
          if (request.section === "core" && coreAttempts++ === 0) {
            return { ...sectionCompletion("core"), content: "{broken", finishReason: "stop" };
          }
          return sectionCompletion(request.section);
        },
        provider: "deepseek",
        model: "deepseek-v4-pro",
        maxAttempts: 2,
        sleep: async () => undefined
      }
    );

    expect(report.overallScore).toBe(demoReport.overallScore);
    expect(coreAttempts).toBe(2);
    expect(telemetry).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "core", attempt: 1, failureReason: "invalid_json" })
    ]));
  });

  it("generates YC evaluation as a dedicated parallel section", async () => {
    const sections: string[] = [];
    const report = await generateInvestmentReport(
      { profile: { ...sampleProfile, reviewMode: "yc" }, transcript: "YC application video", tier: "premium" },
      {
        completion: async (request) => {
          sections.push(request.section);
          return sectionCompletion(request.section);
        },
        provider: "deepseek",
        model: "deepseek-v4-pro",
        timeoutMs: 5_000
      }
    );

    expect(sections).toEqual(["core", "panel", "evidence", "yc"]);
    expect(report.reviewMode).toBe("yc");
    expect(report.ycEvaluation).toEqual(demoYcEvaluation);
  });

  it("retries transient provider errors inside only the failed section", async () => {
    const attempts = new Map<string, number>();
    const telemetry: Array<Record<string, unknown>> = [];
    const report = await generateInvestmentReport(
      {
        profile: sampleProfile,
        transcript: "A short pitch",
        tier: "premium",
        onTelemetry: async (event) => { telemetry.push(event as unknown as Record<string, unknown>); }
      },
      {
        completion: async (request) => {
          const attempt = (attempts.get(request.section) ?? 0) + 1;
          attempts.set(request.section, attempt);
          if (request.section === "panel" && attempt === 1) {
            throw Object.assign(new Error("provider busy"), { status: 503 });
          }
          return sectionCompletion(request.section);
        },
        provider: "deepseek",
        model: "deepseek-v4-pro",
        maxAttempts: 2,
        sleep: async () => undefined
      }
    );

    expect(report.investorPanel).toHaveLength(5);
    expect(attempts).toEqual(new Map([["core", 1], ["panel", 2], ["evidence", 1]]));
    expect(telemetry).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "panel", attempt: 1, failureReason: "provider_503" })
    ]));
  });

  it("records and stops on a content-filtered response", async () => {
    const telemetry: Array<Record<string, unknown>> = [];
    await expect(generateInvestmentReport(
      {
        profile: sampleProfile,
        transcript: "A short pitch",
        tier: "premium",
        onTelemetry: async (event) => { telemetry.push(event as unknown as Record<string, unknown>); }
      },
      {
        completion: async (request) => request.section === "core"
          ? { ...sectionCompletion("core"), finishReason: "content_filter" }
          : sectionCompletion(request.section),
        provider: "deepseek",
        model: "deepseek-v4-pro",
        maxAttempts: 2,
        sleep: async () => undefined
      }
    )).rejects.toThrow("content_filtered");

    expect(telemetry).toEqual(expect.arrayContaining([
      expect.objectContaining({
        section: "core",
        attempt: 1,
        failureReason: "content_filtered",
        status: "failed"
      })
    ]));
  });

  it("uses basic routes and zero provider cost for a free OpenAI-backed report", async () => {
    const telemetry: Array<Record<string, unknown>> = [];
    const report = await generateInvestmentReport(
      {
        profile: sampleProfile,
        transcript: "A free pitch",
        tier: "basic",
        onTelemetry: async (event) => { telemetry.push(event as unknown as Record<string, unknown>); }
      },
      {
        completion: async (request) => sectionCompletion(request.section),
        provider: "openai",
        model: "test-openai",
        maxAttempts: 1
      }
    );

    expect(report.overallScore).toBe(demoReport.overallScore);
    expect(telemetry).toHaveLength(3);
    expect(telemetry.every((event) => event.route === "basic" && event.estimatedCostUsd === 0)).toBe(true);
  });

  it("classifies budget preflight failures as terminal without calling the provider", async () => {
    vi.stubEnv("AI_PREMIUM_BUDGET_USD", "0.000001");
    const completion = vi.fn(async (request: ReportSectionRequest) => sectionCompletion(request.section));

    await expect(generateInvestmentReport(
      { profile: sampleProfile, transcript: "A short pitch", tier: "premium" },
      { completion, provider: "deepseek", model: "deepseek-v4-pro" }
    )).rejects.toBeInstanceOf(ReportGenerationExhaustedError);
    expect(completion).not.toHaveBeenCalled();
  });

  it("does not regenerate valid AI output when telemetry storage is temporarily unavailable", async () => {
    const completion = vi.fn(async (request: ReportSectionRequest) => sectionCompletion(request.section));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const report = await generateInvestmentReport(
      {
        profile: sampleProfile,
        transcript: "A short pitch",
        tier: "premium",
        onTelemetry: async () => { throw new Error("telemetry database unavailable"); }
      },
      {
        completion,
        provider: "deepseek",
        model: "deepseek-v4-pro",
        maxAttempts: 2,
        sleep: async () => undefined
      }
    );

    expect(report.overallScore).toBe(demoReport.overallScore);
    expect(completion).toHaveBeenCalledTimes(3);
    expect(consoleError).toHaveBeenCalledWith("AI attempt telemetry could not be stored.", expect.any(Error));
    consoleError.mockRestore();
  });

  it("cancels sibling provider calls when one section fails permanently", async () => {
    const aborted: string[] = [];
    const telemetry: Array<Record<string, unknown>> = [];

    await expect(generateInvestmentReport(
      {
        profile: sampleProfile,
        transcript: "A short pitch",
        tier: "premium",
        onTelemetry: async (event) => { telemetry.push(event as unknown as Record<string, unknown>); }
      },
      {
        completion: (request) => {
          if (request.section === "core") {
            return Promise.resolve({ ...sectionCompletion("core"), finishReason: "content_filter" });
          }
          return new Promise((_, reject) => {
            request.signal.addEventListener("abort", () => {
              aborted.push(request.section);
              reject(new DOMException("Aborted", "AbortError"));
            }, { once: true });
          });
        },
        provider: "deepseek",
        model: "deepseek-v4-pro",
        maxAttempts: 1
      }
    )).rejects.toThrow("content_filtered");

    expect(aborted.sort()).toEqual(["evidence", "panel"]);
    expect(telemetry.filter((event) => event.attempt === 2)).toHaveLength(0);
  });

  it("cancels retry backoff without recording an attempt that never called the provider", async () => {
    let releaseCore: (() => void) | undefined;
    let releaseSleep: (() => void) | undefined;
    let panelCalls = 0;
    const telemetry: Array<Record<string, unknown>> = [];
    const reportPromise = generateInvestmentReport(
      {
        profile: sampleProfile,
        transcript: "A short pitch",
        tier: "premium",
        onTelemetry: async (event) => { telemetry.push(event as unknown as Record<string, unknown>); }
      },
      {
        completion: (request) => {
          if (request.section === "core") {
            return new Promise((resolve) => {
              releaseCore = () => resolve({ ...sectionCompletion("core"), finishReason: "content_filter" });
            });
          }
          if (request.section === "panel") {
            panelCalls += 1;
            return panelCalls === 1
              ? Promise.reject(Object.assign(new Error("busy"), { status: 503 }))
              : Promise.resolve(sectionCompletion("panel"));
          }
          return Promise.resolve(sectionCompletion(request.section));
        },
        provider: "deepseek",
        model: "deepseek-v4-pro",
        maxAttempts: 2,
        sleep: () => new Promise((resolve) => { releaseSleep = resolve; })
      }
    );
    const expectedRejection = expect(reportPromise).rejects.toThrow("content_filtered");

    await vi.waitFor(() => expect(releaseSleep).toBeTypeOf("function"));
    releaseCore?.();
    await vi.waitFor(() => expect(telemetry).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: "core", failureReason: "content_filtered" })
    ])));
    await Promise.resolve();
    releaseSleep?.();
    await expectedRejection;
    expect(panelCalls).toBe(1);
    expect(telemetry.filter((event) => event.section === "panel" && event.attempt === 2)).toHaveLength(0);
  });

  it("rejects core output when risks and guidance do not line up", async () => {
    await expect(generateInvestmentReport(
      { profile: sampleProfile, transcript: "A short pitch", tier: "premium" },
      {
        completion: async (request) => {
          if (request.section !== "core") return sectionCompletion(request.section);
          const parsed = JSON.parse(sectionCompletion("core").content);
          parsed.riskGuidance = [];
          return { ...sectionCompletion("core"), content: JSON.stringify(parsed) };
        },
        provider: "deepseek",
        model: "deepseek-v4-pro",
        maxAttempts: 1
      }
    )).rejects.toThrow("Every risk must have matching guidance");
  });
});

function sectionCompletion(section: ReportSectionRequest["section"]) {
  const content = section === "core"
    ? JSON.stringify({
        overallScore: demoReport.overallScore,
        businessScore: demoReport.businessScore,
        deliveryScore: demoReport.deliveryScore,
        recommendation: demoReport.recommendation,
        executiveSummary: demoReport.executiveSummary,
        scores: demoReport.scores,
        strengths: demoReport.strengths,
        risks: demoReport.risks,
        riskGuidance: demoReport.riskGuidance,
        nextMilestones: demoReport.nextMilestones,
        finalMemo: demoReport.finalMemo
      })
    : section === "panel"
      ? JSON.stringify({ investorPanel: demoReport.investorPanel })
      : section === "evidence"
        ? JSON.stringify({ timeline: demoReport.timeline, valuation: demoReport.valuation })
        : JSON.stringify({ ycEvaluation: demoYcEvaluation });

  return {
    content,
    finishReason: "stop",
    inputTokens: 120,
    cachedInputTokens: 10,
    outputTokens: Math.ceil(content.length / 4)
  };
}
