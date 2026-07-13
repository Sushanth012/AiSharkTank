import OpenAI from "openai";
import { demoReport } from "@/lib/demo-data";
import { isOpenAIConfigured } from "@/lib/config";
import type { PitchReport, StartupProfile } from "@/lib/types";

type GenerateReportInput = {
  profile: StartupProfile;
  transcript?: string;
  deckText?: string;
};

export async function generateInvestmentReport(input: GenerateReportInput): Promise<PitchReport> {
  if (!isOpenAIConfigured) {
    return personalizeDemoReport(input.profile);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL ?? "gpt-5.5",
    instructions:
      "You are an expert startup pitch evaluator. Return only valid JSON matching the requested report shape. Valuation estimates must be framed as practice-oriented ranges, not financial advice.",
    input: buildPrompt(input)
  });

  try {
    const parsed = JSON.parse(response.output_text) as PitchReport;
    return {
      ...parsed,
      id: parsed.id || crypto.randomUUID(),
      startupName: input.profile.startupName,
      generatedAt: new Date().toISOString()
    };
  } catch {
    return personalizeDemoReport(input.profile);
  }
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
