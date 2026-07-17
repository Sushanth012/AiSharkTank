export type SubmissionStatus = "queued" | "processing" | "complete" | "failed";
export type InvestorDecision = "Invest" | "Pass" | "Invest with Conditions";
export type ReviewMode = "investor" | "yc";

export type StartupProfile = {
  reviewMode?: ReviewMode;
  startupName: string;
  founderName: string;
  industry: string;
  stage: string;
  description: string;
  targetCustomer: string;
  businessModel: string;
  traction: string;
  founderFit?: string;
  fundingGoal: string;
  demoLink?: string;
  deckNotes?: string;
};

export type Score = {
  label: string;
  value: number;
  rationale: string;
};

export type InvestorReview = {
  name: string;
  shortName: string;
  initials: string;
  accent: "blue" | "coral" | "gold" | "green" | "violet";
  lens: string;
  focus: string;
  decision: InvestorDecision;
  score: number;
  thesis: string;
  plainLanguage?: string;
  signatureAdvice: string;
  questions: string[];
};

export type FeedbackGuidance = {
  simpleExplanation: string;
  nextStep: string;
};

export type YcCriterion = FeedbackGuidance & {
  score: number;
  answer: string;
};

export type YcEvaluation = {
  verdict: "Ready to submit" | "Revise before submitting" | "Major rewrite needed";
  ideaClarity: YcCriterion;
  problemUrgency: YcCriterion;
  founderFit: YcCriterion;
  evidence: YcCriterion;
  rejectionRisk: YcCriterion;
};

export type TimelineMoment = {
  timestamp: string;
  signal: string;
  feedback: string;
};

export type ValuationEstimate = {
  range: string;
  confidence: "Low" | "Medium" | "High";
  framing: string;
  assumptions: string[];
};

export type PitchReport = {
  id: string;
  startupName: string;
  generatedAt: string;
  overallScore: number;
  businessScore: number;
  deliveryScore: number;
  recommendation: InvestorDecision;
  executiveSummary: string;
  reviewMode?: ReviewMode;
  ycEvaluation?: YcEvaluation | null;
  scores: Score[];
  strengths: string[];
  risks: string[];
  riskGuidance?: FeedbackGuidance[];
  nextMilestones: string[];
  investorPanel: InvestorReview[];
  timeline: TimelineMoment[];
  valuation: ValuationEstimate;
  finalMemo: string;
};

export type DashboardSubmission = {
  id: string;
  startupName: string;
  createdAt: string;
  status: SubmissionStatus;
  reportId?: string;
  overallScore?: number;
  recommendation?: InvestorDecision;
};
