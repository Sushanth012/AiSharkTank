import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  MessageCircleQuestion,
  Sparkles
} from "lucide-react";
import type { InvestorDecision, InvestorReview, PitchReport, YcEvaluation } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { ReportActions } from "@/components/ReportActions";
import { FeedbackHelp } from "@/components/FeedbackHelp";

const sharkRoster = [
  { name: "Mark Cuban", title: "Tech & Scale", lens: "Can this become huge?", accent: "gold" },
  { name: "Barbara Corcoran", title: "Story & Sales", lens: "Will customers care?", accent: "coral" },
  { name: "Kevin O’Leary", title: "Money & Profit", lens: "Where is the profit?", accent: "blue" },
  { name: "Lori Greiner", title: "Product & Customers", lens: "Would people buy it?", accent: "violet" },
  { name: "Daymond John", title: "Brand & Growth", lens: "Will people remember it?", accent: "green" }
] as const;

function decisionExplanation(decision: InvestorDecision) {
  if (decision === "Invest") return "The idea looks ready for a serious next conversation.";
  if (decision === "Pass") return "It is not ready yet. Use the feedback, improve it, and pitch again.";
  return "The idea is promising, but investors would want proof of a few key things first.";
}

function scoreLabel(score: number) {
  if (score >= 80) return "Strong";
  if (score >= 65) return "Getting there";
  return "Needs work";
}

function simplifyKnownTerms(comment: string) {
  const replacements: Array<[RegExp, string]> = [
    [/enterprise sales cycles/gi, "the long process of selling to large companies"],
    [/burning cash/gi, "spending money before earning enough back"],
    [/siloed company data/gi, "company information stored in separate systems"],
    [/deployments/gi, "customer setups"],
    [/repeatable sales process/gi, "clear sales steps that work more than once"],
    [/marketplace liquidity/gi, "having enough active buyers and sellers"],
    [/customer acquisition/gi, "finding and winning new customers"],
    [/unit economics/gi, "the money earned and spent on each customer or sale"],
    [/\bmoat\b/gi, "protection from competitors"],
    [/\bGMV\b/g, "the total value sold"],
    [/take rate/gi, "the percentage of each sale the company keeps"]
  ];
  const simplified = replacements.reduce(
    (result, [term, meaning]) => result.replace(term, meaning),
    comment
  );

  return simplified === comment
    ? "This could make the startup harder, slower, or more expensive to grow. Test it with a small real-world experiment before making a bigger bet."
    : simplified;
}

const ycCriteria = [
  ["ideaClarity", "Is the idea immediately understandable?"],
  ["problemUrgency", "Is the problem real and urgent?"],
  ["founderFit", "Why are these founders right for it?"],
  ["evidence", "Is there evidence people want it?"],
  ["rejectionRisk", "What would make YC reject the application?"]
] as const;

