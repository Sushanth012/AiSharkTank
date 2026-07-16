import Link from "next/link";
import { ArrowRight, Check, FileVideo, Play, ScanSearch, Sparkles } from "lucide-react";
import { AppShell } from "@/components/AppShell";

const questions = ["Why now?", "What changes at scale?", "Who pays first?", "Why do you win?", "What breaks the model?", "How do you get to market?"];

export default function HomePage() {
  return (
    <AppShell>
      <section className="pressure-hero">
        <div className="hero-copy-block">
          <p className="signal-label"><span /> Private founder rehearsal</p>
          <h1>Pitch it here before you <mark>pitch it there.</mark></h1>
          <p className="hero-lede">Five AI investor lenses challenge your story, numbers, and delivery. You leave with the questions to answer next.</p>
          <div className="hero-actions">
            <Link className="button primary button-lg" href="/auth">Run my free pitch <ArrowRight size={18} aria-hidden="true" /></Link>
            <Link className="button text-button" href="/reports/demo-report"><Play size={16} aria-hidden="true" /> Read a real report</Link>
          </div>
        </div>
        <div className="live-room" aria-label="Live AI investor panel preview">
          <div className="room-toolbar"><span><i /> Room 01 / live rehearsal</span><time>02:41</time></div>
          <div className="transcript-window">
            <p className="transcript-muted">“Campus shopping is fragmented...”</p>
            <p>“We have 1,200 students on the waitlist and three campus pilots ready.”</p>
            <span className="margin-note">PROVE THIS</span>
            <div className="waveform" aria-hidden="true">{Array.from({ length: 38 }, (_, index) => <i key={index} />)}</div>
          </div>
          <div className="seat-rail">
            {[["VC", "Market", 84], ["OP", "Ops", 79], ["$", "Finance", 86], ["CX", "Customer", 82], ["FO", "Founder", 81]].map(([initials, label, score], index) => (
              <div className="panel-seat" style={{ "--seat-index": index } as React.CSSProperties} key={String(label)}><span>{initials}</span><small>{label}</small><strong>{score}</strong></div>
            ))}
          </div>
          <div className="verdict-bar"><span>Panel verdict</span><strong>INVEST WITH CONDITIONS</strong><b>82</b></div>
        </div>
        <aside className="hero-rail" aria-label="Product summary"><span>05 lenses</span><span>06 dimensions</span><span>01 next move</span></aside>
      </section>

      <div className="question-ticker" aria-label="Questions the panel can ask"><div>{[...questions, ...questions].map((question, index) => <span key={`${question}-${index}`}>{question}<b>↗</b></span>)}</div></div>

      <section className="manifesto-section">
        <p className="section-number">01 / THE PROBLEM</p>
        <h2>The first hard question should not happen in the first real meeting.</h2>
        <p>Most founders practice the words. PitchTank pressure-tests the logic behind them, in private, while there is still time to rewrite.</p>
      </section>

      <section className="story-sequence" id="how-it-works">
        <article className="story-panel story-upload">
          <div className="story-copy"><span>01</span><h2>Bring the rough cut.</h2><p>Upload a two-minute pitch video. Add a deck only if it helps. Three minutes and 24 MB maximum. No studio polish required.</p></div>
          <div className="upload-specimen"><FileVideo aria-hidden="true" /><div><strong>pitch-v7.mp4</strong><span>Deck attached / ready for panel</span></div><b>100%</b></div>
        </article>
        <article className="story-panel story-pressure">
          <div className="story-copy"><span>02</span><h2>Feel the pressure.</h2><p>Market, finance, operator, customer, and founder lenses test different parts of the case.</p></div>
          <div className="question-specimen"><ScanSearch aria-hidden="true" /><p>“Your waitlist is interesting. What proves willingness to pay?”</p><span>FINANCE LENS / 03:12</span></div>
        </article>
        <article className="story-panel story-rewrite">
          <div className="story-copy"><span>03</span><h2>Rewrite with a reason.</h2><p>Get a scorecard, hard questions, valuation framing, and a practical next-move list.</p></div>
          <div className="score-specimen"><div><span>Story clarity</span><strong>84</strong></div><i><b style={{ width: "84%" }} /></i><div><span>Business model</span><strong>72</strong></div><i><b style={{ width: "72%" }} /></i><Link href="/reports/demo-report">Open the sample memo <ArrowRight size={16} /></Link></div>
        </article>
      </section>

      <section className="human-proof">
        <div className="proof-stamp"><Sparkles aria-hidden="true" /><span>PRIVATE<br />REHEARSAL</span></div>
        <blockquote>“The useful part was not the score. It was finally knowing which claim would fall apart under one follow-up.”</blockquote>
        <p>Built for the messy version before the polished version.</p>
      </section>

      <section className="closing-cta">
        <div><p className="signal-label"><span /> Your next meeting starts here</p><h2>Make the mistakes <mark>in private.</mark></h2></div>
        <div className="closing-action"><p>Your first complete pitch review is free. No card and no sales call.</p><Link className="button primary button-lg" href="/auth">Enter the pressure room <ArrowRight size={18} /></Link><span><Check size={15} /> Five investor perspectives included</span></div>
      </section>
    </AppShell>
  );
}
