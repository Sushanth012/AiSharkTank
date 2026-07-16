# Three-minute pitch video limit — TDD evidence

## Source and user journey

No source plan was provided. The journey was derived from the launch conversation:

> As a founder, I want the upload form to stop pitches longer than three minutes so that my demo stays concise and below the transcription provider's file limit.

## RED → GREEN report

- **RED:** `pnpm test -- lib/uploads/video-duration.test.ts` failed because `./video-duration` did not exist. This proved the new boundary test was executing before the validator was implemented.
- **GREEN:** The same command passed all 3 tests after adding the validator.
- **Regression:** `pnpm test` passed 10 test files and 33 tests.
- **Build:** `pnpm typecheck` and `pnpm build` passed.
- **Rendered UI:** `GET http://localhost:3000/new` returned 200 and contained both the pitch form and the new `2 minutes recommended; 3 minutes and 24 MB maximum` guidance.

## Test specification

| # | What is guaranteed | Test or command | Type | Result |
|---|---|---|---|---|
| 1 | A video exactly three minutes long is accepted | `video-duration.test.ts: accepts a pitch at the three-minute boundary` | Unit | PASS |
| 2 | A video even slightly over three minutes is rejected with clear copy | `video-duration.test.ts: rejects a pitch longer than three minutes` | Unit | PASS |
| 3 | Unreadable video metadata produces an actionable MP4 export message | `video-duration.test.ts: rejects unreadable video metadata` | Unit | PASS |
| 4 | The complete existing test suite remains green | `pnpm test` | Regression | PASS |
| 5 | The production application compiles and prerenders | `pnpm typecheck && pnpm build` | Integration | PASS |

## Coverage and known gaps

`pnpm exec vitest run lib/uploads/video-duration.test.ts --coverage` could not run because this repository does not install `@vitest/coverage-v8`. The new pure validator has full branch coverage by inspection: valid boundary, over-limit, and invalid metadata are all exercised. Browser metadata extraction is platform behavior and is verified through integration in the upload form rather than mocked DOM internals.

The three-minute rule is enforced in the browser before upload. The server continues to enforce the independent 24 MB hard limit; authoritative server-side duration inspection would require adding a media parser or transcoding service.

## Merge evidence

- RED checkpoint: `da46d86 test: define three-minute pitch video limit`
- GREEN checkpoint: `a919e0f feat: enforce three-minute pitch videos`
