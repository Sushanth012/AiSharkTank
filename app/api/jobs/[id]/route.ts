import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ error: "Pitch processing is not configured." }, { status: 503 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in to check this pitch." }, { status: 401 });
  }

  const { data: job, error: jobError } = await supabase
    .from("pitch_jobs")
    .select("id,submission_id,status,error_code")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (jobError) {
    return NextResponse.json({ error: "Pitch status is temporarily unavailable." }, { status: 503 });
  }
  if (!job) {
    return NextResponse.json({ error: "Pitch job not found." }, { status: 404 });
  }

  let reportId: string | undefined;
  if (job.status === "complete") {
    const { data: report } = await supabase
      .from("reports")
      .select("id")
      .eq("submission_id", job.submission_id)
      .eq("user_id", user.id)
      .maybeSingle();
    reportId = report?.id;
  }

  const terminalFailure = job.status === "failed" || job.status === "dead_letter";
  return NextResponse.json(
    {
      jobId: job.id,
      submissionId: job.submission_id,
      status: job.status,
      ...(reportId ? { reportId } : {}),
      ...(terminalFailure
        ? { error: "The panel could not finish this pitch. Your credit was returned." }
        : {})
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
