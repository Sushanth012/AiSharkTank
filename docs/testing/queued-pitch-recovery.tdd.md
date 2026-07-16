# Queued pitch recovery TDD evidence

## User journey

As a founder, I want a queued pitch to resume while I am checking its status so that a missed post-response worker does not leave my report waiting for the daily fallback.

## Production incident

The free pitch submitted at `2026-07-16 21:26:06 UTC` remained queued with zero attempts. Vercel logged that the post-response worker failed. The Supabase opaque-secret compatibility migration landed roughly one minute later, leaving the already-queued job healthy but unscheduled until the daily reconciliation cron.

## RED

- Command: `pnpm test -- "app/api/jobs/[id]/route.test.ts"`
- Result: 1 failed test because polling an owned queued job did not schedule the worker.
- Checkpoint: `e9edca5 test: reproduce queued pitch recovery failure`

## GREEN

- Command: `pnpm test -- "app/api/jobs/[id]/route.test.ts"`
- Result: 1 file passed; 2 tests passed.
- Guarantee: authenticated polling reschedules queued work, while processing work does not start a duplicate worker.
- Checkpoint: `97d53fc fix: retry queued pitches during status polling`

## Regression verification

- `pnpm test`: 12 files passed; 40 tests passed.
- `pnpm run typecheck`: passed.
- `pnpm run build`: Next.js production build compiled, typechecked, generated all 12 static pages, and completed successfully.

## Test specification

| # | What is guaranteed | Test target | Type | Result |
|---|---|---|---|---|
| 1 | Polling an authenticated user's queued job schedules one worker run | `app/api/jobs/[id]/route.test.ts` | API integration | PASS |
| 2 | Polling a processing job does not schedule duplicate work | `app/api/jobs/[id]/route.test.ts` | API integration | PASS |
| 3 | Existing pitch, billing, artifact, and report behavior remains intact | Full Vitest suite | Regression | PASS |

## Coverage and known gap

`pnpm test -- --coverage` could not generate a numeric coverage report because `@vitest/coverage-v8` is not installed. No dependency was added silently. The affected queued and non-queued branches both have direct tests.

## Operational follow-up

After deployment, the client must poll the queued job once to launch recovery. Premium submission remains controlled separately by the Vercel `NEXT_PUBLIC_PREMIUM_ENABLED` production flag.
