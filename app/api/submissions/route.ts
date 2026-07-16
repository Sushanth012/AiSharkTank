import { NextResponse } from "next/server";
import { z } from "zod";
import {
  MAX_DECK_BYTES,
  MAX_VIDEO_BYTES,
  acceptedDeckTypes,
  acceptedVideoTypes,
  isSupabaseConfigured,
  premiumEnabled
} from "@/lib/config";
import { generateInvestmentReport } from "@/lib/report-generator";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { StartupProfile } from "@/lib/types";
import { schedulePitchWorker } from "@/lib/jobs/schedule-pitch-worker";

export const runtime = "nodejs";
export const maxDuration = 300;

const requiredShortText = z.string().trim().min(1).max(200);
const optionalShortText = z.string().trim().max(500).optional().default("");
const profileSchema = z
  .object({
    startupName: requiredShortText,
    founderName: requiredShortText,
    industry: requiredShortText,
    stage: requiredShortText,
    description: z.string().trim().min(1).max(4_000),
    targetCustomer: z.string().trim().min(1).max(2_000),
    businessModel: z.string().trim().min(1).max(2_000),
    traction: optionalShortText,
    fundingGoal: optionalShortText,
    demoLink: z.string().trim().max(2_000).optional().default(""),
    deckNotes: z.string().trim().max(8_000).optional().default("")
  })
  .refine((profile) => JSON.stringify(profile).length <= 20_000, {
    message: "Startup profile is too large."
  });

const directSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  videoPath: z.string().min(1),
  deckPath: z.string().min(1),
  profile: profileSchema,
  tier: z.enum(["basic", "premium"]).optional().default("basic")
});

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return createDirectSubmission(request);
  }

  if (isSupabaseConfigured) {
    return NextResponse.json(
      { error: "Authenticated uploads must use the secure direct-upload flow." },
      { status: 415 }
    );
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
    return NextResponse.json({ error: "Pitch video exceeds the 24 MB processing limit." }, { status: 400 });
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

  return NextResponse.json({ reportId: report.id, demo: true });
}

async function createDirectSubmission(request: Request) {
  const supabase = await createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  if (!supabase) {
    return NextResponse.json({ reportId: "demo-report", demo: true });
  }
  if (!admin) {
    return NextResponse.json({ error: "Secure pitch processing is not configured." }, { status: 503 });
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

  const { submissionId, videoPath, deckPath, profile, tier } = parsed.data;

  if (tier === "premium" && !premiumEnabled) {
    return NextResponse.json({ error: "Premium processing is not enabled yet." }, { status: 403 });
  }

  if (!videoPath.startsWith(`${user.id}/`) || !deckPath.startsWith(`${user.id}/`)) {
    return NextResponse.json({ error: "Upload paths do not belong to this user." }, { status: 403 });
  }

  const [videoExists, deckExists] = await Promise.all([
    verifyStoredObject(supabase, "pitch-videos", videoPath, MAX_VIDEO_BYTES, acceptedVideoTypes),
    verifyStoredObject(supabase, "pitch-decks", deckPath, MAX_DECK_BYTES, acceptedDeckTypes)
  ]);
  if (!videoExists || !deckExists) {
    return NextResponse.json({ error: "Uploaded pitch files could not be verified." }, { status: 400 });
  }

  const { error: submissionError } = await supabase.from("submissions").insert({
    id: submissionId,
    user_id: user.id,
    startup_name: profile.startupName,
    founder_name: profile.founderName,
    status: "queued",
    pitch_tier: tier,
    video_path: videoPath,
    deck_path: deckPath,
    profile
  });

  if (submissionError) {
    return NextResponse.json({ error: submissionError.message }, { status: 500 });
  }

  const jobId = crypto.randomUUID();
  const { data: queuedJobId, error: enqueueError } = await supabase.rpc("enqueue_pitch_job", {
    p_submission_id: submissionId,
    p_tier: tier,
    p_job_id: jobId
  });
  if (enqueueError || !queuedJobId) {
    await supabase.from("submissions").delete().eq("id", submissionId);
    const entitlementError = enqueueError?.message.includes("premium credits") ||
      enqueueError?.message.includes("credit debt");
    return NextResponse.json(
      { error: enqueueError?.message ?? "Pitch processing could not be started." },
      { status: entitlementError ? 402 : 500 }
    );
  }

  schedulePitchWorker();

  return NextResponse.json({ jobId: queuedJobId, submissionId, status: "queued" }, { status: 202 });
}

function stringFromForm(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function verifyStoredObject(
  supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>,
  bucket: string,
  path: string,
  maxBytes: number,
  acceptedTypes: string[]
) {
  const parts = path.split("/");
  const fileName = parts.pop();
  if (!fileName || parts.length < 2) return false;

  const { data, error } = await supabase.storage
    .from(bucket)
    .list(parts.join("/"), { limit: 10, search: fileName });
  if (error) return false;

  const object = data.find((item) => item.name === fileName);
  if (!object) return false;
  const metadata = object.metadata as { size?: number; mimetype?: string } | null;
  const size = Number(metadata?.size ?? 0);
  const mimetype = metadata?.mimetype;
  return size > 0 && size <= maxBytes && (!mimetype || acceptedTypes.includes(mimetype));
}
