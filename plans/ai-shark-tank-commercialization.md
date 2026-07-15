# AI Shark Tank Commercialization Blueprint

## Objective

Turn the existing authenticated pitch-review MVP into a deployable, profitable SaaS using Supabase for identity/data/storage, Stripe for one-time and recurring billing, DeepSeek-compatible model routing for AI generation, and Vercel for hosting.

## Product contract

- Free: one lifetime basic pitch per user.
- Pitch Pack: $7.99 one-time for five premium pitch credits.
- Builder: $9.99/month for 15 premium credits per paid billing period; subscription credits roll over to a maximum balance of 30.
- Add-on Pack: $4.99 one-time for five premium credits; pack credits expire after 12 months.
- A credit is reserved before processing and consumed only when a report completes. Failed processing releases the reservation. A revision is a new pitch run and consumes another credit.
- Basic reports use one efficient model call. Premium reports can use five specialist evaluations plus one synthesis call, guarded by a per-run budget.

## Invariants

- Stripe events and credit grants are idempotent.
- Users can only read and mutate their own application data.
- Secret/service-role keys never enter browser bundles.
- Every balance change is represented by an immutable ledger entry.
- A report cannot be completed without a corresponding entitlement consumption or the lifetime free grant.
- Model names, token prices, prompt versions, and per-run budgets are configuration, not scattered literals.
- Production schema changes are forward-only migration files.

## Dependency graph

```text
1. Tooling and baseline migration
   `-- 2. Commercial schema and entitlement service
         |-- 3. Artifact ingestion
         |     `-- 5. Durable job orchestration
         |-- 4. AI provider and cost telemetry
         |     `-- 5. Durable job orchestration
         `-- 6. Stripe catalog, Checkout, Portal, and fulfillment

2 + 3 + 4 + 5 + 6 -> 7. Account/submission UI -> 8. Preview deployment and smoke tests
```

## Step 1: Tooling, baseline migration, and security

Context: The connected Supabase project is healthy but has no public tables or migration history. The repo contains only `supabase/schema.sql`; first capture the existing MVP as a baseline migration, then apply commercial changes additively. Treat `schema.sql` as a generated fresh-install snapshot rather than an independent source of truth.

Tasks:

- Pin runtime dependencies, add a test runner, and define repeatable build/type/test commands.
- Create a baseline migration containing submissions, reports, storage buckets, and ownership policies.
- Create a separate additive migration for profiles/customer mapping, subscriptions, credit grants, credit ledger, processed Stripe events, durable jobs, and AI run telemetry.
- Extend submissions additively with pitch tier and processing metadata.
- Add indexes for ownership and RLS predicates.
- Enable RLS on every public table and use ownership predicates with `(select auth.uid())`.
- Keep privileged fulfillment functions in a private schema, pin `search_path`, revoke default execution, and grant only the service role where necessary.
- Seed product configuration in application code; Stripe Price IDs remain environment variables.

Verification:

- Apply migration to the connected empty project.
- Query information schema for all expected tables and RLS flags.
- Run Supabase security and performance advisors.

Rollback: Before production traffic exists, a forward cleanup migration may remove the new commercial tables. After traffic exists, use additive corrections only and preserve the ledger.

Exit criteria: Schema exists in source and Supabase, advisors have no unaddressed critical findings, and generated TypeScript types succeed.

## Step 2: Commercial schema and entitlement service

Context: Credits require concurrency-safe reservation and idempotent settlement. Browser code must not directly grant balances.

Tasks:

- Implement database operations for lifetime free use, paid-credit reservation, consumption, release, subscription rollover cap, and pack expiry.
- Record a stable idempotency key for every grant and adjustment.
- Expose a read-only balance summary to authenticated users.
- Keep pack balances outside the subscription rollover cap. At renewal, grant `min(15, 30 - current subscription balance)`.
- Reserve the earliest-expiring paid lot first. A reserved lot may settle after its expiry, while stale reservations are released after a defined TTL.
- Treat refunds and disputes as compensating ledger entries; allow a negative balance when already-consumed value is reversed and block new premium work until it is repaid.

Verification:

- Simulate duplicate grant events and confirm one ledger effect.
- Simulate two concurrent reservations against one remaining credit and confirm only one succeeds.
- Confirm failed processing restores the available balance.

Rollback: Disable checkout entry points; do not delete ledger history. Correct balances through compensating ledger entries.

Exit criteria: All entitlement state transitions are transactional, auditable, and covered by tests or database verification queries.

## Step 3: Artifact ingestion

Context: Uploaded media is currently stored but not processed. Premium evaluation must not rely on optional pasted text.

Tasks:

- Verify storage object ownership and existence server-side; never trust a path prefix alone.
- Validate signatures, MIME, size, video duration, and archive/decompression limits.
- Transcribe audio and extract bounded text from PDF/PPTX decks.
- Persist extraction status, errors, and cost telemetry without logging pitch content.
- Define source-media retention and delete source video after successful extraction by default, while preserving user-controlled deletion.

Verification: Exercise malformed, oversized, cross-user, missing-object, and decompression-bomb-like fixtures. Every failure must release its reservation.

Rollback: Disable automated extraction and retain the transcript override behind an internal testing flag.

Exit criteria: The worker receives verified, bounded text inputs and no longer depends on client-asserted storage ownership.

## Step 4: Cost-aware AI provider layer

Context: The MVP currently uses one OpenAI call and falls back to demo content on any parse error. Introduce an OpenAI-compatible provider abstraction so DeepSeek can be selected without coupling the report domain to one vendor.

