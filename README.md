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

2. Copy `.env.example` to `.env.local` and fill in the Supabase, AI, and Stripe values you need.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SECRET_KEY=
DEEPSEEK_API_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

3. Apply the immutable files in `supabase/migrations/` in timestamp order. Those migrations are the schema source of truth.

4. Start the app:

```bash
pnpm dev
```

## Notes For Production

- The commercial foundation persists a job and entitlement reservation before generation. The current route still claims the first job synchronously; a durable worker and artifact extraction are the next implementation phase.
- The transcript override field keeps early testing useful before automated
  video transcription and deck extraction are fully wired.
- Valuation output is intentionally presented as an estimated practice range
  with assumptions and confidence, not financial advice.
- Billing and premium UI stay disabled until `NEXT_PUBLIC_BILLING_ENABLED` and
  `NEXT_PUBLIC_PREMIUM_ENABLED` are explicitly enabled after webhook testing.
