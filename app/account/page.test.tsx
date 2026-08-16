import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({ billingEnabled: true }));
vi.mock("@/lib/admin", () => ({ isAdminUserId: () => false }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => children
}));
vi.mock("@/components/BillingButtons", () => ({
  BillingPortalButton: () => <button type="button">Manage billing</button>
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1", email: "founder@example.com" } } })
    },
    from: () => {
      const query = {
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: { premium_credits: 2, free_pitch_available: false }
        })
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      return query;
    }
  })
}));

import AccountPage from "./page";

describe("account billing controls", () => {
  it("lets signed-in founders open the billing portal", async () => {
    const page = await AccountPage();

    expect(renderToStaticMarkup(page)).toContain("Manage billing");
  });
});
