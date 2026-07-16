import { describe, expect, it, vi } from "vitest";

vi.mock("./process-pitch-jobs", () => ({
  processPitchJobs: vi.fn()
}));

import { schedulePitchWorker } from "./schedule-pitch-worker";

describe("post-response pitch worker", () => {
  it("schedules one queued job without delaying the submission response", async () => {
    let task: (() => Promise<void>) | undefined;
    const runWorker = vi.fn().mockResolvedValue({ claimed: 1 });

    schedulePitchWorker((scheduled) => {
      task = scheduled;
    }, runWorker);

    expect(runWorker).not.toHaveBeenCalled();
    await task?.();
    expect(runWorker).toHaveBeenCalledWith(1);
  });

  it("leaves a failed job for reconciliation instead of rejecting the response", async () => {
    let task: (() => Promise<void>) | undefined;
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    schedulePitchWorker(
      (scheduled) => {
        task = scheduled;
      },
      vi.fn().mockRejectedValue(new Error("provider unavailable"))
    );

    await expect(task?.()).resolves.toBeUndefined();
    expect(errorLog).toHaveBeenCalledWith(
      expect.stringContaining("reconciliation cron"),
      "provider unavailable"
    );
    errorLog.mockRestore();
  });
});
