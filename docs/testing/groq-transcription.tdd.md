# Groq transcription TDD evidence

## Source and user journey

This change was derived from the launch task rather than a separate plan file.

As a founder, I want my pitch video transcribed through Groq Whisper so that PitchTank can process a free or premium rehearsal without requiring OpenAI transcription credits.

## Task report

### RED

- Command: `npm test -- lib/artifacts/extract.test.ts`
- Result: expected failure, with 3 failed and 6 passed tests.
- Evidence: the existing implementation constructed the client with the old `OPENAI_API_KEY`, omitted Groq's base URL, ignored the Groq model, and remained configured when only the old OpenAI key existed.
- Checkpoint: `e62f92f test: define Groq transcription provider contract`

### GREEN

- Command: `npm test -- lib/artifacts/extract.test.ts`
- Result: 1 test file passed; 9 tests passed.
- Evidence: the worker uses `GROQ_API_KEY`, defaults to `https://api.groq.com/openai/v1` and `whisper-large-v3-turbo`, honors endpoint/model overrides, rejects missing configuration, and rejects videos above 24 MB before creating a provider client.
- Checkpoint: `d7441ab feat: transcribe pitch videos with Groq Whisper`

### Regression verification

- `npm test`: 10 test files passed; 37 tests passed.
- `npm run typecheck`: passed with no TypeScript errors.
- `npm run build`: Next.js production build compiled, typechecked, generated all 12 static pages, and completed successfully.

## Test specification

| # | What is guaranteed | Test target | Type | Result |
|---|---|---|---|---|
| 1 | Groq's OpenAI-compatible URL and API key configure the transcription client | `transcribes video through Groq's OpenAI-compatible endpoint` | Unit | PASS |
| 2 | The default transcription model is `whisper-large-v3-turbo` | same test | Unit | PASS |
| 3 | Deployment-specific Groq URL and model overrides are honored | `honors custom Groq endpoint and transcription model settings` | Unit | PASS |
| 4 | Missing Groq configuration fails before any provider client is created | `fails safely when Groq transcription is not configured` | Unit | PASS |
| 5 | A video above 24 MB is rejected before a provider request | `rejects videos above Groq's 24 MB application limit before making a request` | Boundary/unit | PASS |
| 6 | Existing MP4/WebM signature and deck extraction protections remain intact | `lib/artifacts/extract.test.ts` | Unit | PASS |

## Coverage and known gaps

`npm test -- --coverage` could not produce a coverage report because the repository does not include `@vitest/coverage-v8`. No dependency was silently installed during launch verification. All 37 existing tests pass, but a numeric coverage percentage is therefore unavailable.

Vercel confirms the Groq, DeepSeek, Stripe, and Supabase variable names are present. Sensitive values cannot be exported from Vercel for local live-provider probes. A production free-pitch smoke test remains necessary after deployment. Stripe checkout must remain disabled until the three `STRIPE_PRICE_*` variables are added and sandbox webhook delivery succeeds.

## Merge evidence

- RED commit: `e62f92f`
- GREEN commit: `d7441ab`
- The two checkpoints are preserved on the feature branch and summarized here for any later squash merge.
