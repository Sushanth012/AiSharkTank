"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BriefcaseBusiness, CheckCircle2, FileUp, Send, Sparkles, Ticket, Video } from "lucide-react";
import { MAX_DECK_BYTES, MAX_VIDEO_BYTES, formatBytes } from "@/lib/config";
import {
  resolvePitchTierAvailability,
  type EntitlementSummary
} from "@/lib/billing/entitlements";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { pollPitchJob } from "@/lib/jobs/polling";
import {
  readVideoDurationSeconds,
  validatePitchVideoDuration
} from "@/lib/uploads/video-duration";
import type { StartupProfile } from "@/lib/types";

type PitchSubmissionFormProps = {
  entitlements: EntitlementSummary;
  premiumEnabled: boolean;
};

export function PitchSubmissionForm({ entitlements, premiumEnabled }: PitchSubmissionFormProps) {
  const router = useRouter();
  const availability = resolvePitchTierAvailability(entitlements, premiumEnabled);
  const [tier, setTier] = useState<"basic" | "premium" | null>(availability.defaultTier);
  const [reviewMode, setReviewMode] = useState<"investor" | "yc">("investor");
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
    const hasDeck = deck instanceof File && deck.size > 0;

    if (!(video instanceof File) || video.size === 0) {
      setError("Add a pitch video before submitting.");
      return;
    }

    if (video.size > MAX_VIDEO_BYTES) {
      setError(`Video is too large. Keep it under ${formatBytes(MAX_VIDEO_BYTES)}.`);
      return;
    }

    const durationError = validatePitchVideoDuration(await readVideoDurationSeconds(video));
    if (durationError) {
      setError(durationError);
      return;
    }

    if (hasDeck && deck.size > MAX_DECK_BYTES) {
      setError(`Deck is too large. Keep it under ${formatBytes(MAX_DECK_BYTES)}.`);
      return;
    }

    setLoading(true);
    setPhase("uploading");
    const supabase = createSupabaseBrowserClient();
    let uploadedPaths: { videoPath: string; deckPath?: string } | null = null;
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
      const deckPath = hasDeck
        ? `${user.id}/${submissionId}/${safeFileName(deck.name)}`
        : "";

      const [videoUpload, deckUpload] = await Promise.all([
        supabase.storage.from("pitch-videos").upload(videoPath, video, {
          contentType: video.type || "application/octet-stream",
          upsert: false
        }),
        hasDeck
          ? supabase.storage.from("pitch-decks").upload(deckPath, deck, {
              contentType: deck.type || "application/octet-stream",
              upsert: false
            })
          : Promise.resolve({ error: null })
      ]);

      if (videoUpload.error || deckUpload.error) {
        await Promise.all([
          videoUpload.error
            ? Promise.resolve()
            : supabase.storage.from("pitch-videos").remove([videoPath]),
          deckUpload.error || !deckPath
            ? Promise.resolve()
            : supabase.storage.from("pitch-decks").remove([deckPath])
        ]);
        setLoading(false);
        setPhase("idle");
        setError(videoUpload.error?.message ?? deckUpload.error?.message ?? "Upload failed.");
        return;
      }
      uploadedPaths = { videoPath, ...(deckPath ? { deckPath } : {}) };

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
          uploadedPaths.deckPath
            ? supabase.storage.from("pitch-decks").remove([uploadedPaths.deckPath])
            : Promise.resolve()
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
            <strong>{reviewMode === "yc" ? "Your application is under review." : "Your pitch is with the panel."}</strong>
            <p>{reviewMode === "yc" ? "We are checking the idea, problem, founder fit, evidence, and biggest rejection risk. You can leave this page; the review will stay in your dashboard." : "We are reviewing your video and any supporting materials, challenging the story, and writing your investor report. You can leave this page; the pitch will stay in your dashboard."}</p>
          </div>
        </div>
      ) : null}

      <fieldset className="review-mode-fieldset">
        <legend>What are you preparing for?</legend>
        <p className="review-pass-intro">This changes the questions and language used throughout your report.</p>
        <div className="review-mode-grid">
          <label className={`review-mode-card ${reviewMode === "investor" ? "selected" : ""}`}>
            <input checked={reviewMode === "investor"} disabled={loading} name="reviewMode" onChange={() => setReviewMode("investor")} type="radio" value="investor" />
            <BriefcaseBusiness size={22} aria-hidden="true" />
            <span><strong>Investor pitch</strong><small>Business, market, growth, and fundraising</small></span>
          </label>
          <label className={`review-mode-card yc ${reviewMode === "yc" ? "selected" : ""}`}>
            <input checked={reviewMode === "yc"} disabled={loading} name="reviewMode" onChange={() => setReviewMode("yc")} type="radio" value="yc" />
            <Video size={22} aria-hidden="true" />
            <span><strong>YC application</strong><small>Video-first clarity, founder fit, and evidence</small></span>
            <span className="yc-mode-stamp">Video first</span>
          </label>
        </div>
        {reviewMode === "yc" ? (
          <div className="yc-question-strip" aria-label="YC application review questions">
            {["Clear idea", "Urgent problem", "Founder fit", "Real evidence", "Rejection risk"].map((item) => (
              <span key={item}><CheckCircle2 size={14} aria-hidden="true" />{item}</span>
            ))}
          </div>
        ) : null}
      </fieldset>

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
          <label htmlFor="traction">{reviewMode === "yc" ? "Evidence people want this" : "Traction"}</label>
          <input id="traction" name="traction" placeholder={reviewMode === "yc" ? "Users, interviews, revenue, waitlist, or pilots" : "Waitlist, revenue, pilots"} required={reviewMode === "yc"} />
        </div>
        <div className="field">
          <label htmlFor="fundingGoal">Funding goal</label>
          <input id="fundingGoal" name="fundingGoal" placeholder="$250K pre-seed" />
        </div>
        <div className="field">
          <label htmlFor="demoLink">Demo link <span className="optional-label">Optional</span></label>
          <input id="demoLink" name="demoLink" placeholder="Add later if you do not have one yet" type="url" />
        </div>
        <div className="field">
          <label htmlFor="deckNotes">Deck notes <span className="optional-label">Optional</span></label>
          <input id="deckNotes" name="deckNotes" placeholder="Anything else the panel should know" />
        </div>
        {reviewMode === "yc" ? (
          <div className="field full yc-founder-field">
            <label htmlFor="founderFit">Why are you the right founders?</label>
            <textarea id="founderFit" name="founderFit" required placeholder="What have you experienced, learned, built, or discovered that gives your team an advantage?" />
          </div>
        ) : null}
      </div>

      <div className="form-intro materials-intro">
        <span>Part two</span>
        <div><h2>Add your pitch</h2><p>{reviewMode === "yc" ? "Your application video is the main event. A deck, notes, and demo link are optional supporting material." : "Your video is enough for a complete review. Add a deck only if it helps explain the idea."}</p></div>
      </div>
      <div className="form-grid">
        <div className="dropzone">
          <div>
            <FileUp size={24} aria-hidden="true" />
            <label htmlFor="pitchVideo"><strong>Pitch video</strong></label>
            <p className="help">Required. 2 minutes recommended; 3 minutes and 24 MB maximum. MP4, MOV, or WebM.</p>
            <input id="pitchVideo" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" name="video" required type="file" />
          </div>
        </div>
        <div className="dropzone">
          <div>
            <FileUp size={24} aria-hidden="true" />
            <label htmlFor="pitchDeck"><strong>Pitch deck</strong> <span className="optional-label">Optional</span></label>
            <p className="help">{reviewMode === "yc" ? "Optional. YC mode is designed to work from the application video alone." : "Optional. Add a PDF/PPTX only when it gives the panel useful context."}</p>
            <input
              id="pitchDeck"
              accept="application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation"
              name="deck"
              type="file"
            />
          </div>
        </div>
      </div>

      <button className="button primary" disabled={loading || !tier} type="submit" aria-busy={loading}>
        <Send size={18} aria-hidden="true" />
        {phase === "uploading" ? "Uploading your pitch..." : phase === "processing" ? "Reviewing..." : reviewMode === "yc" ? "Generate YC application review" : "Generate investor report"}
      </button>
    </form>
  );
}

function profileFromForm(formData: FormData): StartupProfile {
  return {
    reviewMode: (stringFromForm(formData, "reviewMode") || "investor") as StartupProfile["reviewMode"],
    startupName: stringFromForm(formData, "startupName"),
    founderName: stringFromForm(formData, "founderName"),
    industry: stringFromForm(formData, "industry"),
    stage: stringFromForm(formData, "stage"),
    description: stringFromForm(formData, "description"),
    targetCustomer: stringFromForm(formData, "targetCustomer"),
    businessModel: stringFromForm(formData, "businessModel"),
    traction: stringFromForm(formData, "traction"),
    founderFit: stringFromForm(formData, "founderFit"),
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
