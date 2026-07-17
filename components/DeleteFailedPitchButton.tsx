"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Trash2 } from "lucide-react";

export function DeleteFailedPitchButton({
  submissionId,
  startupName
}: {
  submissionId: string;
  startupName: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function deletePitch() {
    if (!window.confirm(`Delete the failed pitch for ${startupName}? This cannot be undone.`)) {
      return;
    }

    setDeleting(true);
    setError("");

    try {
      const response = await fetch(`/api/submissions/${submissionId}`, { method: "DELETE" });
      const result = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(result?.error ?? "The failed pitch could not be deleted.");
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "The failed pitch could not be deleted.");
      setDeleting(false);
    }
  }

  return (
    <div className="failed-pitch-actions">
      <span className="status-note failed">This run needs another try</span>
      <button
        aria-label={`Delete failed pitch for ${startupName}`}
        className="button danger"
        disabled={deleting}
        onClick={deletePitch}
        type="button"
      >
        <Trash2 size={17} aria-hidden="true" />
        {deleting ? "Deleting..." : "Delete"}
      </button>
      {error ? <span className="delete-pitch-error" role="alert">{error}</span> : null}
    </div>
  );
}
