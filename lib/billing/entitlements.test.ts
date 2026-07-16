import { describe, expect, it } from "vitest";
import { resolvePitchTierAvailability } from "./entitlements";

describe("pitch tier availability", () => {
  it("defaults a new founder to the lifetime free pitch", () => {
    expect(
      resolvePitchTierAvailability(
        { freePitchAvailable: true, premiumCredits: 5, creditDebt: 0 },
        true
      )
    ).toEqual({ basicAvailable: true, premiumAvailable: true, defaultTier: "basic" });
  });

  it("uses premium after the free pitch when a paid credit is available", () => {
    expect(
      resolvePitchTierAvailability(
        { freePitchAvailable: false, premiumCredits: 2, creditDebt: 0 },
        true
      )
    ).toEqual({ basicAvailable: false, premiumAvailable: true, defaultTier: "premium" });
  });

  it("blocks premium work when billing is disabled or credit debt exists", () => {
    expect(
      resolvePitchTierAvailability(
        { freePitchAvailable: false, premiumCredits: 3, creditDebt: 0 },
        false
      ).defaultTier
    ).toBeNull();
    expect(
      resolvePitchTierAvailability(
        { freePitchAvailable: false, premiumCredits: 3, creditDebt: 1 },
        true
      ).premiumAvailable
    ).toBe(false);
  });
});
