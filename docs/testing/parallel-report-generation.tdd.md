# Parallel report generation TDD evidence

## Source and user journeys

The journeys were derived from the launch reliability request in this task.

- A founder receives one complete report assembled from independently generated sections.
- A slow, truncated, malformed, or temporarily unavailable provider is retried without regenerating successful sibling sections.
- A terminal section failure cancels outstanding paid requests and does not trigger a full durable-job retry.
- YC mode receives its own focused evaluation section.
- Operators can inspect tokens, response length, finish reason, failure reason, and latency for every provider attempt.

## RED and GREEN evidence

| Guarantee | RED evidence | GREEN evidence |
|---|---|---|
| Premium sections start concurrently and combine into the existing report shape | `npm test -- --run lib/report-generator.test.ts` produced 4 failures before the split pipeline existed | Focused generator suite passes |
| Truncated, malformed JSON, provider errors, and timeouts retry only the failed section | Initial truncation/timeout tests failed; the SDK-like abort test exposed an `AbortError` race | Focused generator suite passes with abort-aware timeout and malformed-JSON cases |
| Telemetry failure never causes another paid completion | The telemetry-unavailable test rejected with `telemetry database unavailable` | Telemetry is best-effort and the completion count remains one per successful section |
| Terminal failures cancel siblings and retry backoff | Cancellation test initially observed zero aborted siblings; backoff test initially observed `panelCalls === 2` | Shared abort plus `Promise.allSettled` cancels both active calls and pending backoff |
| Durable worker does not rerun exhausted report generation | Retry-policy test initially failed to import the missing policy module | `retry-policy.test.ts` proves exhausted reports and invalid artifacts are terminal |
| Deterministic budget failures do not enter the durable retry loop | Budget test initially received `AiBudgetExceededError` directly | Preflight errors are wrapped as `ReportGenerationExhaustedError` before any provider call |
| DeepSeek structured sections preserve their output budget for JSON | Preview premium YC QA exhausted the 1,600/2,800-token caps in default thinking mode, returning `length`, empty content, and truncated JSON | DeepSeek requests explicitly disable thinking for bounded JSON; the request contract is covered by a focused test |

## Validation

- `npm test`: all repository tests pass.
- `npm run typecheck`: passes.
- `npm run build`: production Next.js build passes.
- Focused V8 coverage for `lib/report-generator.ts` and `lib/jobs/retry-policy.ts`: 90.09% statements, 89.58% functions, and 92.94% lines.

## Known coverage gap

Branch coverage is 69.8%. Most uncovered branches are legacy demo fallbacks and environment/provider selection paths that require module-level environment isolation. The changed provider, retry, cancellation, parsing, YC, budget, and telemetry paths are directly exercised.