export function YcEvaluationSection({ evaluation }: { evaluation: YcEvaluation }) {
  return (
    <section className="yc-evaluation" aria-labelledby="yc-evaluation-title">
      <div className="yc-evaluation-heading">
        <div>
          <p className="eyebrow">Application mode</p>
          <h2 id="yc-evaluation-title">Five questions between you and submit.</h2>
        </div>
        <div className="yc-verdict-stamp">
          <span>Verdict</span>
          <strong>{evaluation.verdict}</strong>
        </div>
      </div>
      <div className="yc-criteria-grid">
        {ycCriteria.map(([key, question], index) => {
          const criterion = evaluation[key];
          return (
            <article className="yc-criterion" key={key}>
              <div className="yc-criterion-number">0{index + 1}</div>
              <div className="yc-criterion-score"><strong>{criterion.score}</strong><span>/100</span></div>
              <h3>{question}</h3>
              <p>{criterion.answer}</p>
              <FeedbackHelp explanation={criterion.simpleExplanation} nextStep={criterion.nextStep} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

function displaySharks(panel: InvestorReview[]) {
  return panel.map((review, index) => ({
    ...review,
    ...sharkRoster[index],
    avatarIndex: index
  }));
}

function SharkPortrait({ index, name, large = false }: { index: number; name: string; large?: boolean }) {
  return (
    <span
      className={`investor-portrait portrait-${index}${large ? " large" : ""}`}
      role="img"
      aria-label={`${name}, AI-generated educational illustration`}
    />
  );
}

export function ReportView({ report }: { report: PitchReport }) {
  const isYcMode = report.reviewMode === "yc" && report.ycEvaluation;
  const sharks = displaySharks(report.investorPanel);
  const investVotes = report.investorPanel.filter((investor) => investor.decision === "Invest").length;
  const conditionVotes = report.investorPanel.filter(
    (investor) => investor.decision === "Invest with Conditions"
  ).length;

  return (
    <div className="report-layout">
      <div className="grid">
        <section className="panel report-hero">
          <div className="report-hero-top">
            <div>
              <p className="eyebrow">{isYcMode ? "YC application readout" : "The big answer"}</p>
              <h1>{report.startupName}</h1>
              <div className="decision-translation">
                {isYcMode ? <span className="yc-hero-verdict">{report.ycEvaluation!.verdict}</span> : <StatusBadge decision={report.recommendation} />}
                <p>{isYcMode ? "A practice read on whether your video makes a convincing, easy-to-follow case." : decisionExplanation(report.recommendation)}</p>
              </div>
            </div>
            <div className="report-score">
              <strong>{report.overallScore}</strong>
              <span>{scoreLabel(report.overallScore)}</span>
            </div>
          </div>
          <p className="report-summary">{report.executiveSummary}</p>
          <div className={`panel-vote-strip${isYcMode ? " yc" : ""}`}>
            <div>
              <span>{isYcMode ? "What this review checked" : "How the sharks voted"}</span>
              <strong>{isYcMode ? "Clarity · urgency · founder fit · evidence · rejection risk" : `${investVotes} yes · ${conditionVotes} yes, with conditions`}</strong>
            </div>
            {!isYcMode ? <div className="vote-avatars" aria-label="Five AI-simulated investor perspectives">
              {sharks.map((shark) => (
                <SharkPortrait index={shark.avatarIndex} key={shark.name} name={shark.name} />
              ))}
            </div> : <CheckCircle2 size={34} aria-hidden="true" />}
          </div>
        </section>

        {isYcMode ? <YcEvaluationSection evaluation={report.ycEvaluation!} /> : null}

        <section className="card scorecard-card">
          <div className="plain-section-heading">
            <div>
              <p className="eyebrow">Your pitch, broken down</p>
              <h2>What the score means</h2>
            </div>
            <p>80–100 is strong. 65–79 is getting there. Below 65 needs another round of work.</p>
          </div>
          <div className="score-row">
            {report.scores.map((score) => (
              <div className="score-line" key={score.label}>
                <div className="score-top">
                  <span>{score.label}</span>
                  <span>{score.value}/100 · {scoreLabel(score.value)}</span>
                </div>
                <div className="bar" aria-label={`${score.label}: ${score.value} out of 100`}>
                  <span style={{ width: `${score.value}%` }} />
                </div>
                <p>{score.rationale}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid two report-lists">
          <section className="card">
            <p className="eyebrow">Keep this</p>
            <h2>What is working</h2>
            <ul className="list">
              {report.strengths.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
          <section className="card warning-card">
            <p className="eyebrow">Plan for this</p>
            <h2>Problems to solve before they grow</h2>
            <p>These are things that could slow down the startup. Use them as a to-do list, not as a reason to give up.</p>
            <ul className="list guided-risk-list">
              {report.risks.map((item, index) => {
                const guidance = report.riskGuidance?.[index];
                return (
                  <li key={item}>
                    <span>{item}</span>
                    <FeedbackHelp
                      explanation={guidance?.simpleExplanation ?? simplifyKnownTerms(item)}
                      nextStep={guidance?.nextStep ?? report.nextMilestones[index] ?? "Rewrite this part with one specific fact, number, or customer example."}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <section className="investor-panel-section">
          <div className="section-title panel-section-title">
            <div>
              <p className="eyebrow">{isYcMode ? "Five application reviewers" : "Meet your five sharks"}</p>
              <h2>{isYcMode ? "Pressure-test the answers behind your video." : "Five people. Five different questions."}</h2>
              <p>{isYcMode ? "The panel still challenges your application from five different business angles, but the main verdict above is based on YC application readiness." : "Five well-known investing styles, translated into clear feedback you can practice with."}</p>
              <div className="simulation-disclaimer">
                Educational AI simulation. The portraits and feedback are AI-generated and inspired by publicly known investing styles. These investors did not review or endorse this report. PitchTank is not affiliated with ABC or <em>Shark Tank</em>.
              </div>
            </div>
          </div>
          <div className="shark-grid">
            {sharks.map((shark) => (
              <article className={`shark-card ${shark.accent}`} key={shark.name}>
                <div className="shark-card-top">
                  <SharkPortrait index={shark.avatarIndex} name={shark.name} large />
                  <div>
                    <p className="shark-lens">{shark.lens}</p>
                    <h3>{shark.name}</h3>
                    <p>{shark.title}</p>
                  </div>
                  <div className="shark-score">
                    <strong>{shark.score}</strong>
                    <span>{scoreLabel(shark.score)}</span>
                  </div>
                </div>
                <div className="shark-verdict">
                  <StatusBadge decision={shark.decision} />
                  <span>{decisionExplanation(shark.decision)}</span>
                </div>
                <div className="shark-says">
                  <span>Their take</span>
                  <p>{shark.thesis}</p>
                </div>
                <FeedbackHelp explanation={shark.plainLanguage ?? simplifyKnownTerms(shark.thesis)} nextStep={shark.signatureAdvice} />
                <div className="signature-advice">
                  <Sparkles size={18} aria-hidden="true" />
                  <div><strong>Do this next</strong><p>{shark.signatureAdvice}</p></div>
                </div>
                <div className="shark-questions">
                  <p><MessageCircleQuestion size={17} aria-hidden="true" /> Be ready to answer</p>
                  <ul className="list">
                    {shark.questions.map((question) => <li key={question}>{question}</li>)}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="card final-answer-card">
          <div className="memo-heading">{isYcMode ? <CheckCircle2 size={22} aria-hidden="true" /> : <CircleDollarSign size={22} aria-hidden="true" />}<h2>{isYcMode ? "Application verdict" : "The bottom line"}</h2></div>
          <p>{report.finalMemo}</p>
        </section>
      </div>

      <aside className="grid report-side">
        <section className="card next-moves-card">
          <p className="eyebrow">Your game plan</p>
          <h2>Do these 3 things next</h2>
          <ol className="numbered-list">
            {report.nextMilestones.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </section>
        {!isYcMode ? <section className="card">
          <p className="eyebrow">Practice estimate</p>
          <h2>Possible valuation</h2>
          <p className="valuation-number">{report.valuation.range}</p>
          <p>{report.valuation.framing}</p>
          <div className="callout valuation-warning">
            This is an AI practice estimate, not a price or financial advice. Confidence: {report.valuation.confidence}.
          </div>
          <details className="assumption-details">
            <summary>What this estimate assumes</summary>
            <ul className="list">
              {report.valuation.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}
            </ul>
          </details>
        </section> : null}
        <section className="card">
          <p className="eyebrow">Watch it back</p>
          <h2>Moment-by-moment coaching</h2>
          <div className="timeline-list">
            {report.timeline.map((moment) => (
              <div key={`${moment.timestamp}-${moment.signal}`}>
                <span>{moment.timestamp}</span>
                <div><strong>{moment.signal}</strong><p>{moment.feedback}</p></div>
              </div>
            ))}
          </div>
        </section>
        <section className="card glossary-card">
          <p className="eyebrow">Business words, decoded</p>
          <h2>Quick translation</h2>
          <dl>
            <div><dt>GMV</dt><dd>The total value of everything sold through the business.</dd></div>
            <div><dt>Take rate</dt><dd>The percentage of each sale the company keeps as a fee.</dd></div>
            <div><dt>Customer acquisition cost</dt><dd>How much you spend to get one new customer.</dd></div>
            <div><dt>Moat</dt><dd>Something that makes the business difficult for competitors to copy.</dd></div>
            <div><dt>Marketplace liquidity</dt><dd>Having enough buyers and sellers for people to find what they need quickly.</dd></div>
            <div><dt>Pre-money valuation</dt><dd>What the company may be worth before receiving new investment.</dd></div>
          </dl>
        </section>
        <section className="card report-actions-card">
          <p className="meta"><CalendarClock size={15} aria-hidden="true" />{new Date(report.generatedAt).toLocaleString()}</p>
          <ReportActions reportId={report.id} />
          <a className="report-help-link" href="/new">Try another pitch <ArrowUpRight size={16} aria-hidden="true" /></a>
        </section>
      </aside>
    </div>
  );
}
