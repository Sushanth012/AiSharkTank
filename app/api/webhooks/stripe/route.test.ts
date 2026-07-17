import type Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  event: null as Stripe.Event | null,
  constructEvent: vi.fn(),
  retrieveCharge: vi.fn(),
  listDisputes: vi.fn(),
  listInvoicePayments: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    webhooks: { constructEvent: mocks.constructEvent },
    charges: { retrieve: mocks.retrieveCharge },
    disputes: { list: mocks.listDisputes },
    invoicePayments: { list: mocks.listInvoicePayments }
  })
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc })
}));

import { POST } from "./route";

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
  mocks.constructEvent.mockReset();
  mocks.retrieveCharge.mockReset();
  mocks.listDisputes.mockReset();
  mocks.listInvoicePayments.mockReset();
  mocks.from.mockReset();
  mocks.rpc.mockReset();
  process.env.STRIPE_PRICE_PITCH_PACK = "price_pitch_monthly";
  process.env.STRIPE_PRICE_BUILDER = "price_builder_monthly";
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

  it("grants five Pitch Pack credits from a paid monthly invoice with a cap of ten", async () => {
    mocks.constructEvent.mockReturnValue(
      stripeEvent("invoice.paid", {
        id: "in_pitch_1",
        currency: "usd",
        billing_reason: "subscription_cycle",
        customer: "cus_pitch",
        amount_paid: 799,
        lines: {
          data: [{ pricing: { price_details: { price: "price_pitch_monthly" } } }]
        }
      })
    );
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { user_id: "10000000-0000-4000-8000-000000000001" }, error: null }) })
      })
    });
    mocks.listInvoicePayments.mockResolvedValue({
      data: [{ payment: { payment_intent: "pi_pitch_1" } }]
    });
    mocks.rpc.mockResolvedValue({ error: null });

    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("process_stripe_fulfillment_event", {
      p_event_id: "evt_1",
      p_event_type: "invoice.paid",
      p_object_id: "in_pitch_1",
      p_livemode: false,
      p_user_id: "10000000-0000-4000-8000-000000000001",
      p_source: "subscription",
      p_quantity: 5,
      p_external_ref: "in_pitch_1",
      p_payment_intent_id: "pi_pitch_1",
      p_amount_paid: 799,
      p_currency: "usd",
      p_expires_at: null,
      p_metadata: {
        offer_id: "pitch_pack",
        price_id: "price_pitch_monthly",
        billing_reason: "subscription_cycle",
        rollover_cap: 10
      }
    });
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
