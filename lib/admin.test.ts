import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { isAdminUserId } from "./admin";

const originalAdminUserIds = process.env.ADMIN_USER_IDS;

afterEach(() => {
  if (originalAdminUserIds === undefined) delete process.env.ADMIN_USER_IDS;
  else process.env.ADMIN_USER_IDS = originalAdminUserIds;
});

describe("admin authorization", () => {
  it("allows only exact configured user IDs", () => {
    process.env.ADMIN_USER_IDS = "user-one, user-two";
    expect(isAdminUserId("user-one")).toBe(true);
    expect(isAdminUserId("user-two")).toBe(true);
    expect(isAdminUserId("user")).toBe(false);
  });

  it("denies everyone when no admin IDs are configured", () => {
    delete process.env.ADMIN_USER_IDS;
    expect(isAdminUserId("user-one")).toBe(false);
  });
});
