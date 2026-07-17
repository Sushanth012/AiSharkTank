import type { DashboardSubmission, PitchReport, StartupProfile, YcEvaluation } from "@/lib/types";

export const sampleProfile: StartupProfile = {
  reviewMode: "investor",
  startupName: "CampusCart",
  founderName: "Maya Chen",
  industry: "Consumer Marketplace",
  stage: "Pre-seed",
  description:
    "CampusCart helps students buy, sell, and bundle used dorm essentials during move-in and move-out weeks.",
  targetCustomer: "College students and parents at large residential universities.",
  businessModel: "Transaction fee plus promoted listings for local vendors.",
  traction: "Pilot waitlist of 430 students across two campuses.",
  founderFit: "The founding team has lived through campus move-outs and has already organized student resale groups.",
  fundingGoal: "$250K to expand to ten universities.",
  demoLink: "https://example.com",
  deckNotes: "Deck covers problem, TAM, launch plan, early demand, and unit economics."
};

export const demoYcEvaluation: YcEvaluation = {
  verdict: "Revise before submitting",
  ideaClarity: {
    score: 88,
    answer: "Yes. CampusCart is easy to describe in one sentence.",
    simpleExplanation: "A reviewer can quickly tell what the product does and who it helps.",
    nextStep: "Open the video with one sentence: CampusCart helps students buy and sell dorm items during move-in and move-out."
  },
  problemUrgency: {
    score: 82,
    answer: "The move-out deadline creates a real and time-sensitive problem.",
    simpleExplanation: "Students must get rid of useful items quickly, so waiting has a clear cost.",
    nextStep: "Tell one short story about a student facing this problem the week before move-out."
  },
  founderFit: {
    score: 70,
    answer: "The team understands campus life, but the video needs stronger proof that they are uniquely prepared.",
    simpleExplanation: "The idea fits the founders, but the application should show what they know or can do that others cannot.",
    nextStep: "Add one specific example of the team organizing student resale or building for campus communities."
  },
  evidence: {
    score: 76,
    answer: "A 430-student waitlist is promising, but completed transactions would be stronger evidence.",
    simpleExplanation: "People have shown interest, but the application needs proof that they will actually use or pay for the product.",
    nextStep: "Run a small pilot and include listings, completed sales, and repeat users in the video."
  },
  rejectionRisk: {
    score: 64,
    answer: "YC could see this as a seasonal marketplace that is difficult to expand campus by campus.",
    simpleExplanation: "The biggest concern is whether the product stays useful all year and can grow without lots of manual work.",
    nextStep: "Explain one off-season use case and show a campus launch process another person can repeat."
  }
};

