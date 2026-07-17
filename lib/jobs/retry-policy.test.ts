import { describe, expect, it } from "vitest";
import { shouldRetryPitchJobFailure } from "./retry-policy";

describe("pitch job retry policy", () => {
  it("does not rerun paid AI calls after section retries are exhausted", () => {
    expect(shouldRetryPitchJobFailure({ reportRetriesExhausted: true })).toBe(false);
  });

  it("does not retry files rejected by artifact validation", () => {
    expect(shouldRetryPitchJobFailure({ artifactValidationFailed: true })).toBe(false);
  });

  it("still retries unrelated infrastructure failures", () => {
    expect(shouldRetryPitchJobFailure({})).toBe(true);
  });
});
