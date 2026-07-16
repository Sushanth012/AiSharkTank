import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ActivePitchRefresh } from "@/components/ActivePitchRefresh";
import { StatusBadge } from "@/components/StatusBadge";
import { demoSubmissions } from "@/lib/demo-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DashboardSubmission } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  let submissions: DashboardSubmission[] = demoSubmissions;
  let demoMode = true;
  let premiumCredits = 0;

  if (supabase) {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/auth");
    }

    demoMode = false;
    const [submissionResult, entitlementResult] = await Promise.all([
      supabase
        .from("submissions")
        .select("id,startup_name,created_at,status,reports(id,content)")
        .eq("user_id", user.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("entitlement_summary")
        .select("premium_credits")
        .eq("user_id", user.id)
        .maybeSingle()
    ]);

    if (submissionResult.error) throw submissionResult.error;
    if (entitlementResult.error) throw entitlementResult.error;

    const data = submissionResult.data;
    premiumCredits = entitlementResult.data?.premium_credits ?? 0;

    submissions =
      data?.map((item) => {
        const report = Array.isArray(item.reports) ? item.reports[0] : item.reports;
        const content = report?.content as { overallScore?: number; recommendation?: string } | undefined;
        return {
          id: item.id,
          startupName: item.startup_name,
          createdAt: item.created_at,
          status: item.status,
          reportId: report?.id,
          overallScore: content?.overallScore,
          recommendation: content?.recommendation as DashboardSubmission["recommendation"]
        };
      }) ?? [];
  }

  return (
    <AppShell variant="workspace">
      <ActivePitchRefresh active={submissions.some((item) => item.status === "queued" || item.status === "processing")} />
      <div className="workspace-head">
        <div>
          <p className="eyebrow">Founder workspace</p>
          <h1>Build the pitch they remember.</h1>
        </div>
        <div className="workspace-stats">
          <div><strong>{submissions.length}</strong><span>Total pitches</span></div>
          <div><strong>{submissions.filter((item) => item.status === "complete").length}</strong><span>Reports ready</span></div>
          <div><strong>{premiumCredits}</strong><span>Premium pitches</span></div>
          <div><strong>{submissions[0]?.overallScore ?? "N/A"}</strong><span>Latest score</span></div>
        </div>
      </div>
      <div className="dashboard-layout">
        <aside className="sidebar panel">
          <span className="sidebar-label">Your next rep</span>
          <h2>Ready to go again?</h2>
          <p>Each run should answer the panel’s last hard question better.</p>
          <Link className="button primary full" href="/new">
            <Plus size={18} aria-hidden="true" />
            New pitch
          </Link>
          {demoMode ? (
            <div className="callout" style={{ marginTop: 14 }}>
              Demo mode is active. Add Supabase keys to require accounts and save real reports.
            </div>
          ) : null}
        </aside>

        <section>
          <div className="section-title">
            <div>
              <p className="eyebrow">Pitch history</p>
              <h2>Your room recordings</h2>
              <p>Revisit the feedback, track the story, and prepare your next version.</p>
            </div>
          </div>

          <div className="submission-list">
            {submissions.length > 0 ? (
              submissions.map((submission) => (
                <article className="card submission-card" key={submission.id}>
                  <div>
                    <h3>{submission.startupName}</h3>
                    <div className="meta">
                      <span>{new Date(submission.createdAt).toLocaleDateString()}</span>
                      <StatusBadge status={submission.status} />
                      {submission.recommendation ? (
                        <StatusBadge decision={submission.recommendation} />
                      ) : null}
                      {submission.overallScore ? <span>Score {submission.overallScore}</span> : null}
                    </div>
                  </div>
                  {submission.reportId ? (
                    <Link className="button secondary" href={`/reports/${submission.reportId}`}>
                      Open report
                      <ArrowRight size={17} aria-hidden="true" />
                    </Link>
                  ) : (
                    <span className={`status-note ${submission.status === "failed" ? "failed" : ""}`}>
                      {submission.status === "failed" ? "This run needs another try" : "The panel is reviewing this pitch"}
                    </span>
                  )}
                </article>
              ))
            ) : (
              <div className="card">
                <h3>No pitches yet</h3>
                <p>Start with a two-minute pitch video. A deck is optional. Three minutes and 24 MB maximum.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
