import OpenAI from "openai";
import { z } from "zod";
import { demoReport, demoYcEvaluation } from "@/lib/demo-data";
import { isDeepSeekConfigured, isOpenAIConfigured } from "@/lib/config";
import { assertWithinBudget, budgetForRoute, estimateRunCost, modelForRoute } from "@/lib/ai/models";
import type { AiRoute } from "@/lib/ai/models";
import type { PitchReport, StartupProfile } from "@/lib/types";

export type GenerateReportInput = {
  profile: StartupProfile;
  transcript?: string;
  deckText?: string;
  tier?: "basic" | "premium";
  onTelemetry?: (telemetry: AiRunTelemetry) => Promise<void>;
};

export type ReportSection = "core" | "panel" | "evidence" | "yc";

export type ReportSectionRequest = {
  section: ReportSection;
  prompt: string;
  maxTokens: number;
  attempt: number;
  signal: AbortSignal;
};

export type ReportSectionCompletion = {
  content: string;
  finishReason: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

export type ReportGenerationDependencies = {
  completion?: (request: ReportSectionRequest) => Promise<ReportSectionCompletion>;
  provider?: "deepseek" | "openai";
  model?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  sleep?: (durationMs: number) => Promise<void>;
};

export type AiRunTelemetry = {
  route: AiRoute;
  provider: "deepseek" | "openai";
  model: string;
  status: "complete" | "failed" | "budget_exceeded";
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  section: ReportSection;
  attempt: number;
  responseCharacters: number;
  finishReason?: string;
  failureReason?: string;
  errorCode?: string;
};

const DEFAULT_SECTION_TIMEOUT_MS = 90_000;
const DEFAULT_SECTION_ATTEMPTS = 2;

export async function generateInvestmentReport(
  input: GenerateReportInput,
  dependencies: ReportGenerationDependencies = {}
): Promise<PitchReport> {
  if (!dependencies.completion && !isDeepSeekConfigured && !isOpenAIConfigured) {
    return personalizeDemoReport(input.profile);
  }

  const usingDeepSeek = dependencies.provider
    ? dependencies.provider === "deepseek"
    : isDeepSeekConfigured;
  const provider = dependencies.provider ?? (usingDeepSeek ? "deepseek" : "openai");
  const primaryRoute: AiRoute = input.tier === "premium" ? "premium_synthesis" : "basic";
  const model = dependencies.model ?? (usingDeepSeek
    ? modelForRoute(primaryRoute)
    : process.env.OPENAI_MODEL ?? "gpt-5.5");
  const specs = sectionSpecsFor(input);
  const completion = dependencies.completion ?? createProviderCompletion({ provider, model });
  const maxAttempts = dependencies.maxAttempts ?? DEFAULT_SECTION_ATTEMPTS;

  if (usingDeepSeek) {
    const maximumCost = specs.reduce((total, spec) => {
      const prompt = buildSectionPrompt(input, spec.section);
      return total + estimateRunCost({
        model,
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: spec.maxTokens
      });
    }, 0);
    assertWithinBudget(maximumCost * maxAttempts, budgetForRoute(primaryRoute));
  }

  const entries = await Promise.all(specs.map(async (spec) => [
    spec.section,
    await generateSection({
      input,
      section: spec.section,
      schema: spec.schema,
      maxTokens: spec.maxTokens,
      route: routeForSection(input.tier, spec.section),
      provider,
      model,
      completion,
      timeoutMs: dependencies.timeoutMs ?? sectionTimeoutMs(),
      maxAttempts,
      sleep: dependencies.sleep ?? defaultSleep
    })
  ] as const));
  const sections = Object.fromEntries(entries) as Record<ReportSection, unknown>;
  const core = coreReportSchema.parse(sections.core);
  const panel = panelReportSchema.parse(sections.panel);
  const evidence = evidenceReportSchema.parse(sections.evidence);
  const yc = input.profile.reviewMode === "yc"
    ? ycReportSchema.parse(sections.yc).ycEvaluation
    : null;

  return pitchReportSchema.parse({
    ...core,
    ...panel,
    ...evidence,
    id: crypto.randomUUID(),
    startupName: input.profile.startupName,
    generatedAt: new Date().toISOString(),
    reviewMode: input.profile.reviewMode ?? "investor",
    ycEvaluation: yc,
    investorPanel: applyInvestorRoster(panel.investorPanel)
  });
}

const decisionSchema = z.enum(["Invest", "Pass", "Invest with Conditions"]);
const feedbackGuidanceSchema = z.object({
  simpleExplanation: z.string().min(1),
  nextStep: z.string().min(1)
});
const ycCriterionSchema = feedbackGuidanceSchema.extend({
  score: z.number().int().min(0).max(100),
  answer: z.string().min(1)
});
const ycEvaluationSchema = z.object({
  verdict: z.enum(["Ready to submit", "Revise before submitting", "Major rewrite needed"]),
  ideaClarity: ycCriterionSchema,
  problemUrgency: ycCriterionSchema,
  founderFit: ycCriterionSchema,
  evidence: ycCriterionSchema,
  rejectionRisk: ycCriterionSchema
});

export const pitchReportSchema = z.object({
  id: z.string().default(""),
  startupName: z.string(),
  generatedAt: z.string().default(""),
  overallScore: z.number().int().min(0).max(100),
  businessScore: z.number().int().min(0).max(100),
  deliveryScore: z.number().int().min(0).max(100),
  recommendation: decisionSchema,
  executiveSummary: z.string().min(1),
  reviewMode: z.enum(["investor", "yc"]).optional().default("investor"),
  ycEvaluation: ycEvaluationSchema.nullable().optional().default(null),
  scores: z.array(
    z.object({
      label: z.string(),
      value: z.number().int().min(0).max(100),
      rationale: z.string()
    })
  ),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
  riskGuidance: z.array(feedbackGuidanceSchema).optional().default([]),
  nextMilestones: z.array(z.string()),
  investorPanel: z.array(
    z.object({
      name: z.string(),
      shortName: z.string(),
      initials: z.string(),
      accent: z.enum(["blue", "coral", "gold", "green", "violet"]),
      lens: z.string(),
      focus: z.string(),
      decision: decisionSchema,
      score: z.number().int().min(0).max(100),
      thesis: z.string(),
      plainLanguage: z.string().min(1).optional(),
      signatureAdvice: z.string(),
      questions: z.array(z.string())
    })
  ).length(5),
  timeline: z.array(
    z.object({ timestamp: z.string(), signal: z.string(), feedback: z.string() })
  ),
  valuation: z.object({
    range: z.string(),
    confidence: z.enum(["Low", "Medium", "High"]),
    framing: z.string(),
    assumptions: z.array(z.string())
  }),
  finalMemo: z.string().min(1)
});

const coreReportSchema = pitchReportSchema.pick({
  overallScore: true,
  businessScore: true,
  deliveryScore: true,
  recommendation: true,
  executiveSummary: true,
  scores: true,
  strengths: true,
  risks: true,
  riskGuidance: true,
  nextMilestones: true,
  finalMemo: true
}).superRefine((value, context) => {
  if (value.riskGuidance.length !== value.risks.length) {
    context.addIssue({
      code: "custom",
      path: ["riskGuidance"],
      message: "Every risk must have matching guidance."
    });
  }
});

const panelReportSchema = pitchReportSchema.pick({ investorPanel: true });
const evidenceReportSchema = pitchReportSchema.pick({ timeline: true, valuation: true });
const ycReportSchema = z.object({ ycEvaluation: ycEvaluationSchema });

type SectionSpec = {
  section: ReportSection;
  maxTokens: number;
  schema: z.ZodType;
};

type GenerateSectionInput = {
  input: GenerateReportInput;
  section: ReportSection;
  schema: z.ZodType;
  maxTokens: number;
  route: AiRoute;
  provider: "deepseek" | "openai";
  model: string;
  completion: (request: ReportSectionRequest) => Promise<ReportSectionCompletion>;
  timeoutMs: number;
  maxAttempts: number;
  sleep: (durationMs: number) => Promise<void>;
};

function sectionSpecsFor(input: GenerateReportInput): SectionSpec[] {
  const specs: SectionSpec[] = [
    { section: "core", maxTokens: 2_200, schema: coreReportSchema },
    { section: "panel", maxTokens: 2_800, schema: panelReportSchema },
    { section: "evidence", maxTokens: 1_200, schema: evidenceReportSchema }
  ];
  if (input.profile.reviewMode === "yc") {
    specs.push({ section: "yc", maxTokens: 1_600, schema: ycReportSchema });
  }
  return specs;
}

async function generateSection({
  input,
  section,
  schema,
  maxTokens,
  route,
  provider,
  model,
  completion,
  timeoutMs,
  maxAttempts,
  sleep
}: GenerateSectionInput) {
  const prompt = buildSectionPrompt(input, section);
  const estimatedInputTokens = Math.ceil(prompt.length / 4);
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    let response: ReportSectionCompletion | undefined;
    try {
      response = await completeWithTimeout(
        (signal) => completion({ section, prompt, maxTokens, attempt, signal }),
        timeoutMs
      );
      if (!response.content) throw new SectionGenerationError("empty_response");
      if (response.finishReason === "length") throw new SectionGenerationError("truncated");
      if (response.finishReason === "content_filter") throw new SectionGenerationError("content_filtered");

      const parsed = schema.parse(JSON.parse(stripCodeFence(response.content)));
      await input.onTelemetry?.(buildAttemptTelemetry({
        route,
        provider,
        model,
        section,
        attempt,
        status: "complete",
        response,
        estimatedInputTokens,
        maxTokens,
        latencyMs: Date.now() - startedAt
      }));
      return parsed;
    } catch (error) {
      lastError = error;
      const failureReason = sectionFailureReason(error);
      await input.onTelemetry?.(buildAttemptTelemetry({
        route,
        provider,
        model,
        section,
        attempt,
        status: error instanceof Error && error.name === "AiBudgetExceededError"
          ? "budget_exceeded"
          : "failed",
        response,
        estimatedInputTokens,
        maxTokens,
        latencyMs: Date.now() - startedAt,
        failureReason,
        errorCode: sectionErrorCode(error)
      }));

      if (attempt === maxAttempts || !isRetryableSectionFailure(error)) throw error;
      await sleep(250 * 2 ** (attempt - 1));
    }
  }

  throw lastError ?? new Error(`The ${section} report section could not be generated.`);
}

