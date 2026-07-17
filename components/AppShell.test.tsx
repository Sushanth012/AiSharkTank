import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell account navigation", () => {
  it("sends workspace users to the account page instead of the login page", () => {
    const html = renderToStaticMarkup(<AppShell variant="workspace"><div>Workspace</div></AppShell>);
    expect(html).toContain('href="/account"');
    expect(html).toContain("Account");
  });

  it("keeps the marketing call to action pointed at authentication", () => {
    const html = renderToStaticMarkup(<AppShell><div>Marketing</div></AppShell>);
    expect(html).toContain('href="/auth"');
    expect(html).toContain("Enter the room");
  });
});
