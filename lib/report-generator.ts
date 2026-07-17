import OpenAI from "openai";
import { z } from "zod";
import { demoReport, demoYcEvaluation } from "@/lib/demo-data";
import { isDeepSeekConfigured, isOpenAIConfigured } from "@/lib/config";
import { assertWithinBudget, budgetForRoute, estimateRunCost, modelForRoute } from "@/lib/ai/models";
import type { AiRoute } from "@/lib/ai/models";
import type { PitchReport, StartupProfile } from "@/lib/types";

type GenerateReportInput = {
  profile: StartupProfile;
  transcript?: string;
  deckText?: string;
  tier?: "basic" | "premium";
  onTelemetry?: (telemetry: AiRunTelemetry) => Promise<void>;
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
  errorCode?: string;
};

export async function generateInvestmentReport(input: GenerateReportInput): Promise<PitchReport> {
  if (!isDeepSeekConfigured && !isOpenAIConfigured) {
    return personalizeDemoReport(input.profile);
  }

  const usingDeepSeek = isDeepSeekConfigured;
  const route: AiRoute = input.tier === "premium" ? "premium_synthesis" : "basic";
  const provider = usingDeepSeek ? "deepseek" : "openai";
  const model = usingDeepSeek ? modelForRoute(route) : process.env.OPENAI_MODEL ?? "gpt-5.5";
  const prompt = buildPrompt(input);
  const estimatedInputTokens = Math.ceil(prompt.length / 4);
  let estimatedCostUsd = 0;

  if (usingDeepSeek) {
    estimatedCostUsd = estimateRunCost({ model, inputTokens: estimatedInputTokens, outputTokens: 6_000 });
    assertWithinBudget(estimatedCostUsd, budgetForRoute(route));
  }

  const client = new OpenAI({
    apiKey: usingDeepSeek ? process.env.DEEPSEEK_API_KEY : process.env.OPENAI_API_KEY,
    baseURL: usingDeepSeek ? process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com" : undefined
  });
  const startedAt = Date.now();
  try {
    const response = await callWithRetry(() =>
      client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "You are a supportive startup pitch coach for high school and college students. Return only one valid JSON object matching the requested shape. Use plain language. Valuation estimates are practice-oriented ranges, not financial advice."
          },
          { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        max_tokens: 6_000
      })
    );

    const content = response.choices[0]?.message.content;
    if (!content) {
      throw new Error("The AI provider returned an empty report.");
    }

    const parsed = pitchReportSchema.parse(JSON.parse(stripCodeFence(content)));
    if (input.profile.reviewMode === "yc" && !parsed.ycEvaluation) {
      throw new Error("The AI provider omitted the YC application evaluation.");
    }
    const inputTokens = response.usage?.prompt_tokens ?? estimatedInputTokens;
    const cachedInputTokens = response.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

    if (usingDeepSeek && response.usage) {
      estimatedCostUsd = estimateRunCost({ model, inputTokens, cachedInputTokens, outputTokens });
      assertWithinBudget(estimatedCostUsd, budgetForRoute(route));
    }

    await input.onTelemetry?.({
      route,
      provider,
      model,
      status: "complete",
      inputTokens,
      cachedInputTokens,
      outputTokens,
      estimatedCostUsd,
      latencyMs: Date.now() - startedAt
    });

    return {
      ...parsed,
      id: parsed.id || crypto.randomUUID(),
      startupName: input.profile.startupName,
      generatedAt: new Date().toISOString(),
      reviewMode: input.profile.reviewMode ?? "investor",
      investorPanel: applyInvestorRoster(parsed.investorPanel)
    };
  } catch (error) {
    await input.onTelemetry?.({
      route,
      provider,
      model,
      status: error instanceof Error && error.name === "AiBudgetExceededError" ? "budget_exceeded" : "failed",
      inputTokens: estimatedInputTokens,
      cachedInputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd,
      latencyMs: Date.now() - startedAt,
      errorCode: telemetryErrorCode(error)
    });
    throw error;
  }
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
  ycEvaluation: z.object({
    verdict: z.enum(["Ready to submit", "Revise before submitting", "Major rewrite needed"]),
    ideaClarity: ycCriterionSchema,
    problemUrgency: ycCriterionSchema,
    founderFit: ycCriterionSchema,
    evidence: ycCriterionSchema,
    rejectionRisk: ycCriterionSchema
  }).nullable().optional().default(null),
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
