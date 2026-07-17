import { AppShell } from "@/components/AppShell";
import { AuthForm } from "@/components/AuthForm";
import { Check, MessageSquareQuote } from "lucide-react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AuthPage() {
  const supabase = await createSupabaseServerClient();
  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) redirect("/account");
  }

  return (
    <AppShell>
      <section className="auth-layout">
        <div className="auth-story">
          <p className="eyebrow"><MessageSquareQuote size={13} aria-hidden="true" /> The room is yours</p>
          <h1>Rehearse without the audience.</h1>
          <p>Build a private history of your pitches, see the score move, and walk into the real meeting with answers.</p>
          <ul>
            <li><Check size={16} aria-hidden="true" /> One free complete review</li>
            <li><Check size={16} aria-hidden="true" /> Reports stay in your workspace</li>
            <li><Check size={16} aria-hidden="true" /> Delete your work whenever you want</li>
          </ul>
          <blockquote>A hard question in private is useful. The same question in the meeting is expensive.<span>THE PRESSURE ROOM</span></blockquote>
        </div>
        <div className="auth-card panel">
          <div className="section-title" style={{ display: "block" }}>
            <p className="eyebrow">Founder access</p>
            <h1>Enter your workspace</h1>
            <p>Create an account or pick up where you left off.</p>
          </div>
          <AuthForm />
        </div>
      </section>
    </AppShell>
  );
}
