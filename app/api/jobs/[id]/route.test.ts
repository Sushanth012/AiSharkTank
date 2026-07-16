import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  schedulePitchWorker: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: () => {
      const query = {
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle: mocks.maybeSingle
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      return query;
    }
  })
}));

vi.mock("@/lib/jobs/schedule-pitch-worker", () => ({
  schedulePitchWorker: mocks.schedulePitchWorker
}));

import { GET } from "./route";

beforeEach(() => {
  mocks.getUser.mockReset();
  mocks.maybeSingle.mockReset();
  mocks.schedulePitchWorker.mockReset();
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
});

describe("GET /api/jobs/[id]", () => {
  it("reschedules an owned queued job so polling recovers a missed worker run", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        id: "job-1",
        submission_id: "submission-1",
        status: "queued",
        error_code: null
      },
      error: null
    });

    const response = await GET(new Request("http://localhost/api/jobs/job-1"), {
      params: Promise.resolve({ id: "job-1" })
    });

    expect(response.status).toBe(200);
    expect(mocks.schedulePitchWorker).toHaveBeenCalledTimes(1);
  });
});
