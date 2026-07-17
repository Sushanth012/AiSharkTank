import { describe, expect, it } from "vitest";
import { billingOffers } from "./catalog";

describe("billing catalog", () => {
  it("offers Pitch Pack as a monthly plan with a two-month rollover cap", () => {
    expect(billingOffers.pitch_pack).toMatchObject({
      displayPrice: "$7.99/mo",
      mode: "subscription",
      credits: 5,
      creditSource: "subscription",
      rolloverCap: 10
    });
  });

  it("keeps Builder's monthly credits and rollover cap", () => {
    expect(billingOffers.builder).toMatchObject({
      mode: "subscription",
      credits: 15,
      rolloverCap: 30
    });
  });
});
