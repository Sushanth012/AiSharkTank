"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileUp, Send, Sparkles, Ticket } from "lucide-react";
import { MAX_DECK_BYTES, MAX_VIDEO_BYTES, formatBytes } from "@/lib/config";
import {
  resolvePitchTierAvailability,
  type EntitlementSummary
} from "@/lib/billing/entitlements";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { pollPitchJob } from "@/lib/jobs/polling";
import type { StartupProfile } from "@/lib/types";

type PitchSubmissionFormProps = {
  entitlements: EntitlementSummary;
  premiumEnabled: boolean;
};

export function PitchSubmissionForm({ entitlements, premiumEnabled }: PitchSubmissionFormProps) {
  const router = useRouter();
  const availability = resolvePitchTierAvailability(entitlements, premiumEnabled);
  const [tier, setTier] = useState<"basic" | "premium" | null>(availability.defaultTier);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<"idle" | "uploading" | "processing">("idle");
  const pollingController = useRef<AbortController | null>(null);

  useEffect(() => () => pollingController.current?.abort(), []);

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
    setPhase("uploading");
    const supabase = createSupabaseBrowserClient();
    let uploadedPaths: { videoPath: string; deckPath: string } | null = null;
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
        await Promise.all([
          videoUpload.error
            ? Promise.resolve()
            : supabase.storage.from("pitch-videos").remove([videoPath]),
          deckUpload.error
            ? Promise.resolve()
            : supabase.storage.from("pitch-decks").remove([deckPath])
        ]);
        setLoading(false);
        setPhase("idle");
        setError(videoUpload.error?.message ?? deckUpload.error?.message ?? "Upload failed.");
        return;
      }
      uploadedPaths = { videoPath, deckPath };

      response = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId,
          videoPath,
          deckPath,
          profile: profileFromForm(formData),
          tier: stringFromForm(formData, "tier")
        })
      });
    } else {
      response = await fetch("/api/submissions", {
        method: "POST",
        body: formData
      });
    }

    const payload = (await response.json().catch(() => ({}))) as {
      reportId?: string;
      jobId?: string;
      error?: string;
    };

    if (!response.ok) {
      if (supabase && uploadedPaths) {
        await Promise.all([
          supabase.storage.from("pitch-videos").remove([uploadedPaths.videoPath]),
          supabase.storage.from("pitch-decks").remove([uploadedPaths.deckPath])
        ]);
      }
      setLoading(false);
      setPhase("idle");
      setError(payload.error ?? "Something went wrong while creating the report.");
      return;
    }

    if (payload.reportId) {
      router.push(`/reports/${payload.reportId}`);
      router.refresh();
      return;
    }

    if (!payload.jobId) {
      setLoading(false);
      setPhase("idle");
      setError("The pitch was received, but its processing status is unavailable. Check your dashboard.");
      return;
    }

    setPhase("processing");
    const controller = new AbortController();
    pollingController.current = controller;

    try {
      const completed = await pollPitchJob(payload.jobId, { signal: controller.signal });
      router.push(`/reports/${completed.reportId}`);
      router.refresh();
    } catch (pollError) {
      if (controller.signal.aborted) return;
      setError(pollError instanceof Error ? pollError.message : "Pitch status is temporarily unavailable.");
      setLoading(false);
      setPhase("idle");
    } finally {
      pollingController.current = null;
    }
  }

  return (
    <form className="panel form-card grid" onSubmit={submit}>
      <div className="form-intro">
        <span>Part one</span>
        <div><h2>Set the context</h2><p>The panel uses this to judge the pitch against the business you are actually building.</p></div>
      </div>
      {error ? <div className="error" role="alert">{error}</div> : null}
      {phase === "processing" ? (
        <div className="processing-callout" role="status" aria-live="polite">
          <span className="processing-pulse" aria-hidden="true" />
          <div>
            <strong>Your pitch is with the panel.</strong>
            <p>We are reading the deck, challenging the story, and writing your investor report. You can leave this page; the pitch will stay in your dashboard.</p>
          </div>
        </div>
      ) : null}

      <fieldset className="review-pass-fieldset">
        <legend>Choose the room</legend>
        <p className="review-pass-intro">The database checks your pass again before the panel starts.</p>
        <div className="review-pass-grid">
          <label className={`review-pass ${tier === "basic" ? "selected" : ""} ${!availability.basicAvailable ? "unavailable" : ""}`}>
            <input
              checked={tier === "basic"}
              disabled={!availability.basicAvailable || loading}
              name="tier"
              onChange={() => setTier("basic")}
              type="radio"
              value="basic"
            />
            <span className="pass-icon"><Ticket size={20} aria-hidden="true" /></span>
            <span className="pass-copy">
              <strong>First rehearsal</strong>
              <small>One efficient panel review</small>
            </span>
            <span className="pass-stamp">{availability.basicAvailable ? "Free pass" : "Used"}</span>
          </label>

          <label className={`review-pass premium ${tier === "premium" ? "selected" : ""} ${!availability.premiumAvailable ? "unavailable" : ""}`}>
            <input
              checked={tier === "premium"}
              disabled={!availability.premiumAvailable || loading}
              name="tier"
              onChange={() => setTier("premium")}
              type="radio"
              value="premium"
            />
            <span className="pass-icon"><Sparkles size={20} aria-hidden="true" /></span>
            <span className="pass-copy">
              <strong>Full investor room</strong>
              <small>Five specialist lenses + synthesis</small>
            </span>
            <span className="pass-stamp">
              {entitlements.creditDebt > 0 ? "Balance due" : `${entitlements.premiumCredits} credit${entitlements.premiumCredits === 1 ? "" : "s"}`}
            </span>
          </label>
        </div>
        {!availability.basicAvailable && !availability.premiumAvailable ? (
          <p className="review-pass-action">
            You need a premium pass before starting another room. <Link href="/pricing">See passes</Link>
          </p>
        ) : null}
      </fieldset>

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

      <div className="form-intro materials-intro">
        <span>Part two</span>
        <div><h2>Bring the evidence</h2><p>Your pitch and deck are reviewed together, just like they would be in the room.</p></div>
      </div>
      <div className="form-grid">
        <div className="dropzone">
          <div>
            <FileUp size={24} aria-hidden="true" />
            <label htmlFor="pitchVideo"><strong>Pitch video</strong></label>
            <p className="help">Required. MP4, MOV, or WebM. 24 MB max.</p>
            <input id="pitchVideo" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" name="video" required type="file" />
          </div>
        </div>
        <div className="dropzone">
          <div>
            <FileUp size={24} aria-hidden="true" />
            <label htmlFor="pitchDeck"><strong>Pitch deck</strong></label>
            <p className="help">Required for MVP. PDF preferred; PPTX accepted for storage.</p>
            <input
              id="pitchDeck"
              accept="application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              name="deck"
              required
              type="file"
            />
          </div>
        </div>
      </div>

      <button className="button primary" disabled={loading || !tier} type="submit" aria-busy={loading}>
        <Send size={18} aria-hidden="true" />
        {phase === "uploading" ? "Uploading your pitch..." : phase === "processing" ? "Panel reviewing..." : "Generate investor report"}
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
