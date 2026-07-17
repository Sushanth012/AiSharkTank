import "server-only";

export function isAdminUserId(userId: string) {
  return (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(userId);
}
