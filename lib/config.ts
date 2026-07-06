export const MAX_VIDEO_BYTES = Number(process.env.MAX_VIDEO_BYTES ?? 262_144_000);
export const MAX_DECK_BYTES = Number(process.env.MAX_DECK_BYTES ?? 52_428_800);

export const isSupabaseConfigured =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

export const isOpenAIConfigured = Boolean(process.env.OPENAI_API_KEY);

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
