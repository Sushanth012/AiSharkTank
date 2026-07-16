import { describe, expect, it } from "vitest";
import {
  MAX_PITCH_VIDEO_SECONDS,
  validatePitchVideoDuration
} from "./video-duration";

describe("pitch video duration", () => {
  it("accepts a pitch at the three-minute boundary", () => {
    expect(validatePitchVideoDuration(MAX_PITCH_VIDEO_SECONDS)).toBeNull();
  });

  it("rejects a pitch longer than three minutes", () => {
    expect(validatePitchVideoDuration(MAX_PITCH_VIDEO_SECONDS + 0.01)).toBe(
      "Pitch video must be 3 minutes or shorter."
    );
  });

  it("rejects unreadable video metadata", () => {
    expect(validatePitchVideoDuration(Number.NaN)).toBe(
      "We could not read this video's duration. Try exporting it as an MP4."
    );
  });
});