function buildAttemptTelemetry({
  route,
  provider,
  model,
  section,
  attempt,
  status,
  response,
  estimatedInputTokens,
  maxTokens,
  latencyMs,
  failureReason,
  errorCode
}: {
  route: AiRoute;
  provider: "deepseek" | "openai";
  model: string;
  section: ReportSection;
  attempt: number;
  status: AiRunTelemetry["status"];
  response?: ReportSectionCompletion;
  estimatedInputTokens: number;
  maxTokens: number;
  latencyMs: number;
  failureReason?: string;
  errorCode?: string;
}): AiRunTelemetry {
  const inputTokens = response?.inputTokens ?? estimatedInputTokens;
  const cachedInputTokens = response?.cachedInputTokens ?? 0;
  const outputTokens = response?.outputTokens ?? 0;
  let estimatedCostUsd = 0;
  if (provider === "deepseek") {
    estimatedCostUsd = estimateRunCost({ model, inputTokens, cachedInputTokens, outputTokens });
    if (!response && status === "complete") {
      estimatedCostUsd = estimateRunCost({ model, inputTokens, outputTokens: maxTokens });
    }
  }
  return {
    route,
    provider,
    model,
    status,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    estimatedCostUsd,
    latencyMs,
    section,
    attempt,
    responseCharacters: response?.content.length ?? 0,
    finishReason: response?.finishReason ?? undefined,
    failureReason,
    errorCode
  };
}

