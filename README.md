# AI Shark Tank

AI Shark Tank is an authenticated MVP for founders who want to practice a startup
pitch against an AI investor panel. Users can upload a pitch video, attach a
deck, enter startup details, and receive a saved investor-style report.

## MVP Features

- Account-based workspace with Supabase Auth.
- Five-minute pitch upload flow with a 250 MB video cap.
- Required pitch deck upload, with PDF preferred and PPTX accepted.
- Saved report dashboard with per-user access.
- AI investor report with scores, investor decisions, follow-up questions,
  milestones, and valuation framing.
- Delete flow that removes the report, submission, and associated uploaded files.
- Local demo mode when Supabase keys are not configured.

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
OPENAI_API_KEY=
```

3. In Supabase, run `supabase/schema.sql` in the SQL editor.

4. Start the app:

```bash
pnpm dev
```

## Notes For Production

- The current MVP generates the report during submission. For heavier usage,
  move transcription, deck parsing, and report generation into a background job
  system such as Inngest or Trigger.dev.
- The transcript override field keeps early testing useful before automated
  video transcription and deck extraction are fully wired.
- Valuation output is intentionally presented as an estimated practice range
  with assumptions and confidence, not financial advice.
