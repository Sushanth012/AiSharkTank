alter function public.reserve_pitch_entitlement(uuid, public.pitch_tier) set schema private;
alter function public.settle_pitch_reservation(uuid, text, text) set schema private;
alter function public.grant_paid_credits(uuid, public.credit_source, integer, text, timestamptz, jsonb) set schema private;

revoke all on function private.reserve_pitch_entitlement(uuid, public.pitch_tier)
  from public, anon, authenticated, service_role;
revoke all on function private.settle_pitch_reservation(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.grant_paid_credits(uuid, public.credit_source, integer, text, timestamptz, jsonb)
  from public, anon, authenticated, service_role;

grant usage on schema private to authenticated, service_role;
grant execute on function private.reserve_pitch_entitlement(uuid, public.pitch_tier) to authenticated;
grant execute on function private.settle_pitch_reservation(uuid, text, text) to service_role;
grant execute on function private.grant_paid_credits(uuid, public.credit_source, integer, text, timestamptz, jsonb)
  to service_role;

create function public.reserve_pitch_entitlement(
  p_submission_id uuid,
  p_tier public.pitch_tier
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.reserve_pitch_entitlement(p_submission_id, p_tier);
$$;

create function public.settle_pitch_reservation(
  p_reservation_id uuid,
  p_outcome text,
  p_reason text default null
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.settle_pitch_reservation(p_reservation_id, p_outcome, p_reason);
$$;

create function public.grant_paid_credits(
  p_user_id uuid,
  p_source public.credit_source,
  p_quantity integer,
  p_external_ref text,
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.grant_paid_credits(
    p_user_id, p_source, p_quantity, p_external_ref, p_expires_at, p_metadata
  );
$$;

revoke all on function public.reserve_pitch_entitlement(uuid, public.pitch_tier)
  from public, anon, authenticated, service_role;
revoke all on function public.settle_pitch_reservation(uuid, text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.grant_paid_credits(uuid, public.credit_source, integer, text, timestamptz, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.reserve_pitch_entitlement(uuid, public.pitch_tier) to authenticated;
grant execute on function public.settle_pitch_reservation(uuid, text, text) to service_role;
grant execute on function public.grant_paid_credits(uuid, public.credit_source, integer, text, timestamptz, jsonb)
  to service_role;

create policy "Client roles cannot access Stripe events"
  on public.stripe_events for all to anon, authenticated
  using (false) with check (false);

create index ai_runs_job_idx on public.ai_runs(job_id);
create index ai_runs_user_idx on public.ai_runs(user_id);
create index credit_ledger_grant_idx on public.credit_ledger(grant_id);
create index credit_ledger_reservation_idx on public.credit_ledger(reservation_id);
create index credit_reservations_grant_idx on public.credit_reservations(grant_id);
create index pitch_jobs_reservation_idx on public.pitch_jobs(reservation_id);
