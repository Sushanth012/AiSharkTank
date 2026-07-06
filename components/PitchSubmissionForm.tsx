"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { MAX_DECK_BYTES, MAX_VIDEO_BYTES, formatBytes } from "@/lib/config";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { StartupProfile } from "@/lib/types";

export function PitchSubmissionForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const video = formData.get("video");
    const deck = formData.get("deck");

    if (!(video instanceof File) || video.size === 0) {
      setError("Add a pitch video before submitting.");
      return;
    }

    if (!(deck instanceof File) || deck.size === 0) {
      setError("Add a pitch deck before submitting.");
      return;
    }

    if (video.size > MAX_VIDEO_BYTES) {
      setError(`Video is too large. Keep it under ${formatBytes(MAX_VIDEO_BYTES)}.`);
      return;
    }

    if (deck.size > MAX_DECK_BYTES) {
      setError(`Deck is too large. Keep it under ${formatBytes(MAX_DECK_BYTES)}.`);
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    let response: Response;

    if (supabase) {
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        setError("Sign in before submitting a pitch.");
        return;
      }

      const submissionId = crypto.randomUUID();
      const videoPath = `${user.id}/${submissionId}/${safeFileName(video.name)}`;
      const deckPath = `${user.id}/${submissionId}/${safeFileName(deck.name)}`;

      const [videoUpload, deckUpload] = await Promise.all([
        supabase.storage.from("pitch-videos").upload(videoPath, video, {
          contentType: video.type || "application/octet-stream",
          upsert: false
        }),
        supabase.storage.from("pitch-decks").upload(deckPath, deck, {
          contentType: deck.type || "application/octet-stream",
          upsert: false
        })
      ]);

      if (videoUpload.error || deckUpload.error) {
        setLoading(false);
        setError(videoUpload.error?.message ?? deckUpload.error?.message ?? "Upload failed.");
        return;
      }

      response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          videoPath,
          deckPath,
          profile: profileFromForm(formData),
          transcript: stringFromForm(formData, "transcript")
        })
      });
    } else {
      response = await fetch("/api/submissions", {
        method: "POST",
        body: formData
      });
    }

    const payload = (await response.json()) as { reportId?: string; error?: string };
    setLoading(false);

    if (!response.ok || !payload.reportId) {
      setError(payload.error ?? "Something went wrong while creating the report.");
      return;
    }

    router.push(`/reports/${payload.reportId}`);
    router.refresh();
  }

  return (
    <form className="panel form-card grid" onSubmit={submit}>
      {error ? <div className="error">{error}</div> : null}

      <div className="form-grid">
        <div className="field">
          <label htmlFor="startupName">Startup name</label>
          <input id="startupName" name="startupName" required placeholder="CampusCart" />
        </div>
        <div className="field">
          <label htmlFor="founderName">Founder name</label>
          <input id="founderName" name="founderName" required placeholder="Maya Chen" />
        </div>
        <div className="field">
          <label htmlFor="industry">Industry</label>
          <input id="industry" name="industry" required placeholder="Consumer marketplace" />
        </div>
        <div className="field">
          <label htmlFor="stage">Stage</label>
          <select id="stage" name="stage" required defaultValue="Pre-seed">
            <option>Idea</option>
            <option>Prototype</option>
            <option>Pre-seed</option>
            <option>Seed</option>
            <option>Revenue generating</option>
          </select>
        </div>
        <div className="field full">
          <label htmlFor="description">Startup description</label>
          <textarea
            id="description"
            name="description"
            required
            placeholder="What problem are you solving, for whom, and why now?"
          />
        </div>
        <div className="field">
          <label htmlFor="targetCustomer">Target customer</label>
          <input id="targetCustomer" name="targetCustomer" required placeholder="College students" />
        </div>
        <div className="field">
          <label htmlFor="businessModel">Business model</label>
          <input id="businessModel" name="businessModel" required placeholder="Transaction fee" />
        </div>
        <div className="field">
          <label htmlFor="traction">Traction</label>
          <input id="traction" name="traction" placeholder="Waitlist, revenue, pilots" />
        </div>
        <div className="field">
          <label htmlFor="fundingGoal">Funding goal</label>
          <input id="fundingGoal" name="fundingGoal" placeholder="$250K pre-seed" />
        </div>
        <div className="field">
          <label htmlFor="demoLink">Demo link</label>
          <input id="demoLink" name="demoLink" placeholder="https://..." type="url" />
        </div>
        <div className="field">
          <label htmlFor="deckNotes">Deck notes</label>
          <input id="deckNotes" name="deckNotes" placeholder="Anything the deck emphasizes" />
        </div>
      </div>

      <div className="form-grid">
        <div className="dropzone">
          <div>
            <strong>Pitch video</strong>
            <p className="help">Required. MP4, MOV, or WebM. Five minutes max.</p>
            <input accept="video/mp4,video/quicktime,video/webm,video/x-m4v" name="video" required type="file" />
          </div>
        </div>
        <div className="dropzone">
          <div>
            <strong>Pitch deck</strong>
            <p className="help">Required for MVP. PDF preferred; PPTX accepted for storage.</p>
            <input
              accept="application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              name="deck"
              required
              type="file"
            />
          </div>
        </div>
      </div>

      <div className="field">
        <label htmlFor="transcript">Transcript override</label>
        <textarea
          id="transcript"
          name="transcript"
          placeholder="Optional for the MVP: paste a transcript if you want immediate report quality before background transcription is connected."
        />
        <span className="help">
          Production processing can transcribe the uploaded video. This field keeps the MVP useful
          while you configure the AI worker.
        </span>
      </div>

      <button className="button primary" disabled={loading} type="submit">
        <Send size={18} aria-hidden="true" />
        {loading ? "Generating report..." : "Generate investor report"}
      </button>
    </form>
  );
}

function profileFromForm(formData: FormData): StartupProfile {
  return {
    startupName: stringFromForm(formData, "startupName"),
    founderName: stringFromForm(formData, "founderName"),
    industry: stringFromForm(formData, "industry"),
    stage: stringFromForm(formData, "stage"),
    description: stringFromForm(formData, "description"),
    targetCustomer: stringFromForm(formData, "targetCustomer"),
    businessModel: stringFromForm(formData, "businessModel"),
    traction: stringFromForm(formData, "traction"),
    fundingGoal: stringFromForm(formData, "fundingGoal"),
    demoLink: stringFromForm(formData, "demoLink"),
    deckNotes: stringFromForm(formData, "deckNotes")
  };
}

function stringFromForm(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function safeFileName(fileName: string) {
  const cleaned = fileName.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return `${Date.now()}-${cleaned || "upload"}`;
}
