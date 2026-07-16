import OpenAI from "openai";
import { z } from "zod";
import { demoReport } from "@/lib/demo-data";
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
              "You are an expert startup pitch evaluator. Return only one valid JSON object matching the requested shape. Valuation estimates are practice-oriented ranges, not financial advice."
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

export const pitchReportSchema = z.object({
  id: z.string().default(""),
  startupName: z.string(),
  generatedAt: z.string().default(""),
  overallScore: z.number().int().min(0).max(100),
  businessScore: z.number().int().min(0).max(100),
  deliveryScore: z.number().int().min(0).max(100),
  recommendation: decisionSchema,
  executiveSummary: z.string().min(1),
  scores: z.array(
    z.object({
      label: z.string(),
      value: z.number().int().min(0).max(100),
      rationale: z.string()
    })
  ),
  strengths: z.array(z.string()),
  risks: z.array(z.string()),
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

function buildPrompt({ profile, transcript, deckText }: GenerateReportInput) {
  return JSON.stringify({
    task: "Generate an AI Shark Tank investor panel report.",
    constraints: [
      "Use a college-graduate founder audience: direct, professional, encouraging, and specific.",
      "Include five investor perspectives with the named lenses: profit discipline, product and execution, founder and go-to-market, brand and community, customer delight and scale.",
      "Do not claim that any real investor reviewed the pitch. Names and public personas must not be used in generated output; return original agent names for production.",
      "Use recommendation values only: Invest, Pass, Invest with Conditions.",
      "Scores must be integers from 0 to 100.",
      "Valuation confidence should usually be Low or Medium for early-stage companies."
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
      scores: [{ label: "string", value: "number", rationale: "string" }],
      strengths: ["string"],
      risks: ["string"],
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
  { name: "Morgan Vale", shortName: "The Steward", initials: "MV", accent: "gold", lens: "Profit discipline", focus: "Capital efficiency and durable unit economics" },
  { name: "Alex Rowan", shortName: "The Operator", initials: "AR", accent: "blue", lens: "Product and execution", focus: "Product defensibility and operating velocity" },
  { name: "Rina Calder", shortName: "The Storyteller", initials: "RC", accent: "coral", lens: "Founder and go-to-market", focus: "Founder clarity and repeatable distribution" },
  { name: "Darius North", shortName: "The Brand Builder", initials: "DN", accent: "green", lens: "Brand and community", focus: "Cultural resonance and community-led growth" },
  { name: "Leah Quinn", shortName: "The Customer Advocate", initials: "LQ", accent: "violet", lens: "Customer delight and scale", focus: "Customer experience and scalable demand" }
] as const;

export function applyInvestorRoster(panel: PitchReport["investorPanel"]): PitchReport["investorPanel"] {
  return panel.map((review, index) => ({ ...review, ...investorRoster[index] }));
}

function personalizeDemoReport(profile: StartupProfile): PitchReport {
  return {
    ...demoReport,
    id: crypto.randomUUID(),
    startupName: profile.startupName || demoReport.startupName,
    generatedAt: new Date().toISOString(),
    executiveSummary: `${profile.startupName || "This startup"} has a promising early pitch profile. The strongest current signal is the clarity of the problem and audience; the biggest improvement area is proving traction, acquisition repeatability, and the assumptions behind the fundraising ask.`,
    finalMemo: `${profile.startupName || "The company"} should tighten the story around measurable traction, customer urgency, and use of funds before a real investor meeting.`
  };
}
