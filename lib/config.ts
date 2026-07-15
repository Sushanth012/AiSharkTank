export const MAX_VIDEO_BYTES = Number(process.env.MAX_VIDEO_BYTES ?? 262_144_000);
export const MAX_DECK_BYTES = Number(process.env.MAX_DECK_BYTES ?? 52_428_800);

export const isSupabaseConfigured =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const isOpenAIConfigured = Boolean(process.env.OPENAI_API_KEY);
export const isDeepSeekConfigured = Boolean(process.env.DEEPSEEK_API_KEY);
export const isStripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
export const isSupabaseAdminConfigured =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);

export const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";
export const premiumEnabled = process.env.NEXT_PUBLIC_PREMIUM_ENABLED === "true";

export const acceptedVideoTypes = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v"
];

export const acceptedDeckTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
];

export function formatBytes(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return `${Math.round(mb)} MB`;
}
