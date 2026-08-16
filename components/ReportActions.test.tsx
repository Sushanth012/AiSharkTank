import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() })
}));

import { ReportActions } from "./ReportActions";

describe("ReportActions", () => {
  it("keeps PDF export but hides deletion for the public demo", () => {
    const html = renderToStaticMarkup(<ReportActions reportId="demo-report" />);

    expect(html).toContain("Save as PDF");
    expect(html).not.toContain("Delete report");
  });

  it("allows deletion for saved reports", () => {
    const html = renderToStaticMarkup(<ReportActions reportId="5cba7e12-0588-48f5-a568-602681753f50" />);

    expect(html).toContain("Delete report");
  });
});
