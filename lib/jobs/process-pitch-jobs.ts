import "server-only";

import { ArtifactValidationError, extractPitchArtifacts } from "@/lib/artifacts/extract";
import {
  generateInvestmentReport,
  ReportGenerationExhaustedError,
  type AiRunTelemetry
} from "@/lib/report-generator";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { shouldRetryPitchJobFailure } from "@/lib/jobs/retry-policy";
import type { StartupProfile } from "@/lib/types";

type ClaimedJob = {
  id: string;
  submission_id: string;
  claim_token: string;
};

type SubmissionRow = {
  id: string;
  user_id: string;
  profile: StartupProfile;
  video_path: string;
  deck_path: string;
  pitch_tier: "basic" | "premium";
};

export type PitchWorkerResult = {
  claimed: number;
  completed: number;
  retried: number;
  failed: number;
  reconciled: { requeued: number; deadLettered: number };
};

export async function processPitchJobs(batchSize: number): Promise<PitchWorkerResult> {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Supabase service-role access is not configured.");

  const result: PitchWorkerResult = {
    claimed: 0,
    completed: 0,
    retried: 0,
    failed: 0,
    reconciled: { requeued: 0, deadLettered: 0 }
  };

  const { data: reconciliation, error: reconciliationError } = await admin.rpc(
    "reconcile_stale_pitch_jobs",
    { p_stale_seconds: 600, p_limit: 50 }
  );
  if (reconciliationError) throw reconciliationError;
  const reconciliationRow = Array.isArray(reconciliation) ? reconciliation[0] : reconciliation;
  result.reconciled = {
    requeued: Number(reconciliationRow?.requeued ?? 0),
    deadLettered: Number(reconciliationRow?.dead_lettered ?? 0)
  };

  for (let index = 0; index < batchSize; index += 1) {
    const { data, error } = await admin.rpc("claim_pitch_job");
    if (error) throw error;
    const job = normalizeClaimedJob(data);
    if (!job) break;
    result.claimed += 1;
    let artifactsExtracted = false;

    try {
      const { data: submissionData, error: submissionError } = await admin
        .from("submissions")
        .select("id, user_id, profile, video_path, deck_path, pitch_tier")
        .eq("id", job.submission_id)
        .single();
      if (submissionError) throw submissionError;
      const submission = submissionData as SubmissionRow;

      await heartbeat(admin, job);
      await admin
        .from("submissions")
        .update({ artifact_status: "processing" })
        .eq("id", submission.id);

      const [video, deck] = await Promise.all([
        downloadArtifact(admin, "pitch-videos", submission.video_path),
        submission.deck_path
          ? downloadArtifact(admin, "pitch-decks", submission.deck_path)
          : Promise.resolve(null)
      ]);
      const extractionStartedAt = Date.now();
      const artifacts = await extractPitchArtifacts({
        video: video.bytes,
        videoMimeType: video.mimeType || mimeTypeForPath(submission.video_path),
        videoFileName: fileNameForPath(submission.video_path),
        deck: deck?.bytes,
        deckMimeType: deck
          ? deck.mimeType || mimeTypeForPath(submission.deck_path)
          : undefined
      });
      const extractionMs = Date.now() - extractionStartedAt;
      const { error: artifactUpdateError } = await admin
        .from("submissions")
        .update({
          artifact_status: "complete",
          artifact_processed_at: new Date().toISOString(),
          artifact_metrics: {
            deckCharacters: artifacts.deckCharacters,
            transcriptCharacters: artifacts.transcriptCharacters,
            extractionMs
          }
        })
        .eq("id", submission.id);
      if (artifactUpdateError) throw artifactUpdateError;
      artifactsExtracted = true;

      await heartbeat(admin, job);
      const report = await generateInvestmentReport({
        profile: submission.profile,
        transcript: artifacts.transcript,
        deckText: artifacts.deckText,
        tier: submission.pitch_tier,
        onTelemetry: (telemetry) => recordAiRun(admin, submission, job, telemetry)
      });
      await heartbeat(admin, job);

      const requestedReportId = crypto.randomUUID();
      const { data: reportId, error: completionError } = await admin.rpc("complete_claimed_pitch_job", {
        p_job_id: job.id,
        p_claim_token: job.claim_token,
        p_report_id: requestedReportId,
        p_content: { ...report, id: requestedReportId },
        p_recommendation: report.recommendation,
        p_overall_score: report.overallScore
      });
      if (completionError || !reportId) {
        throw completionError ?? new Error("Report settlement failed.");
      }
      const { error: videoCleanupError } = await admin.storage
        .from("pitch-videos")
        .remove([submission.video_path]);
      if (!videoCleanupError) {
        await admin.from("submissions").update({ video_path: "" }).eq("id", submission.id);
      }
      result.completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Pitch generation failed.";
      const validationFailure = error instanceof ArtifactValidationError;
      const reportRetriesExhausted = error instanceof ReportGenerationExhaustedError;
      if (!artifactsExtracted) {
        await admin
          .from("submissions")
          .update({ artifact_status: "failed" })
          .eq("id", job.submission_id);
      }
      const { data: status, error: failureError } = await admin.rpc("retry_or_fail_pitch_job", {
        p_job_id: job.id,
        p_claim_token: job.claim_token,
        p_error_code: validationFailure ? "artifact_invalid" : "processing_failed",
        p_error_message: message,
        p_retryable: shouldRetryPitchJobFailure({
          artifactValidationFailed: validationFailure,
          reportRetriesExhausted
        })
      });
      if (failureError) throw failureError;
      if (status === "queued") result.retried += 1;
      else result.failed += 1;
    }
  }

  return result;
}

