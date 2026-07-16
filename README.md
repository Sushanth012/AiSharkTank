# AI Shark Tank

AI Shark Tank is an authenticated MVP for founders who want to practice a startup
pitch against an AI investor panel. Users can upload a pitch video, attach a
deck, enter startup details, and receive a saved investor-style report.

## MVP Features

- Account-based workspace with Supabase Auth.
- Five-minute pitch upload flow with a 24 MB processing cap.
- Required pitch deck upload, with PDF preferred and PPTX accepted.
- Saved report dashboard with per-user access.
- One lifetime free rehearsal plus paid premium pitch passes.
- Stripe-hosted Checkout, subscription management, and compensating refund/dispute accounting.
- Durable background processing with bounded retries and credit-safe settlement.
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
OPENAI_API_KEY=
CRON_SECRET=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

3. Apply the immutable files in `supabase/migrations/` in timestamp order. Those migrations are the schema source of truth.

4. Start the app:

```bash
pnpm dev
```

## Notes For Production

- Authenticated submissions reserve an entitlement, enqueue a durable job, and return `202`.
  The worker claims jobs atomically, heartbeats its lease, retries transient failures, and
  releases the reserved credit when processing cannot complete.
- The worker downloads private artifacts itself, validates file signatures, extracts bounded
  PDF/PPTX text, transcribes the uploaded video, records AI cost telemetry, and saves the report
  through service-role-only settlement functions.
- A successful submission starts one durable job after the `202` response, so founders do not wait
  on generation. `vercel.json` also runs `/api/jobs/process` daily as a Hobby-plan reconciliation
  fallback. Higher-volume production can increase that cadence after upgrading Vercel.
- Valuation output is intentionally presented as an estimated practice range
  with assumptions and confidence, not financial advice.
- Billing and premium UI stay disabled until `NEXT_PUBLIC_BILLING_ENABLED` and
  `NEXT_PUBLIC_PREMIUM_ENABLED` are explicitly enabled after webhook testing.
- Deploy in two phases: apply pending Supabase migrations, verify the preview purchase and
  webhook path, then promote that exact Vercel artifact and enable the production flags.
