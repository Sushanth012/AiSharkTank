export type PitchJobStatus = "queued" | "processing" | "complete" | "failed" | "dead_letter";

export type PitchJobSnapshot = {
  jobId: string;
  submissionId: string;
  status: PitchJobStatus;
  reportId?: string;
  error?: string;
};

type PollPitchJobOptions = {
  fetcher?: typeof fetch;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
};

const DEFAULT_INTERVAL_MS = 2_500;
const DEFAULT_TIMEOUT_MS = 4 * 60 * 1000;

export async function pollPitchJob(
  jobId: string,
  options: PollPitchJobOptions = {}
): Promise<PitchJobSnapshot & { reportId: string }> {
  const fetcher = options.fetcher ?? fetch;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();

  while (Date.now() - startedAt <= timeoutMs) {
    throwIfAborted(options.signal);

    const response = await fetcher(`/api/jobs/${encodeURIComponent(jobId)}`, {
      cache: "no-store",
      credentials: "same-origin",
      signal: options.signal
    });
    const payload = await readJson(response);

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Your session expired. Sign in again to continue.");
      }
      throw new Error(payload.error ?? "We could not check the pitch status. Try again in a moment.");
    }

    const snapshot = payload as PitchJobSnapshot;
    if (snapshot.status === "complete" && snapshot.reportId) {
      return { ...snapshot, reportId: snapshot.reportId };
    }
    if (snapshot.status === "failed" || snapshot.status === "dead_letter") {
      throw new Error(snapshot.error ?? "The panel could not finish this pitch. Your credit was returned.");
    }

    await wait(intervalMs, options.signal);
  }

  throw new Error("The panel is taking longer than expected. Your pitch is safe in the dashboard and will keep processing.");
}

async function readJson(response: Response): Promise<Record<string, string>> {
  try {
    return (await response.json()) as Record<string, string>;
  } catch {
    return {};
  }
}

function wait(durationMs: number, signal?: AbortSignal) {
  if (durationMs <= 0) return Promise.resolve();

  return new Promise<void>((resolve, reject) => {
    const handleAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", handleAbort);
      resolve();
    }, durationMs);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException("Aborted", "AbortError");
  }
}
