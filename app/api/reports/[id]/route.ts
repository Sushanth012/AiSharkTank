import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ ok: true, demo: true });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in before deleting reports." }, { status: 401 });
  }

  const { data: report } = await supabase
    .from("reports")
    .select("submission_id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }

  const { data: submission } = await supabase
    .from("submissions")
    .select("video_path,deck_path")
    .eq("id", report.submission_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("reports")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (submission?.video_path) {
    await supabase.storage.from("pitch-videos").remove([submission.video_path]);
  }

  if (submission?.deck_path) {
    await supabase.storage.from("pitch-decks").remove([submission.deck_path]);
  }

  await supabase
    .from("submissions")
    .delete()
    .eq("id", report.submission_id)
    .eq("user_id", user.id);

  return NextResponse.json({ ok: true });
}
