import { CalendarClock, ChevronRight, CircleDollarSign, MessageCircleQuestion, Sparkles } from "lucide-react";
import type { PitchReport } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { ReportActions } from "@/components/ReportActions";

export function ReportView({ report }: { report: PitchReport }) {
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
              <p className="eyebrow">Panel decision</p>
              <h1>{report.startupName}</h1>
              <p>{report.executiveSummary}</p>
            </div>
            <div className="report-score">
              <strong>{report.overallScore}</strong>
              <span>Panel score</span>
            </div>
          </div>
          <div className="panel-vote-strip">
            <div>
              <span>Panel votes</span>
              <strong>{investVotes} invest · {conditionVotes} conditional</strong>
            </div>
            <div className="vote-avatars" aria-label="Investor panel">
              {report.investorPanel.map((investor) => (
                <span className={`investor-avatar ${investor.accent}`} key={investor.name} title={investor.name}>
                  {investor.initials}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="card">
          <h3>Scorecard</h3>
          <div className="score-row">
            {report.scores.map((score) => (
              <div className="score-line" key={score.label}>
                <div className="score-top">
                  <span>{score.label}</span>
                  <span>{score.value}/100</span>
                </div>
                <div className="bar">
                  <span style={{ width: `${score.value}%` }} />
                </div>
                <p>{score.rationale}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid two">
          <section className="card">
            <h3>Strengths</h3>
            <ul className="list">
              {report.strengths.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h3>Risks</h3>
            <ul className="list">
              {report.risks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </div>

        <section className="investor-panel-section">
          <div className="section-title panel-section-title">
            <div>
              <p className="eyebrow">Five investor lenses</p>
              <h2>Inside the shark panel</h2>
              <p>Each verdict uses a distinct investing lens. These are practice perspectives inspired by public investor styles, not endorsements or real investor reviews.</p>
            </div>
          </div>
          <div className="shark-grid">
            {report.investorPanel.map((investor) => (
              <article className={`shark-card ${investor.accent}`} key={investor.name}>
                <div className="shark-card-top">
                  <div className={`investor-avatar large ${investor.accent}`}>{investor.initials}</div>
                  <div>
                    <p className="shark-lens">{investor.lens}</p>
                    <h3>{investor.name}</h3>
                    <p>{investor.shortName}</p>
                  </div>
                  <div className="shark-score">
                    <strong>{investor.score}</strong>
                    <span>score</span>
                  </div>
                </div>
                <div className="shark-verdict">
                  <StatusBadge decision={investor.decision} />
                  <span>{investor.focus}</span>
                </div>
                <p className="shark-thesis">{investor.thesis}</p>
                <div className="signature-advice">
                  <Sparkles size={15} aria-hidden="true" />
                  <p>{investor.signatureAdvice}</p>
                </div>
                <div className="shark-questions">
                  <p><MessageCircleQuestion size={15} aria-hidden="true" /> Questions to answer</p>
                  <ul className="list">
                    {investor.questions.map((question) => (
                      <li key={question}>{question}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="memo-heading"><CircleDollarSign size={20} aria-hidden="true" /><h3>Final investment memo</h3></div>
          <p>{report.finalMemo}</p>
        </section>
      </div>

      <aside className="grid">
        <section className="card">
          <StatusBadge decision={report.recommendation} />
          <h3 style={{ marginTop: 12 }}>Panel recommendation</h3>
          <p>{report.recommendation}</p>
          <div className="recommendation-link">Read the investor verdicts <ChevronRight size={15} aria-hidden="true" /></div>
        </section>
        <section className="card">
          <h3>Valuation range</h3>
          <p style={{ fontSize: 24, color: "var(--text)", fontWeight: 850 }}>
            {report.valuation.range}
          </p>
          <p>{report.valuation.framing}</p>
          <div className="callout" style={{ marginTop: 12 }}>
            Confidence: {report.valuation.confidence}
          </div>
          <ul className="list" style={{ marginTop: 12 }}>
            {report.valuation.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h3>Next milestones</h3>
          <ul className="list">
            {report.nextMilestones.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section className="card">
          <h3>Timeline feedback</h3>
          <div className="grid">
            {report.timeline.map((moment) => (
              <div key={`${moment.timestamp}-${moment.signal}`}>
                <strong>{moment.timestamp} - {moment.signal}</strong>
                <p>{moment.feedback}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <p className="meta">
            <CalendarClock size={15} aria-hidden="true" />
            {new Date(report.generatedAt).toLocaleString()}
          </p>
          <ReportActions reportId={report.id} />
        </section>
      </aside>
    </div>
  );
}