export const demoReport: PitchReport = {
  id: "demo-report",
  startupName: "CampusCart",
  generatedAt: new Date().toISOString(),
  reviewMode: "investor",
  ycEvaluation: null,
  overallScore: 82,
  businessScore: 84,
  deliveryScore: 78,
  recommendation: "Invest with Conditions",
  executiveSummary:
    "CampusCart has a sharp student-life problem, a clear launch wedge, and credible early demand. The pitch is strongest when it ties move-out urgency to repeatable campus expansion, but it needs more proof around supply density and take-rate durability.",
  scores: [
    {
      label: "Problem Urgency",
      value: 88,
      rationale: "The pain point is seasonal, emotionally clear, and easy for students to understand."
    },
    {
      label: "Market & Expansion",
      value: 80,
      rationale: "Campus-by-campus rollout is plausible, though national scale depends on repeatable ambassador operations."
    },
    {
      label: "Business Model",
      value: 76,
      rationale: "Transaction fees are intuitive, but the pitch should show expected order volume and fee sensitivity."
    },
    {
      label: "Founder Delivery",
      value: 78,
      rationale: "Confident and concise overall, with room to slow down during financial assumptions."
    }
  ],
  strengths: [
    "Clear customer and specific launch window.",
    "Simple marketplace behavior that students already understand.",
    "Early waitlist traction gives the story useful credibility."
  ],
  risks: [
    "Marketplace liquidity may be hard outside move-in and move-out periods.",
    "Customer acquisition could become labor-intensive campus by campus.",
    "Current valuation case depends on assumptions that need more operating proof."
  ],
  riskGuidance: [
    {
      simpleExplanation: "The marketplace may feel empty during months when students are not moving in or out.",
      nextStep: "Test one useful off-season category and measure whether students keep buying and selling."
    },
    {
      simpleExplanation: "Launching at each new campus could require too much manual work and too many ambassadors.",
      nextStep: "Write one repeatable campus launch checklist and test it at three schools."
    },
    {
      simpleExplanation: "The company value is based on predictions that have not been proven with real sales yet.",
      nextStep: "Use pilot sales, fees, and repeat-use numbers to support the next valuation discussion."
    }
  ],
  nextMilestones: [
    "Run a full move-out pilot and publish sell-through, GMV, and repeat listing data.",
    "Validate ambassador acquisition cost across at least three campuses.",
    "Add a retention plan for off-season categories or local vendor bundles."
  ],
  investorPanel: [
    {
      name: "Morgan Vale",
      shortName: "The Steward",
      initials: "MV",
      accent: "gold",
      lens: "Profit discipline",
      focus: "Capital efficiency and durable unit economics",
      decision: "Invest with Conditions",
      score: 81,
      thesis:
        "The margin path can work if take rate and campus operations stay lean, but I need one complete season of unit economics.",
      plainLanguage: "The business could make money, but you need to prove how much is left after the costs of running one campus.",
      signatureAdvice:
        "Show the exact path from campus GMV to cash in the bank before asking me to fund expansion.",
      questions: [
        "What is your expected GMV per campus during move-out week?",
        "How will you keep acquisition costs from rising after the first ambassador cohort?"
      ]
    },
    {
      name: "Alex Rowan",
      shortName: "The Operator",
      initials: "AR",
      accent: "blue",
      lens: "Product and execution",
      focus: "Product defensibility and operating velocity",
      decision: "Pass",
      score: 72,
      thesis:
        "The product solves a real problem, but the current pitch does not yet show a durable technical moat.",
      plainLanguage: "The problem is real, but the pitch does not explain what would stop a larger company from copying the product.",
      signatureAdvice:
        "Prove that the product gets better and cheaper to run every time a campus joins.",
      questions: [
        "What data advantage compounds after each campus launch?",
        "Why would Facebook Marketplace or a university app not copy the core flow?"
      ]
    },
    {
      name: "Rina Calder",
      shortName: "The Storyteller",
      initials: "RC",
      accent: "coral",
      lens: "Founder and go-to-market",
      focus: "Founder clarity and repeatable distribution",
      decision: "Invest",
      score: 89,
      thesis:
        "The student positioning is crisp and the timing creates natural urgency. This could spread quickly with the right campus playbook.",
      plainLanguage: "Students can quickly understand why they need this, but growth depends on a launch process that works at every school.",
      signatureAdvice:
        "Lead with the student who needs this tomorrow, then make every number support that story.",
      questions: [
        "Which campus roles become your highest-converting ambassadors?",
        "What is the brand promise students repeat to their friends?"
      ]
    },
    {
      name: "Darius North",
      shortName: "The Brand Builder",
      initials: "DN",
      accent: "green",
      lens: "Brand and community",
      focus: "Cultural resonance and community-led growth",
      decision: "Invest",
      score: 86,
      thesis:
        "CampusCart has the beginnings of a brand students can identify with, especially when the message stays local and useful rather than generic.",
      plainLanguage: "The brand can feel made for students if it keeps using local campus language and solves a practical problem.",
      signatureAdvice:
        "Build campus identity into the product so students feel they are joining something, not downloading another marketplace.",
      questions: [
        "What is the one visual cue that makes CampusCart recognizable in a dorm hallway?",
        "How will ambassadors make the brand feel native on each campus?"
      ]
    },
    {
      name: "Leah Quinn",
      shortName: "The Customer Advocate",
      initials: "LQ",
      accent: "violet",
      lens: "Customer delight and scale",
      focus: "Customer experience and scalable demand",
      decision: "Invest with Conditions",
      score: 80,
      thesis:
        "The idea is immediately understandable, but the pitch needs to demonstrate a smoother buyer and seller experience before scaling the launch plan.",
      plainLanguage: "People understand the idea, but the first sale needs to feel much easier before the company expands.",
      signatureAdvice:
        "Make the first transaction feel effortless, because that is what turns a clever idea into a habit.",
      questions: [
        "What happens when a student cannot find a buyer before move-out day?",
        "Which part of the first transaction can become a delightful signature moment?"
      ]
    }
  ],
  timeline: [
    {
      timestamp: "00:20",
      signal: "Strong hook",
      feedback: "The opening problem statement is specific and relatable."
    },
    {
      timestamp: "01:35",
      signal: "Needs evidence",
      feedback: "Add pilot numbers before introducing the expansion plan."
    },
    {
      timestamp: "03:10",
      signal: "Financial clarity",
      feedback: "Slow down and separate GMV, take rate, and revenue assumptions."
    }
  ],
  valuation: {
    range: "$1.5M - $2.5M pre-money",
    confidence: "Low",
    framing:
      "This is a practice-oriented estimate based on stage, traction, market clarity, and perceived fundraising risk. It is not financial advice or a formal valuation.",
    assumptions: [
      "Pre-seed company with early waitlist traction, not recurring revenue.",
      "Funding goal is modest and tied to pilot expansion.",
      "Comparable marketplace risk keeps the range conservative until GMV data exists."
    ]
  },
  finalMemo:
    "CampusCart is worth another conversation if the next pilot proves marketplace liquidity and repeatable campus acquisition. The investor story should move from a clever student marketplace to a measurable seasonal operating machine."
};

export const demoSubmissions: DashboardSubmission[] = [
  {
    id: "sub-demo-1",
    startupName: "CampusCart",
    createdAt: new Date().toISOString(),
    status: "complete",
    reportId: "demo-report",
    overallScore: 82,
    recommendation: "Invest with Conditions"
  },
  {
    id: "sub-demo-2",
    startupName: "DormOS",
    createdAt: "2026-07-05T16:30:00.000Z",
    status: "processing"
  }
];
