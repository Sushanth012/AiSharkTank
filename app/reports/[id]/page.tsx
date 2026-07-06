import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { ReportView } from "@/components/ReportView";
import { demoReport } from "@/lib/demo-data";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PitchReport } from "@/lib/types";

export default async function ReportPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  let report: PitchReport | null = id === "demo-report" ? demoReport : null;

  if (supabase) {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/auth");
    }

    const { data } = await supabase
      .from("reports")
      .select("content")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    report = data?.content as PitchReport | null;
  }

  if (!report) {
    notFound();
  }

  return (
    <AppShell>
      <ReportView report={report} />
    </AppShell>
  );
}