function createProviderCompletion({
  provider,
  model
}: {
  provider: "deepseek" | "openai";
  model: string;
}) {
  const usingDeepSeek = provider === "deepseek";
  const client = new OpenAI({
    apiKey: usingDeepSeek ? process.env.DEEPSEEK_API_KEY : process.env.OPENAI_API_KEY,
    baseURL: usingDeepSeek ? process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com" : undefined,
    maxRetries: 0
  });

  return async (request: ReportSectionRequest): Promise<ReportSectionCompletion> => {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a supportive startup pitch coach for high school and college students. Return only one valid JSON object matching the requested shape. Use plain language. Keep every field concise. Valuation estimates are practice-oriented ranges, not financial advice."
        },
        { role: "user", content: request.prompt }
      ],
      response_format: { type: "json_object" },
      max_tokens: request.maxTokens
    }, { signal: request.signal });
    const content = response.choices[0]?.message.content ?? "";
    return {
      content,
      finishReason: response.choices[0]?.finish_reason ?? null,
      inputTokens: response.usage?.prompt_tokens ?? Math.ceil(request.prompt.length / 4),
      cachedInputTokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? Math.ceil(content.length / 4)
    };
  };
}

function completeWithTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number) {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new SectionGenerationError("timeout"));
    }, timeoutMs);
  });
  return Promise.race([operation(controller.signal), timedOut]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

class SectionGenerationError extends Error {
  constructor(readonly reason: string) {
    super(`Report section generation failed: ${reason}.`);
    this.name = "SectionGenerationError";
  }
}

function isRetryableSectionFailure(error: unknown) {
  if (error instanceof SectionGenerationError) {
    return ["timeout", "truncated", "empty_response"].includes(error.reason);
  }
  if (error instanceof SyntaxError || error instanceof z.ZodError) return true;
  return isRetryableAiError(error);
}

function sectionFailureReason(error: unknown) {
  if (error instanceof SectionGenerationError) return error.reason;
  if (error instanceof SyntaxError) return "invalid_json";
  if (error instanceof z.ZodError) return "schema_validation";
  const status = error instanceof Error && "status" in error && typeof error.status === "number"
    ? error.status
    : undefined;
  return status ? `provider_${status}` : "provider_error";
}

function sectionErrorCode(error: unknown) {
  const reason = sectionFailureReason(error);
  if (["truncated", "invalid_json", "schema_validation", "empty_response"].includes(reason)) {
    return "invalid_provider_output";
  }
  if (reason === "timeout") return "provider_timeout";
  return telemetryErrorCode(error);
}

function routeForSection(tier: GenerateReportInput["tier"], section: ReportSection): AiRoute {
  if (tier !== "premium") return "basic";
  return section === "core" || section === "yc" ? "premium_synthesis" : "premium_evaluator";
}

function sectionTimeoutMs() {
  const configured = Number(process.env.AI_SECTION_TIMEOUT_MS ?? DEFAULT_SECTION_TIMEOUT_MS);
  return Number.isFinite(configured) && configured >= 1_000 ? configured : DEFAULT_SECTION_TIMEOUT_MS;
}

function defaultSleep(durationMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, durationMs));
}

