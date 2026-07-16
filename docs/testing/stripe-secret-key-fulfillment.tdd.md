# Stripe secret-key fulfillment TDD evidence

## User journey and production incident

As a founder, I want a successful Stripe pitch-pack purchase to grant the purchased premium pitch credits and show the balance in my workspace.

The Stripe PaymentIntent for the $7.99 pitch pack succeeded, but both webhook deliveries returned HTTP 500. Supabase Postgres and Data API logs identified the failure as `Service role required` from `process_stripe_fulfillment_event`. The project's new opaque `sb_secret_...` key authorizes service access but does not populate the legacy `request.jwt.claim.role` setting checked by the existing private billing and worker functions.

Before the repair, `stripe_events` and `credit_grants` were empty and `entitlement_summary` showed zero premium credits. The dashboard also did not query or display the entitlement balance.

## Task report

### RED

- Command: `npm test -- app/dashboard/page.test.tsx`
- Result: expected failure because the dashboard never queried `entitlement_summary`.
- Production SQL compatibility test: expected failure because the public server-only RPC entry point did not normalize opaque secret-key authorization for the protected private function.
- Checkpoints: `b84f463 test: reproduce missing credits and secret-key billing failure` and `f25d104 test: cover opaque secret-key RPC entry points`.

### GREEN

- Dashboard test: 1 test passed; the workspace queries `entitlement_summary` and renders the premium-pitch balance.
- Production SQL compatibility/security test: passed after migration `support_opaque_supabase_secret_keys` was applied.
- The migration normalizes the legacy role setting only inside RPC wrappers executable by `service_role`; `anon` and `authenticated` remain denied.
- The same repair covers Stripe fulfillment/reversal and protected pitch-worker entry points that share the legacy role check.
- `entitlement_summary` now uses `security_invoker` so reads enforce the querying user's RLS context.
- Implementation checkpoint: `184cab3 fix: fulfill credits with Supabase secret keys`.

### Regression verification

- `npm test`: 11 test files passed; 38 tests passed.
- `npm run typecheck`: passed with no TypeScript errors.
- `npm run build`: Next.js production build compiled, typechecked, generated all 12 static pages, and completed successfully.
- Supabase security advisor: no issue introduced by this migration. The only warning is the pre-existing leaked-password-protection setting.

## Test specification

| # | What is guaranteed | Test target | Type | Result |
|---|---|---|---|---|
| 1 | The workspace reads the authenticated account's entitlement summary | `app/dashboard/page.test.tsx` | Component | PASS |
| 2 | The workspace visibly labels the premium-pitch balance | `app/dashboard/page.test.tsx` | Component | PASS |
| 3 | Opaque Supabase secret keys can enter each protected server-only RPC | `supabase/tests/secret_key_billing_compatibility.sql` | Production SQL | PASS |
| 4 | Anonymous and authenticated clients cannot execute those RPCs | `supabase/tests/secret_key_billing_compatibility.sql` | Security | PASS |
| 5 | Entitlement reads use invoker security and remain subject to RLS | `supabase/tests/secret_key_billing_compatibility.sql` | Security | PASS |
| 6 | Existing application behavior remains intact | Full Vitest suite | Regression | PASS |

## Coverage and remaining operational step

`npm test -- --coverage` cannot produce a numeric report because the repository does not include `@vitest/coverage-v8`; no dependency was silently installed during incident repair.

The failed signed Stripe event still needs to be resent after the application deployment. Replaying the original event is preferred over manually inserting a grant because fulfillment is idempotent and preserves the Stripe event audit trail. After replay, verify a completed `stripe_events` row, a five-credit `credit_grants` row, and a total of five in `entitlement_summary`.

## Merge evidence

- RED commits: `b84f463`, `f25d104`
- GREEN commit: `184cab3`
- Production migration: `support_opaque_supabase_secret_keys`
