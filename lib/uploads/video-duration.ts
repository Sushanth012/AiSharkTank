export const MAX_PITCH_VIDEO_SECONDS = 3 * 60;

export function validatePitchVideoDuration(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return "We could not read this video's duration. Try exporting it as an MP4.";
  }

  if (durationSeconds > MAX_PITCH_VIDEO_SECONDS) {
    return "Pitch video must be 3 minutes or shorter.";
  }

  return null;
}

export function readVideoDurationSeconds(file: File) {
  return new Promise<number>((resolve) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);

    const finish = (duration: number) => {
      URL.revokeObjectURL(objectUrl);
      video.removeAttribute("src");
      video.load();
      resolve(duration);
    };

    video.preload = "metadata";
    video.onloadedmetadata = () => finish(video.duration);
    video.onerror = () => finish(Number.NaN);
    video.src = objectUrl;
  });
}
