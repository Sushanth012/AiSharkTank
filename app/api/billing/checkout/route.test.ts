import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createCheckoutSession: vi.fn(),
  getOrCreateStripeCustomer: vi.fn()
}));

vi.mock("@/lib/config", () => ({ billingEnabled: true }));
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: mocks.createCheckoutSession } } })
}));
vi.mock("@/lib/billing/customers", () => ({
  getOrCreateStripeCustomer: mocks.getOrCreateStripeCustomer
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) }
  })
}));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/billing/checkout", () => {
  it.each([
    ["a non-object body", "null"],
    ["malformed JSON", "{"]
  ])("rejects %s as an unknown offer", async (_description, body) => {
    const response = await POST(new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Unknown billing offer." });
    expect(mocks.getOrCreateStripeCustomer).not.toHaveBeenCalled();
    expect(mocks.createCheckoutSession).not.toHaveBeenCalled();
  });
});
