# Changelog

All notable changes to AI Shark Tank are documented here.

## [0.1.0.0] - 2026-07-16

### Added

- Launch-ready founder workspace, pricing, Checkout, Customer Portal, and premium pitch selection.
- Durable pitch processing with private artifact extraction, retries, reconciliation, and AI cost telemetry.
- Transactional paid-credit ledger with lifetime free use, rollover caps, refunds, disputes, and debt recovery.
- Responsive PitchTank visual system across marketing, authentication, workspace, submission, pricing, and reports.

### Changed

- Pitch submissions now reserve an entitlement before AI work and continue safely outside the request lifecycle.
- Premium reports use the full investor panel only when the database confirms an available paid credit.

### Fixed

- Stripe fulfillment is idempotent across webhook retries and rejects mismatched users, purchases, amounts, and live/test modes.
- Refunds and disputes remove unused credits first and preserve already-consumed value as auditable credit debt.
- Updated the transitive PostCSS version to a patched release.
