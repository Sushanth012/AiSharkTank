import { CalendarClock } from "lucide-react";
import type { PitchReport } from "@/lib/types";
import { StatusBadge } from "@/components/StatusBadge";
import { ReportActions } from "@/components/ReportActions";

export function ReportView({ report }: { report: PitchReport }) {
  return (
    <div className="report-layout">
      <div className="grid">
        <section className="panel form-card">
          <div className="section-title">
            <div>
              <p className="eyebrow">Investment report</p>
              <h1>{report.startupName}</h1>
              <p>{report.executiveSummary}</p>
            </div>
          </div>
          <div className="grid three">
            <div className="card">
              <h3>{report.overallScore}</h3>
              <p>Overall score</p>
            </div>
            <div className="card">
              <h3>{report.businessScore}</h3>
              <p>Business score</p>
            </div>
            <div className="card">
              <h3>{report.deliveryScore}</h3>
              <p>Delivery score</p>
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

        <section className="card">
          <h3>Investor panel</h3>
          <div className="grid">
            {report.investorPanel.map((investor) => (
              <article className="investor" key={investor.name}>
                <div className="investor-head">
                  <div>
                    <strong>{investor.name}</strong>
                    <p>{investor.focus}</p>
                  </div>
                  <StatusBadge decision={investor.decision} />
                </div>
                <p>{investor.thesis}</p>
                <ul className="list">
                  {investor.questions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="card">
          <h3>Final investment memo</h3>
          <p>{report.finalMemo}</p>
        </section>
      </div>

      <aside className="grid">
        <section className="card">
          <StatusBadge decision={report.recommendation} />
          <h3 style={{ marginTop: 12 }}>Panel recommendation</h3>
          <p>{report.recommendation}</p>
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