Tasks:

- Define basic and premium routes with environment-configured model IDs, defaulting to efficient and reasoning-capable DeepSeek models.
- Add Zod schemas for the complete report and specialist evaluation output.
- Add narrow retries for rate limits, timeouts, and server errors only.
- Track input/output tokens, estimated cost, latency, model, prompt version, route, and status in `ai_runs`.
- Enforce per-run token and estimated-dollar budgets before follow-on calls.
- Preserve demo mode when no AI key is configured, but return explicit generation errors in configured production mode.

Verification:

- Type-check both routes.
- Unit-test model selection, cost calculation, schema rejection, and retry classification.
- Run one basic sandbox generation and inspect telemetry before enabling premium fan-out.

Rollback: Set the provider route to the existing OpenAI-compatible endpoint or disable premium fan-out through configuration.

Exit criteria: Basic generation is validated and observable; premium orchestration cannot exceed its configured call or cost ceiling.

## Step 5: Durable job orchestration

Context: Premium fan-out cannot safely run inside the submission request. The API must return after durable enqueueing.

Tasks:

- Add an idempotent job keyed by submission and attempt.
- Submission API authenticates, validates, reserves, enqueues, and returns `202`.
- Worker claims atomically, heartbeats, caps attempts, and settles the reservation transactionally.
- Add dead-letter state, reservation TTL, and reconciliation for stale jobs/reservations.
- UI polls or subscribes to status instead of holding the generation request open.

Verification: Simulate worker timeout before and after report persistence and confirm retry does not duplicate a report or consume twice.

Rollback: Pause job claiming while reconciliation and lifecycle webhooks remain active.

Exit criteria: A terminated request or worker cannot strand or double-consume a credit.

## Step 6: Stripe Checkout and lifecycle

Context: Stripe is connected to the `AiSharkTank sandbox`. Use hosted Checkout for PCI scope reduction, Billing for Builder, and one-time Checkout for packs.

Tasks:

- Create sandbox Products and Prices with stable lookup keys and product metadata.
- Add server-only Stripe customer creation, authenticated checkout route, and Customer Portal route.
- Restrict accepted purchases to the server-side product catalog; never accept arbitrary client price IDs.
- Create a raw-body webhook endpoint with signature validation.
- Use an event-authority matrix: Checkout completion maps customer/subscription ownership only; one-time packs grant after confirmed paid settlement; subscription credits grant only from a qualifying paid invoice.
- Filter currency, mode, price, and invoice billing reason. Never fulfill from a success redirect.
- Process mapping, paid invoices, subscription updates/deletion, refunds, and disputes idempotently, including out-of-order event recovery from canonical Stripe state.
- Store Stripe customer/subscription IDs and event IDs; grant credits only after paid/settled events.

Verification:

- Complete one test-mode pack purchase and one Builder subscription.
- Replay webhook events and confirm no duplicate credits.
- Open the Customer Portal and cancel the test subscription.

Rollback: Deactivate sandbox Prices and remove checkout links. Existing ledger entries remain; any correction is compensating.

Exit criteria: Sandbox purchases result in exactly one entitlement grant and the user can manage the subscription.

## Step 7: Submission and account experience

Context: Submission generation is currently synchronous and generates before authentication/storage in one path. Move entitlement checks ahead of expensive AI work and make pitch tier explicit.

Tasks:

- Show free and premium eligibility on the dashboard and new-pitch page.
- Let users choose basic/free or premium when entitled.
- Authenticate, validate storage ownership, reserve entitlement, then run generation.
- Mark submissions processing/complete/failed and consume or release reservations accordingly.
- Add pricing cards and checkout buttons for the three paid offers.
- Keep billing and premium UI behind disabled feature flags until signed webhook fulfillment is verified.
- Make errors actionable and never silently substitute demo output when production AI is configured.

Verification:

- Test unauthenticated, free-first-use, free-repeat, paid-success, paid-failure, and insufficient-credit paths.
- Confirm uploaded artifacts remain private and deletions still remove files.

Rollback: Hide paid pitch selection and retain free/basic mode while billing or premium processing is disabled.

Exit criteria: No paid AI generation starts without a valid reservation, and users can understand their current balance and next action.

## Step 8: Verification and deployment

Context: The Vercel team already contains project `ai-shark-tank`. Deploy a preview first, validate the same artifact, then promote only after the database and webhook endpoint are ready.

Tasks:

- Pin dependency versions and commit the lockfile changes.
- Run build, TypeScript, lint if configured, tests, secret scan, and diff review.
- Configure preview environment variables and feature flags without exposing secret values.
- Deploy a Vercel preview and run authenticated smoke tests.
- Configure the Stripe webhook to the deployed route, then replay test events.
- Promote the verified preview only with explicit production readiness.

Verification:

- `pnpm build`
- `pnpm typecheck`
- test suite and targeted database checks
- Vercel build/runtime error scan
- Supabase security/performance advisors

Rollback: Use expand/migrate/contract compatibility. Disable new Checkout and pause premium jobs while keeping lifecycle webhooks active. A Vercel rollback is allowed only after verifying the prior build against the expanded schema.

Exit criteria: Preview is ready, core purchase-to-credit-to-report flow passes, and production promotion has a documented rollback point.

## Plan mutation protocol

- Split a step when it changes more than one independently deployable concern.
- Insert security or data-repair work before downstream features that depend on it.
- Never skip an invariant; document any deferred verification and the exact blocker.
- Record pricing changes in the product contract and update Stripe metadata plus application catalog together.
