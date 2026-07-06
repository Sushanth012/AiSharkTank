import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MAX_DECK_BYTES,
  MAX_VIDEO_BYTES,
  acceptedDeckTypes,
  acceptedVideoTypes
} from "@/lib/config";
import { generateInvestmentReport } from "@/lib/report-generator";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StartupProfile } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const profileSchema = z.object({
  startupName: z.string().min(1),
  founderName: z.string().min(1),
  industry: z.string().min(1),
  stage: z.string().min(1),
  description: z.string().min(1),
  targetCustomer: z.string().min(1),
  businessModel: z.string().min(1),
  traction: z.string().optional().default(""),
  fundingGoal: z.string().optional().default(""),
  demoLink: z.string().optional().default(""),
  deckNotes: z.string().optional().default("")
});

const directSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  videoPath: z.string().min(1),
  deckPath: z.string().min(1),
  profile: profileSchema,
  transcript: z.string().optional().default("")
});

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return createDirectSubmission(request);
  }

  const formData = await request.formData();
  const video = formData.get("video");
  const deck = formData.get("deck");
  const transcript = stringFromForm(formData, "transcript");

  if (!(video instanceof File) || video.size === 0) {
    return NextResponse.json({ error: "Pitch video is required." }, { status: 400 });
  }

  if (!(deck instanceof File) || deck.size === 0) {
    return NextResponse.json({ error: "Pitch deck is required." }, { status: 400 });
  }

  if (video.size > MAX_VIDEO_BYTES) {
    return NextResponse.json({ error: "Pitch video exceeds the 250 MB limit." }, { status: 400 });
  }

  if (deck.size > MAX_DECK_BYTES) {
    return NextResponse.json({ error: "Pitch deck exceeds the 50 MB limit." }, { status: 400 });
  }

  if (video.type && !acceptedVideoTypes.includes(video.type)) {
    return NextResponse.json({ error: "Unsupported video type." }, { status: 400 });
  }

  if (deck.type && !acceptedDeckTypes.includes(deck.type)) {
    return NextResponse.json({ error: "Unsupported deck type." }, { status: 400 });
  }

  const parsedProfile = profileSchema.safeParse({
    startupName: stringFromForm(formData, "startupName"),
    founderName: stringFromForm(formData, "founderName"),
    industry: stringFromForm(formData, "industry"),
    stage: stringFromForm(formData, "stage"),
    description: stringFromForm(formData, "description"),
    targetCustomer: stringFromForm(formData, "targetCustomer"),
    businessModel: stringFromForm(formData, "businessModel"),
    traction: stringFromForm(formData, "traction"),
    fundingGoal: stringFromForm(formData, "fundingGoal"),
    demoLink: stringFromForm(formData, "demoLink"),
    deckNotes: stringFromForm(formData, "deckNotes")
  });

  if (!parsedProfile.success) {
    return NextResponse.json({ error: "Missing required startup details." }, { status: 400 });
  }

  const profile = parsedProfile.data satisfies StartupProfile;
  const report = await generateInvestmentReport({
    profile,
    transcript,
    deckText: profile.deckNotes
  });

  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ reportId: "demo-report", demo: true });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in before submitting a pitch." }, { status: 401 });
  }

  const submissionId = crypto.randomUUID();
  const videoPath = `${user.id}/${submissionId}/${safeFileName(video.name)}`;
  const deckPath = `${user.id}/${submissionId}/${safeFileName(deck.name)}`;

  const [videoUpload, deckUpload] = await Promise.all([
    supabase.storage.from("pitch-videos").upload(videoPath, video, {
      contentType: video.type || "application/octet-stream",
      upsert: false
    }),
    supabase.storage.from("pitch-decks").upload(deckPath, deck, {
      contentType: deck.type || "application/octet-stream",
      upsert: false
    })
  ]);

  if (videoUpload.error || deckUpload.error) {
    return NextResponse.json(
      { error: videoUpload.error?.message ?? deckUpload.error?.message ?? "Upload failed." },
      { status: 500 }
    );
  }

  const reportId = await saveSubmissionAndReport({
    supabase,
    userId: user.id,
    submissionId,
    videoPath,
    deckPath,
    profile,
    report
  });

  if (reportId instanceof NextResponse) {
    return reportId;
  }

  return NextResponse.json({ reportId });
}

async function createDirectSubmission(request: Request) {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return NextResponse.json({ reportId: "demo-report", demo: true });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in before submitting a pitch." }, { status: 401 });
  }

  const parsed = directSubmissionSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid submission metadata." }, { status: 400 });
  }

  const { submissionId, videoPath, deckPath, profile, transcript } = parsed.data;

  if (!videoPath.startsWith(`${user.id}/`) || !deckPath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Upload paths do not belong to this user." }, { status: 403 });
  }

  const report = await generateInvestmentReport({
    profile,
    transcript,
    deckText: profile.deckNotes
  });

  const reportId = await saveSubmissionAndReport({
    supabase,
    userId: user.id,
    submissionId,
    videoPath,
    deckPath,
    profile,
    report
  });

  if (reportId instanceof NextResponse) {
    return reportId;
  }

  return NextResponse.json({ reportId });
}

async function saveSubmissionAndReport({
  supabase,
  userId,
  submissionId,
  videoPath,
  deckPath,
  profile,
  report
}: {
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
  userId: string;
  submissionId: string;
  videoPath: string;
  deckPath: string;
  profile: StartupProfile;
  report: Awaited<ReturnType<typeof generateInvestmentReport>>;
}) {
  const { error: submissionError } = await supabase.from("submissions").insert({
    id: submissionId,
    user_id: userId,
    startup_name: profile.startupName,
    founder_name: profile.founderName,
    status: "complete",
    video_path: videoPath,
    deck_path: deckPath,
    profile
  });

  if (submissionError) {
    return NextResponse.json({ error: submissionError.message }, { status: 500 });
  }

  const reportId = crypto.randomUUID();
  const { error: reportError } = await supabase.from("reports").insert({
    id: reportId,
    user_id: userId,
    submission_id: submissionId,
    content: { ...report, id: reportId },
    recommendation: report.recommendation,
    overall_score: report.overallScore
  });

  if (reportError) {
    return NextResponse.json({ error: reportError.message }, { status: 500 });
  }

  return reportId;
}

function stringFromForm(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeFileName(fileName: string) {
  const cleaned = fileName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return `${Date.now()}-${cleaned || "upload"}`;
}
