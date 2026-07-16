import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  event: null as Stripe.Event | null,
  constructEvent: vi.fn(),
  retrieveCharge: vi.fn(),
  listDisputes: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: mocks.constructEvent },
    charges: { retrieve: mocks.retrieveCharge },
    disputes: { list: mocks.listDisputes }
  })
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc })
}));

import { POST } from "./route";

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  mocks.constructEvent.mockReset();
  mocks.retrieveCharge.mockReset();
  mocks.listDisputes.mockReset();
  mocks.rpc.mockReset();
});

describe("Stripe reversal webhooks", () => {
  it("rejects an invalid Stripe signature", async () => {
    mocks.constructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const response = await POST(webhookRequest());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid Stripe signature." });
  });

  it("rejects a signed event from the wrong Stripe mode", async () => {
    mocks.constructEvent.mockReturnValue({
      ...stripeEvent("charge.refunded", { id: "ch_live" }),
      livemode: true
    });

    const response = await POST(webhookRequest());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Stripe event mode does not match this deployment."
    });
    expect(mocks.retrieveCharge).not.toHaveBeenCalled();
  });

  it("reconciles refunds from Stripe's current charge and dispute state", async () => {
    mocks.constructEvent.mockReturnValue(
      stripeEvent("charge.refunded", { id: "ch_1" })
    );
    mocks.retrieveCharge.mockResolvedValue({
      id: "ch_1",
      payment_intent: "pi_1",
      amount: 799,
      amount_refunded: 400
    });
    mocks.listDisputes.mockResolvedValue({ data: [] });
    mocks.rpc.mockResolvedValue({ error: null });

    const response = await POST(webhookRequest());
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("reconcile_stripe_credit_reversal", {
      p_event_id: "evt_1",
      p_event_type: "charge.refunded",
      p_object_id: "ch_1",
      p_livemode: false,
      p_payment_intent_id: "pi_1",
      p_refunded_amount: 400,
      p_disputed: false,
      p_metadata: {
        charge_id: "ch_1",
        refunded_amount: 400,
        charge_amount: 799,
        dispute_ids: []
      }
    });
  });

  it("keeps a lost dispute fully reversed", async () => {
    mocks.constructEvent.mockReturnValue(
      stripeEvent("charge.dispute.closed", { charge: "ch_2" })
    );
    mocks.retrieveCharge.mockResolvedValue({
      id: "ch_2",
      payment_intent: "pi_2",
      amount: 499,
      amount_refunded: 0
    });
    mocks.listDisputes.mockResolvedValue({ data: [{ id: "dp_1", status: "lost" }] });
    mocks.rpc.mockResolvedValue({ error: null });

    const response = await POST(webhookRequest());
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "reconcile_stripe_credit_reversal",
      expect.objectContaining({ p_disputed: true, p_payment_intent_id: "pi_2" })
    );
  });
});

function webhookRequest() {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: "raw-body"
  });
}

function stripeEvent(type: Stripe.Event.Type, object: object) {
  return {
    id: "evt_1",
    type,
    livemode: false,
    data: { object }
  } as Stripe.Event;
}