export async function callWithRetry<T>(operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryableAiError(error) || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }
  throw new Error("AI request retry loop exhausted.");
}

export function isRetryableAiError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const status = "status" in error && typeof error.status === "number" ? error.status : undefined;
  return status === 408 || status === 409 || status === 429 || (status !== undefined && status >= 500);
}

export function stripCodeFence(content: string) {
  return content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export function telemetryErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "unknown_error";
  if (error.name === "AiBudgetExceededError") return "budget_exceeded";
  if (error instanceof z.ZodError || error instanceof SyntaxError) return "invalid_provider_output";
  const status = "status" in error && typeof error.status === "number" ? error.status : undefined;
  return status ? `provider_${status}` : "provider_error";
}

export function buildPrompt({ profile, transcript, deckText }: GenerateReportInput) {
  const reviewMode = profile.reviewMode ?? "investor";
  const ycConstraints = reviewMode === "yc" ? [
    "This is a YC application rehearsal, not an investor valuation exercise. Focus the report on whether the application video is clear, specific, credible, and memorable.",
    "Directly answer five YC questions: Is the idea immediately understandable? Is the problem real and urgent? Why are these founders right to build it? Is there evidence people want it? What could cause the application to be rejected?",
    "Do not predict acceptance odds and never claim that Y Combinator or its partners reviewed the application.",
    "Set ycEvaluation to a complete five-criterion evaluation and use one of these verdicts only: Ready to submit, Revise before submitting, Major rewrite needed."
  ] : [
    "This is an investor pitch rehearsal. Set ycEvaluation to null."
  ];

  return JSON.stringify({
    task: reviewMode === "yc"
      ? "Generate a YC application video rehearsal report with five supporting reviewer perspectives."
      : "Generate an AI Shark Tank investor panel report.",
    constraints: [
      "Write for a high school student. Use short sentences, common words, and an encouraging but honest tone.",
      "Keep each explanation to one or two sentences. Every bullet should make one clear point.",
      "Avoid unexplained business jargon. If a term such as unit economics, moat, liquidity, GMV, or go-to-market is necessary, explain it immediately in everyday language.",
      "Write every risk so a ninth-grade student can understand it without a business class. Do not use phrases such as enterprise sales cycle, burn cash, siloed data, deployment, or repeatable sales process unless you explain them in the same sentence.",
      "Each risk must clearly answer: what could happen, why that would hurt the startup, and one practical way to reduce the risk. Use everyday words instead of investor shorthand.",
      "Make every piece of criticism actionable: say what is unclear, why it matters, and the next step the founder can take.",
      "For every risk, include a matching riskGuidance item at the same array index with a simpler explanation and one concrete next step.",
      "For every investor perspective, include plainLanguage that restates the thesis for a ninth-grade student. signatureAdvice must be one concrete next action.",
      "Include exactly five investor perspectives in this order: tech and scale, story and sales, money and profit, product and customers, brand and growth.",
      "The report is an educational AI simulation. Never claim that Mark Cuban, Barbara Corcoran, Kevin O’Leary, Lori Greiner, Daymond John, ABC, or Shark Tank reviewed, wrote, approved, or endorsed the feedback.",
      "Use recommendation values only: Invest, Pass, Invest with Conditions.",
      "Scores must be integers from 0 to 100.",
      "Valuation confidence should usually be Low or Medium for early-stage companies.",
      ...ycConstraints
    ],
    outputShape: {
      id: "string",
      startupName: "string",
      generatedAt: "ISO string",
      overallScore: "number",
      businessScore: "number",
      deliveryScore: "number",
      recommendation: "Invest | Pass | Invest with Conditions",
      executiveSummary: "string",
      reviewMode: "investor | yc",
      ycEvaluation: reviewMode === "yc" ? {
        verdict: "Ready to submit | Revise before submitting | Major rewrite needed",
        ideaClarity: { score: "number", answer: "string", simpleExplanation: "string", nextStep: "string" },
        problemUrgency: { score: "number", answer: "string", simpleExplanation: "string", nextStep: "string" },
        founderFit: { score: "number", answer: "string", simpleExplanation: "string", nextStep: "string" },
        evidence: { score: "number", answer: "string", simpleExplanation: "string", nextStep: "string" },
        rejectionRisk: { score: "number", answer: "string", simpleExplanation: "string", nextStep: "string" }
      } : null,
      scores: [{ label: "string", value: "number", rationale: "string" }],
      strengths: ["string"],
      risks: ["string"],
      riskGuidance: [{ simpleExplanation: "string", nextStep: "string" }],
      nextMilestones: ["string"],
      investorPanel: [
        {
          name: "string",
          shortName: "string",
          initials: "string",
          accent: "blue | coral | gold | green | violet",
          lens: "string",
          focus: "string",
          decision: "Invest | Pass | Invest with Conditions",
          score: "number",
          thesis: "string",
          plainLanguage: "string",
          signatureAdvice: "string",
          questions: ["string"]
        }
      ],
      timeline: [{ timestamp: "MM:SS", signal: "string", feedback: "string" }],
      valuation: {
        range: "string",
        confidence: "Low | Medium | High",
        framing: "string",
        assumptions: ["string"]
      },
      finalMemo: "string"
    },
    profile,
    transcript: transcript || "Transcript unavailable. Evaluate business and delivery from provided details.",
    deckText: deckText || profile.deckNotes || "Deck text unavailable."
  });
}