async function recordAiRun(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  submission: SubmissionRow,
  job: ClaimedJob,
  telemetry: AiRunTelemetry
) {
  const now = new Date().toISOString();
  const { error } = await admin.from("ai_runs").insert({
    user_id: submission.user_id,
    submission_id: submission.id,
    job_id: job.id,
    route: telemetry.route,
    provider: telemetry.provider,
    model: telemetry.model,
    prompt_version: "parallel-sections-v2",
    status: telemetry.status,
    input_tokens: telemetry.inputTokens,
    cached_input_tokens: telemetry.cachedInputTokens,
    output_tokens: telemetry.outputTokens,
    estimated_cost_usd: telemetry.estimatedCostUsd,
    latency_ms: telemetry.latencyMs,
    section: telemetry.section,
    attempt_number: telemetry.attempt,
    response_characters: telemetry.responseCharacters,
    finish_reason: telemetry.finishReason ?? null,
    failure_reason: telemetry.failureReason ?? null,
    error_code: telemetry.errorCode ?? null,
    completed_at: now
  });
  if (error) throw error;
}

async function downloadArtifact(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  bucket: string,
  path: string
) {
  const { data, error } = await admin.storage.from(bucket).download(path);
  if (error || !data) throw error ?? new Error(`Could not download ${bucket} artifact.`);
  return {
    bytes: new Uint8Array(await data.arrayBuffer()),
    mimeType: data.type
  };
}

function fileNameForPath(path: string) {
  return path.split("/").pop() || "pitch-video";
}

function mimeTypeForPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return "application/pdf";
  if (extension === "pptx") {
    return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  }
  if (extension === "webm") return "video/webm";
  if (extension === "mov") return "video/quicktime";
  if (extension === "m4v") return "video/x-m4v";
  return "video/mp4";
}

function normalizeClaimedJob(value: unknown): ClaimedJob | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== "object") return null;
  const candidate = row as Partial<ClaimedJob>;
  if (!candidate.id || !candidate.submission_id || !candidate.claim_token) return null;
  return candidate as ClaimedJob;
}

async function heartbeat(
  admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>,
  job: ClaimedJob
) {
  const { data, error } = await admin.rpc("heartbeat_pitch_job", {
    p_job_id: job.id,
    p_claim_token: job.claim_token
  });
  if (error || data !== true) throw error ?? new Error("Pitch job lease was lost.");
}
