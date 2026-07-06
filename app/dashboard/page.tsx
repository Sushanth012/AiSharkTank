import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { demoSubmissions } from "@/lib/demo-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DashboardSubmission } from "@/lib/types";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  let submissions: DashboardSubmission[] = demoSubmissions;
  let demoMode = true;

  if (supabase) {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/auth");
    }

    demoMode = false;
    const { data } = await supabase
      .from("submissions")
      .select("id,startup_name,created_at,status,reports(id,content)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

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
    <AppShell>
      <div className="dashboard-layout">
        <aside className="sidebar panel">
          <h2>Founder workspace</h2>
          <p>Review saved pitches, open completed reports, or start a new investor simulation.</p>
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
              <p className="eyebrow">Reports</p>
              <h1>Your pitch reviews</h1>
              <p>Every report is attached to your account and can be revisited or deleted.</p>
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
                    <span className="badge processing">Processing</span>
                  )}
                </article>
              ))
            ) : (
              <div className="card">
                <h3>No pitches yet</h3>
                <p>Start with a five-minute pitch video and your current deck.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