export function buildSectionPrompt(input: GenerateReportInput, section: ReportSection) {
  const base = JSON.parse(buildPrompt(input)) as {
    task: string;
    constraints: string[];
    outputShape: Record<string, unknown>;
    profile: StartupProfile;
    transcript: string;
    deckText: string;
  };
  const keysBySection: Record<ReportSection, string[]> = {
    core: [
      "overallScore",
      "businessScore",
      "deliveryScore",
      "recommendation",
      "executiveSummary",
      "scores",
      "strengths",
      "risks",
      "riskGuidance",
      "nextMilestones",
      "finalMemo"
    ],
    panel: ["investorPanel"],
    evidence: ["timeline", "valuation"],
    yc: ["ycEvaluation"]
  };
  const outputShape = Object.fromEntries(
    keysBySection[section].map((key) => [key, base.outputShape[key]])
  );

  return JSON.stringify({
    task: `${base.task} Generate only the ${section} section. Do not add fields outside the requested shape.`,
    section,
    constraints: [
      ...base.constraints,
      "Keep string fields under 60 words and list fields to the minimum useful number of items.",
      "Return a complete JSON object. Never stop mid-string."
    ],
    outputShape,
    profile: base.profile,
    transcript: base.transcript,
    deckText: base.deckText
  });
}

