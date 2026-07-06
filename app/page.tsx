import Link from "next/link";
import { ArrowRight, FileVideo, MessageSquareQuote, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";

export default function HomePage() {
  return (
    <AppShell>
      <section className="hero-workspace">
        <div className="hero-main">
          <p className="eyebrow">Founder pitch practice workspace</p>
          <h1 className="hero-title">Get investor-grade feedback before the room is real.</h1>
          <p className="hero-copy">
            Upload a short pitch, attach your deck, and receive a saved AI investor panel report
            with scores, hard questions, valuation framing, and next milestones.
          </p>
          <div className="hero-actions">
            <Link className="button primary" href="/auth">
              Create account
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link className="button secondary" href="/dashboard">
              View workspace
            </Link>
          </div>
        </div>

        <aside className="hero-panel panel" aria-label="Report preview">
          <div className="report-preview">
            <div className="preview-header">
              <div>
                <p className="eyebrow" style={{ margin: "0 0 8px" }}>
                  Live report
                </p>
                <h2 className="preview-title">CampusCart</h2>
              </div>
              <span className="badge conditions">Invest with Conditions</span>
            </div>
            <div className="preview-body">
              <div className="score-ring">82</div>
              <div className="mini-grid">
                <div className="mini-stat">
                  <span>Business</span>
                  <strong>84</strong>
                </div>
                <div className="mini-stat">
                  <span>Delivery</span>
                  <strong>78</strong>
                </div>
                <div className="mini-stat">
                  <span>Valuation</span>
                  <strong>$1.5M+</strong>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </section>

      <section className="grid three" aria-label="Core workflow">
        <div className="card">
          <FileVideo size={22} aria-hidden="true" />
          <h3>Upload the pitch</h3>
          <p>Five-minute video cap, deck support, and structured startup details from day one.</p>
        </div>
        <div className="card">
          <MessageSquareQuote size={22} aria-hidden="true" />
          <h3>Face the panel</h3>
          <p>Multiple AI investors evaluate the business, delivery, risks, and follow-up questions.</p>
        </div>
        <div className="card">
          <ShieldCheck size={22} aria-hidden="true" />
          <h3>Save or delete</h3>
          <p>Reports live in the user's account and can be revisited or removed when needed.</p>
        </div>
      </section>
    </AppShell>
  );
}
