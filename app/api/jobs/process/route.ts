import { NextResponse } from "next/server";
import { processPitchJobs } from "@/lib/jobs/process-pitch-jobs";
import { isAuthorizedWorkerRequest, workerBatchSize } from "@/lib/jobs/worker-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  if (!isAuthorizedWorkerRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const result = await processPitchJobs(workerBatchSize(process.env.PITCH_WORKER_BATCH_SIZE));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pitch worker failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return POST(request);
}
