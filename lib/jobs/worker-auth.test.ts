import { describe, expect, it } from "vitest";
import { isAuthorizedWorkerRequest, workerBatchSize } from "./worker-auth";

describe("worker request helpers", () => {
  it("requires an exact bearer secret", () => {
    expect(isAuthorizedWorkerRequest("Bearer cron-secret", "cron-secret")).toBe(true);
    expect(isAuthorizedWorkerRequest("Bearer wrong", "cron-secret")).toBe(false);
    expect(isAuthorizedWorkerRequest("Basic cron-secret", "cron-secret")).toBe(false);
    expect(isAuthorizedWorkerRequest("Bearer cron-secret", undefined)).toBe(false);
  });

  it("bounds the batch size", () => {
    expect(workerBatchSize(undefined)).toBe(1);
    expect(workerBatchSize("4")).toBe(4);
    expect(workerBatchSize("0")).toBe(1);
    expect(workerBatchSize("99")).toBe(10);
    expect(workerBatchSize("invalid")).toBe(1);
  });
});
