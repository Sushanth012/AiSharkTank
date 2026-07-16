import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/ActivePitchRefresh", () => ({ ActivePitchRefresh: () => null }));
vi.mock("@/components/StatusBadge", () => ({ StatusBadge: () => null }));

import DashboardPage from "./page";

describe("founder dashboard entitlements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the signed-in founder's premium pitch balance", async () => {
    const submissionsQuery = chain({ data: [], error: null }, "order");
    const entitlementQuery = chain(
      { data: { premium_credits: 5, free_pitch_available: false, credit_debt: 0 }, error: null },
      "maybeSingle"
    );
    const from = vi.fn((table: string) => {
      if (table === "submissions") return submissionsQuery;
      if (table === "entitlement_summary") return entitlementQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    mocks.createSupabaseServerClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from
    });

    const page = await DashboardPage();
    const visibleText = collectText(page);

    expect(from).toHaveBeenCalledWith("entitlement_summary");
    expect(visibleText).toContain("5");
    expect(visibleText).toContain("Premium pitches");
  });
});

function chain(result: unknown, terminal: "order" | "maybeSingle") {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["select", "eq", "is"]) {
    query[method] = vi.fn(() => query);
  }
  query[terminal] = vi.fn().mockResolvedValue(result);
  return query;
}

function collectText(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (!React.isValidElement(node)) return [];
  return collectText((node.props as { children?: React.ReactNode }).children);
}
