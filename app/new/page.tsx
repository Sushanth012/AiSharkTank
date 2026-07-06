import { AppShell } from "@/components/AppShell";
import { PitchSubmissionForm } from "@/components/PitchSubmissionForm";
import { MAX_DECK_BYTES, MAX_VIDEO_BYTES, formatBytes } from "@/lib/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function NewPitchPage() {
  const supabase = await createSupabaseServerClient();

  if (supabase) {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/auth");
    }
  }

  return (
    <AppShell>
      <div className="section-title">
        <div>
          <p className="eyebrow">New pitch review</p>
          <h1>Upload your pitch and deck</h1>
          <p>
            Keep the video under five minutes. The MVP accepts MP4, MOV, or WebM video and
            PDF or PPTX decks.
          </p>
        </div>
      </div>
      <div className="form-shell">
        <PitchSubmissionForm />
        <aside className="grid">
          <section className="card">
            <h3>Upload limits</h3>
            <p>Video: {formatBytes(MAX_VIDEO_BYTES)} max</p>
            <p>Deck: {formatBytes(MAX_DECK_BYTES)} max</p>
          </section>
          <section className="card">
            <h3>What the panel reviews</h3>
            <ul className="list">
              <li>Problem clarity and customer urgency</li>
              <li>Market, competition, business model, and moat</li>
              <li>Traction, funding ask, and next milestones</li>
              <li>Founder delivery signals from the pitch transcript</li>
            </ul>
          </section>
          <section className="callout">
            Valuation ranges are framed as practice estimates with confidence and assumptions,
            not formal financial advice.
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
