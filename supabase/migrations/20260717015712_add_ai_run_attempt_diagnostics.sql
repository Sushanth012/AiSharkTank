alter table public.ai_runs
  add column section text not null default 'legacy'
    check (section in ('legacy', 'core', 'panel', 'evidence', 'yc')),
  add column attempt_number integer not null default 1
    check (attempt_number >= 1),
  add column response_characters integer not null default 0
    check (response_characters >= 0),
  add column finish_reason text,
  add column failure_reason text;

comment on column public.ai_runs.section is
  'Independently generated report section for this provider attempt.';
comment on column public.ai_runs.attempt_number is
  'One-based retry number within the report section.';
comment on column public.ai_runs.response_characters is
  'Provider response length without storing the response body.';
comment on column public.ai_runs.failure_reason is
  'Sanitized failure category such as timeout, truncated, invalid_json, or provider_503.';