const investorRoster = [
  { name: "Mark Cuban", shortName: "Tech & Scale", initials: "MC", accent: "gold", lens: "Can this become huge?", focus: "Technology, competition, and the path to a very large company" },
  { name: "Barbara Corcoran", shortName: "Story & Sales", initials: "BC", accent: "coral", lens: "Will customers care?", focus: "A memorable founder story and a practical sales plan" },
  { name: "Kevin O’Leary", shortName: "Money & Profit", initials: "KO", accent: "blue", lens: "Where is the profit?", focus: "Costs, pricing, and a believable path to profit" },
  { name: "Lori Greiner", shortName: "Product & Customers", initials: "LG", accent: "violet", lens: "Would people buy it?", focus: "A useful product that customers quickly understand" },
  { name: "Daymond John", shortName: "Brand & Growth", initials: "DJ", accent: "green", lens: "Will people remember it?", focus: "Brand, community, and a repeatable plan to grow" }
] as const;

export function applyInvestorRoster(panel: PitchReport["investorPanel"]): PitchReport["investorPanel"] {
  return panel.map((review, index) => ({ ...review, ...investorRoster[index] }));
}

function personalizeDemoReport(profile: StartupProfile): PitchReport {
  const reviewMode = profile.reviewMode ?? "investor";
  return {
    ...demoReport,
    id: crypto.randomUUID(),
    startupName: profile.startupName || demoReport.startupName,
    generatedAt: new Date().toISOString(),
    reviewMode,
    ycEvaluation: reviewMode === "yc" ? demoYcEvaluation : null,
    executiveSummary: `${profile.startupName || "This startup"} has a promising early pitch profile. The strongest current signal is the clarity of the problem and audience; the biggest improvement area is proving traction, acquisition repeatability, and the assumptions behind the fundraising ask.`,
    finalMemo: `${profile.startupName || "The company"} should tighten the story around measurable traction, customer urgency, and use of funds before a real investor meeting.`
  };
}
