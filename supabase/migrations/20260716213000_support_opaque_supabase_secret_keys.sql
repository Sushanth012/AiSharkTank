-- Supabase's opaque sb_secret_* keys assume the service_role database role but
-- do not carry the legacy request.jwt.claim.role setting. These public entry
-- points remain executable only by service_role and normalize that legacy GUC
-- for the existing, defense-in-depth private function checks.
--
-- Forward rollback: replace these wrappers with their prior SQL-language
-- definitions after reverting the deployment to a legacy service-role JWT.

create or replace function public.process_stripe_fulfillment_event(
  p_event_id text,
  p_event_type text,
  p_object_id text,
  p_livemode boolean,
  p_user_id uuid,
  p_source public.credit_source,
  p_quantity integer,
  p_external_ref text,
  p_payment_intent_id text,
  p_amount_paid integer,
  p_currency text,
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return private.process_stripe_fulfillment_event(
    p_event_id, p_event_type, p_object_id, p_livemode, p_user_id, p_source,
    p_quantity, p_external_ref, p_payment_intent_id, p_amount_paid, p_currency,
    p_expires_at, p_metadata
  );
end;
$$;

create or replace function public.reconcile_stripe_credit_reversal(
  p_event_id text,
  p_event_type text,
  p_object_id text,
  p_livemode boolean,
  p_payment_intent_id text,
  p_refunded_amount integer,
  p_disputed boolean,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return private.reconcile_stripe_credit_reversal(
    p_event_id, p_event_type, p_object_id, p_livemode, p_payment_intent_id,
    p_refunded_amount, p_disputed, p_metadata
  );
end;
$$;

create or replace function public.claim_pitch_job()
returns public.pitch_jobs
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return private.claim_pitch_job();
end;
$$;

create or replace function public.heartbeat_pitch_job(p_job_id uuid, p_claim_token uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return private.heartbeat_pitch_job(p_job_id, p_claim_token);
end;
$$;

create or replace function public.retry_or_fail_pitch_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean default true
)
returns public.job_status
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return private.retry_or_fail_pitch_job(
    p_job_id, p_claim_token, p_error_code, p_error_message, p_retryable
  );
end;
$$;

create or replace function public.complete_claimed_pitch_job(
  p_job_id uuid,
  p_claim_token uuid,
  p_report_id uuid,
  p_content jsonb,
  p_recommendation text,
  p_overall_score integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return private.complete_claimed_pitch_job(
    p_job_id, p_claim_token, p_report_id, p_content, p_recommendation, p_overall_score
  );
end;
$$;

create or replace function public.reconcile_stale_pitch_jobs(
  p_stale_seconds integer default 600,
  p_limit integer default 50
)
returns table(requeued integer, dead_lettered integer)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return query
    select * from private.reconcile_stale_pitch_jobs(p_stale_seconds, p_limit);
end;
$$;

revoke all on function public.process_stripe_fulfillment_event(
  text, text, text, boolean, uuid, public.credit_source, integer, text, text,
  integer, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.reconcile_stripe_credit_reversal(
  text, text, text, boolean, text, integer, boolean, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.claim_pitch_job() from public, anon, authenticated, service_role;
revoke all on function public.heartbeat_pitch_job(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.retry_or_fail_pitch_job(uuid, uuid, text, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_claimed_pitch_job(uuid, uuid, uuid, jsonb, text, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.reconcile_stale_pitch_jobs(integer, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.process_stripe_fulfillment_event(
  text, text, text, boolean, uuid, public.credit_source, integer, text, text,
  integer, text, timestamptz, jsonb
) to service_role;
grant execute on function public.reconcile_stripe_credit_reversal(
  text, text, text, boolean, text, integer, boolean, jsonb
) to service_role;
grant execute on function public.claim_pitch_job() to service_role;
grant execute on function public.heartbeat_pitch_job(uuid, uuid) to service_role;
grant execute on function public.retry_or_fail_pitch_job(uuid, uuid, text, text, boolean)
  to service_role;
grant execute on function public.complete_claimed_pitch_job(uuid, uuid, uuid, jsonb, text, integer)
  to service_role;
grant execute on function public.reconcile_stale_pitch_jobs(integer, integer)
  to service_role;

alter view public.entitlement_summary set (security_invoker = true);
