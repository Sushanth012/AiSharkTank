import { describe, expect, it, vi } from "vitest";
import { pollPitchJob } from "./polling";

function jsonResponse(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("pollPitchJob", () => {
  it("keeps polling until a completed report is available", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ jobId: "job-1", submissionId: "sub-1", status: "queued" }))
      .mockResolvedValueOnce(jsonResponse({ jobId: "job-1", submissionId: "sub-1", status: "processing" }))
      .mockResolvedValueOnce(
        jsonResponse({ jobId: "job-1", submissionId: "sub-1", status: "complete", reportId: "report-1" })
      );

    const result = await pollPitchJob("job-1", { fetcher, intervalMs: 0 });

    expect(result.reportId).toBe("report-1");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenCalledWith("/api/jobs/job-1", expect.objectContaining({ cache: "no-store" }));
  });

  it("surfaces a safe terminal failure message", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        jobId: "job-2",
        submissionId: "sub-2",
        status: "failed",
        error: "The panel could not finish this pitch. Your credit was returned."
      })
    );

    await expect(pollPitchJob("job-2", { fetcher, intervalMs: 0 })).rejects.toThrow(
      "Your credit was returned"
    );
  });

  it("turns an unauthorized status response into a session-expiry message", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ error: "Unauthorized" }, 401));

    await expect(pollPitchJob("job-3", { fetcher, intervalMs: 0 })).rejects.toThrow("session expired");
  });
});
