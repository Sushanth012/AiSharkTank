import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { CheckoutButton } from "@/components/BillingButtons";
import { billingOffers } from "@/lib/billing/catalog";
import { billingEnabled } from "@/lib/config";
import { Check, CircleGauge, Sparkles, Zap } from "lucide-react";

export default function PricingPage() {
  return (
    <AppShell>
      <div className="section-title pricing-heading">
        <div>
          <p className="eyebrow">No equity required</p>
          <h1>Practice is cheap.<br />A bad first meeting isn’t.</h1>
          <p>Start with one complete review, then buy only the pitch-room time you actually need.</p>
        </div>
        <div className="pricing-promise"><Sparkles size={18} aria-hidden="true" /><span>Every premium review includes all five investor lenses.</span></div>
      </div>

      <section className="pricing-grid" aria-label="PitchTank pricing">
        <article className="card pricing-card free-card">
          <div className="price-icon"><CircleGauge aria-hidden="true" /></div>
          <p className="price-label">First rehearsal</p>
          <h2>$0 <span>once</span></h2>
          <p>Bring your rough draft. Get a complete baseline before spending anything.</p>
          <ul className="list price-list">
            <li>One complete pitch review</li>
            <li>Scorecard, risks, and milestones</li>
            <li>No payment method</li>
          </ul>
          <Link className="button secondary full" href="/auth">Start free</Link>
        </article>

        {Object.values(billingOffers).map((offer) => (
          <article className={`card pricing-card ${offer.id === "builder" ? "featured-price" : ""}`} key={offer.id}>
            {offer.id === "builder" ? <span className="popular-flag">Best for active founders</span> : null}
            <div className="price-icon">{offer.id === "builder" ? <Zap aria-hidden="true" /> : <Sparkles aria-hidden="true" />}</div>
            <p className="price-label">{offer.name}</p>
            <h2>{offer.displayPrice} <span>{offer.mode === "payment" ? "one-time" : ""}</span></h2>
            <p>{offer.description}</p>
            <ul className="list price-list">
              <li>{offer.credits} premium reviews</li>
              <li>All five investor perspectives</li>
              <li>Deep synthesis and hard questions</li>
            </ul>
            <CheckoutButton disabled={!billingEnabled} offerId={offer.id} />
          </article>
        ))}
      </section>

      <section className="pricing-note">
        <Check size={18} aria-hidden="true" />
        <p><strong>Built for honest usage.</strong> Credits keep compute predictable, pricing low, and the product sustainable without pretending “unlimited” is real.</p>
      </section>
    </AppShell>
  );
}
