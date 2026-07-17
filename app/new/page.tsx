import { AppShell } from "@/components/AppShell";
import { PitchSubmissionForm } from "@/components/PitchSubmissionForm";
import { MAX_DECK_BYTES, MAX_VIDEO_BYTES, formatBytes } from "@/lib/config";
import { premiumEnabled } from "@/lib/config";
import type { EntitlementSummary } from "@/lib/billing/entitlements";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function NewPitchPage() {
  const supabase = await createSupabaseServerClient();
  let entitlements: EntitlementSummary = {
    freePitchAvailable: true,
    premiumCredits: 0,
    creditDebt: 0
  };

  if (supabase) {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/auth");
    }

    const { data: summary, error: summaryError } = await supabase
      .from("entitlement_summary")
      .select("free_pitch_available,premium_credits,credit_debt")
      .eq("user_id", user.id)
      .maybeSingle();

    if (summaryError) throw summaryError;

    if (summary) {
      entitlements = {
        freePitchAvailable: summary.free_pitch_available,
        premiumCredits: summary.premium_credits,
        creditDebt: summary.credit_debt
      };
    }
  }

  return (
    <AppShell variant="workspace">
      <div className="pitch-form-heading">
        <div>
          <p className="eyebrow">New rehearsal</p>
          <h1>Give the panel<br />something to challenge.</h1>
          <p>
            Tell us enough to understand the business, then upload the pitch exactly as you would deliver it.
          </p>
        </div>
        <p className="pitch-flow-note">Context + materials in one pass. The panel report follows.</p>
      </div>
      <div className="form-shell">
        <PitchSubmissionForm entitlements={entitlements} premiumEnabled={premiumEnabled} />
        <aside className="grid">
          <section className="card">
            <span className="aside-label">Room rules</span>
            <h3>Keep it sharp</h3>
            <p>Video: {formatBytes(MAX_VIDEO_BYTES)} max</p>
            <p>Deck: optional, {formatBytes(MAX_DECK_BYTES)} max</p>
          </section>
          <section className="card">
            <span className="aside-label">On the scorecard</span>
            <h3>Every review checks</h3>
            <ul className="list">
              <li>Problem clarity and customer urgency</li>
              <li>Founder fit and evidence people want it</li>
              <li>A clear, believable story in the video</li>
              <li>The biggest reason a reviewer may say no</li>
            </ul>
          </section>
          <section className="callout">
            PitchTank gives practice feedback, not an investment decision or a prediction from YC.
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
