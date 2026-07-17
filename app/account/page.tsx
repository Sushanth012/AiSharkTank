import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, LogOut, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { isAdminUserId } from "@/lib/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/auth");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: entitlement } = await supabase
    .from("entitlement_summary")
    .select("premium_credits,free_pitch_available")
    .eq("user_id", user.id)
    .maybeSingle();
  const isAdmin = isAdminUserId(user.id);

  return (
    <AppShell variant="workspace">
      <section className="account-layout">
        <div>
          <p className="eyebrow">Founder account</p>
          <h1>Your room key.</h1>
          <p>See who is signed in, check your pitch balance, or safely leave this device.</p>
        </div>

        <div className="account-grid">
          <article className="card account-card">
            <span className="sidebar-label">Signed in as</span>
            <h2>{user.email}</h2>
            <div className="account-balance">
              <strong>{entitlement?.premium_credits ?? 0}</strong>
              <span>Premium pitches available</span>
            </div>
            <p>{entitlement?.free_pitch_available ? "Your free rehearsal is still available." : "Your free rehearsal has been used."}</p>
            <Link className="button primary full" href="/dashboard">Open workspace <ArrowRight size={17} aria-hidden="true" /></Link>
          </article>

          <aside className="card account-card account-actions">
            <span className="sidebar-label">Account controls</span>
            {isAdmin ? (
              <Link className="button secondary full" href="/admin">
                <ShieldCheck size={17} aria-hidden="true" /> Admin panel
              </Link>
            ) : null}
            <form action="/auth/signout" method="post">
              <button className="button secondary full" type="submit">
                <LogOut size={17} aria-hidden="true" /> Sign out
              </button>
            </form>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
