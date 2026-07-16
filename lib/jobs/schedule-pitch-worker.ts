import { after } from "next/server";
import { processPitchJobs } from "./process-pitch-jobs";

type ScheduleAfterResponse = (task: () => Promise<void>) => void;
type RunPitchWorker = (batchSize: number) => Promise<unknown>;

export function schedulePitchWorker(
  schedule: ScheduleAfterResponse = after,
  runWorker: RunPitchWorker = processPitchJobs
) {
  schedule(async () => {
    try {
      await runWorker(1);
    } catch (error) {
      console.error(
        "Post-response pitch worker failed; the reconciliation cron will retry it.",
        error instanceof Error ? error.message : "Unknown worker error"
      );
    }
  });
}
