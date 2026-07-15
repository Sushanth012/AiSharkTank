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

  const { data, error } = await supabase.rpc("delete_pitch_report", { p_report_id: id });
  if (error) {
    const status = error.message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  const artifact = Array.isArray(data) ? data[0] : data;
  const cleanupErrors: string[] = [];
  if (artifact?.video_path) {
    const { error: videoError } = await supabase.storage
      .from("pitch-videos")
      .remove([artifact.video_path]);
    if (videoError) cleanupErrors.push("video");
  }
  if (artifact?.deck_path) {
    const { error: deckError } = await supabase.storage
      .from("pitch-decks")
      .remove([artifact.deck_path]);
    if (deckError) cleanupErrors.push("deck");
  }

  return NextResponse.json({
    ok: true,
    ...(cleanupErrors.length > 0 ? { cleanupWarning: `Could not remove ${cleanupErrors.join(" and ")} artifact.` } : {})
  });
}
