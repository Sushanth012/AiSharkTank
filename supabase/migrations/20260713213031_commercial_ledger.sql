do $$
begin
  create type public.pitch_tier as enum ('basic', 'premium');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.credit_source as enum ('subscription', 'pitch_pack', 'addon_pack', 'adjustment');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.reservation_status as enum ('reserved', 'consumed', 'released');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.job_status as enum ('queued', 'processing', 'complete', 'failed', 'dead_letter');
exception when duplicate_object then null;
end $$;

alter table public.submissions
  add column pitch_tier public.pitch_tier not null default 'basic';

create table public.user_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  credit_debt integer not null default 0 check (credit_debt >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_price_id text not null,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source public.credit_source not null,
  original_credits integer not null check (original_credits > 0),
  remaining_credits integer not null check (remaining_credits >= 0),
  external_ref text not null,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source, external_ref),
  check (remaining_credits <= original_credits)
);

create table public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null unique references public.submissions(id) on delete cascade,
  tier public.pitch_tier not null,
  grant_id uuid references public.credit_grants(id) on delete restrict,
  status public.reservation_status not null default 'reserved',
  reserved_at timestamptz not null default now(),
  settled_at timestamptz,
  release_reason text,
  check ((tier = 'basic' and grant_id is null) or (tier = 'premium' and grant_id is not null))
);

create unique index one_lifetime_free_pitch_idx
  on public.credit_reservations(user_id)
  where tier = 'basic' and status in ('reserved', 'consumed');

create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  grant_id uuid references public.credit_grants(id) on delete restrict,
  reservation_id uuid references public.credit_reservations(id) on delete restrict,
  entry_type text not null check (entry_type in ('grant', 'reserve', 'release', 'debt', 'debt_payment', 'expiry', 'adjustment')),
  credit_delta integer not null default 0,
  debt_delta integer not null default 0,
  idempotency_key text not null unique,
  source_object_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (credit_delta <> 0 or debt_delta <> 0)
);

create table public.pitch_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  reservation_id uuid not null references public.credit_reservations(id) on delete restrict,
  attempt integer not null default 1 check (attempt > 0),
  status public.job_status not null default 'queued',
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  finished_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (submission_id, attempt)
);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null references public.submissions(id) on delete cascade,
  job_id uuid references public.pitch_jobs(id) on delete set null,
  route text not null check (route in ('basic', 'premium_evaluator', 'premium_synthesis')),
  provider text not null,
  model text not null,
  prompt_version text not null,
  status text not null check (status in ('started', 'complete', 'failed', 'budget_exceeded')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  cached_input_tokens integer not null default 0 check (cached_input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(12, 8) not null default 0 check (estimated_cost_usd >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.stripe_events (
  event_id text primary key,
  event_type text not null,
  object_id text,
  livemode boolean not null,
  status text not null check (status in ('processing', 'complete', 'failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index credit_grants_user_expiry_idx
  on public.credit_grants(user_id, expires_at, created_at)
  where remaining_credits > 0;
create index credit_ledger_user_created_idx on public.credit_ledger(user_id, created_at desc);
create index credit_reservations_user_created_idx on public.credit_reservations(user_id, reserved_at desc);
create index pitch_jobs_status_created_idx on public.pitch_jobs(status, created_at);
create index pitch_jobs_user_created_idx on public.pitch_jobs(user_id, created_at desc);
create index ai_runs_submission_created_idx on public.ai_runs(submission_id, created_at);

create trigger user_accounts_set_updated_at before update on public.user_accounts
  for each row execute function private.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions
  for each row execute function private.set_updated_at();
create trigger pitch_jobs_set_updated_at before update on public.pitch_jobs
  for each row execute function private.set_updated_at();

alter table public.user_accounts enable row level security;
alter table public.subscriptions enable row level security;
alter table public.credit_grants enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.pitch_jobs enable row level security;
alter table public.ai_runs enable row level security;
alter table public.stripe_events enable row level security;

grant select on public.user_accounts, public.subscriptions, public.credit_grants,
  public.credit_reservations, public.credit_ledger, public.pitch_jobs, public.ai_runs
  to authenticated;

create policy "Users can view their account" on public.user_accounts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can view their subscription" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can view their credit grants" on public.credit_grants
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can view their credit reservations" on public.credit_reservations
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can view their credit ledger" on public.credit_ledger
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can view their pitch jobs" on public.pitch_jobs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can view their AI runs" on public.ai_runs
  for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.reserve_pitch_entitlement(
  p_submission_id uuid,
  p_tier public.pitch_tier
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_reservation_id uuid := gen_random_uuid();
  v_grant_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.submissions
    where id = p_submission_id and user_id = v_user_id and status = 'queued'
  ) then
    raise exception 'Submission is not reservable' using errcode = 'P0001';
  end if;

  insert into public.user_accounts(user_id) values (v_user_id)
  on conflict (user_id) do nothing;

  if p_tier = 'basic' then
    insert into public.credit_reservations(id, user_id, submission_id, tier)
    values (v_reservation_id, v_user_id, p_submission_id, p_tier);
  else
    if (select credit_debt from public.user_accounts where user_id = v_user_id) > 0 then
      raise exception 'Outstanding credit debt must be repaid' using errcode = 'P0001';
    end if;

    select id into v_grant_id
    from public.credit_grants
    where user_id = v_user_id
      and remaining_credits > 0
      and (expires_at is null or expires_at > now())
    order by expires_at asc nulls last, created_at asc
    limit 1
    for update skip locked;

    if v_grant_id is null then
      raise exception 'No premium credits available' using errcode = 'P0001';
    end if;

    update public.credit_grants
      set remaining_credits = remaining_credits - 1
      where id = v_grant_id;

    insert into public.credit_reservations(id, user_id, submission_id, tier, grant_id)
    values (v_reservation_id, v_user_id, p_submission_id, p_tier, v_grant_id);

    insert into public.credit_ledger(
      user_id, grant_id, reservation_id, entry_type, credit_delta, idempotency_key
    ) values (
      v_user_id, v_grant_id, v_reservation_id, 'reserve', -1, 'reserve:' || v_reservation_id::text
    );
  end if;

  update public.submissions set pitch_tier = p_tier where id = p_submission_id;
  return v_reservation_id;
exception
  when unique_violation then
    raise exception 'Entitlement already reserved' using errcode = 'P0001';
end;
$$;

create or replace function public.settle_pitch_reservation(
  p_reservation_id uuid,
  p_outcome text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_reservation public.credit_reservations%rowtype;
begin
  if v_role <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_outcome not in ('consumed', 'released') then
    raise exception 'Invalid settlement outcome' using errcode = '22023';
  end if;

  select * into v_reservation from public.credit_reservations
    where id = p_reservation_id for update;

  if not found or v_reservation.status <> 'reserved' then
    return;
  end if;

  if p_outcome = 'released' and v_reservation.grant_id is not null then
    update public.credit_grants set remaining_credits = remaining_credits + 1
      where id = v_reservation.grant_id;
    insert into public.credit_ledger(
      user_id, grant_id, reservation_id, entry_type, credit_delta, idempotency_key, metadata
    ) values (
      v_reservation.user_id, v_reservation.grant_id, v_reservation.id, 'release', 1,
      'release:' || v_reservation.id::text,
      jsonb_build_object('reason', coalesce(p_reason, 'processing_failed'))
    ) on conflict (idempotency_key) do nothing;
  end if;

  update public.credit_reservations
    set status = p_outcome::public.reservation_status,
        settled_at = now(),
        release_reason = case when p_outcome = 'released' then p_reason else null end
    where id = p_reservation_id;
end;
$$;

create or replace function public.grant_paid_credits(
  p_user_id uuid,
  p_source public.credit_source,
  p_quantity integer,
  p_external_ref text,
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_grant_id uuid;
  v_existing uuid;
  v_quantity integer := p_quantity;
  v_subscription_balance integer;
begin
  if v_role <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_quantity <= 0 or p_source = 'adjustment' then
    raise exception 'Invalid paid credit grant' using errcode = '22023';
  end if;

  select id into v_existing from public.credit_grants
    where source = p_source and external_ref = p_external_ref;
  if v_existing is not null then
    return v_existing;
  end if;

  insert into public.user_accounts(user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  if p_source = 'subscription' then
    select coalesce(sum(remaining_credits), 0)::integer into v_subscription_balance
      from public.credit_grants
      where user_id = p_user_id and source = 'subscription'
        and remaining_credits > 0 and (expires_at is null or expires_at > now());
    v_quantity := least(p_quantity, greatest(0, 30 - v_subscription_balance));
  end if;

  if v_quantity = 0 then
    return null;
  end if;

  insert into public.credit_grants(
    user_id, source, original_credits, remaining_credits, external_ref, expires_at, metadata
  ) values (
    p_user_id, p_source, v_quantity, v_quantity, p_external_ref, p_expires_at, p_metadata
  ) returning id into v_grant_id;

  insert into public.credit_ledger(
    user_id, grant_id, entry_type, credit_delta, idempotency_key, source_object_id, metadata
  ) values (
    p_user_id, v_grant_id, 'grant', v_quantity, 'grant:' || p_source::text || ':' || p_external_ref,
    p_external_ref, p_metadata
  );
  return v_grant_id;
end;
$$;

create or replace view public.entitlement_summary
with (security_invoker = true)
as
select
  a.user_id,
  not exists (
    select 1 from public.credit_reservations r
    where r.user_id = a.user_id and r.tier = 'basic' and r.status in ('reserved', 'consumed')
  ) as free_pitch_available,
  coalesce((
    select sum(g.remaining_credits) from public.credit_grants g
    where g.user_id = a.user_id and g.remaining_credits > 0
      and (g.expires_at is null or g.expires_at > now())
  ), 0)::integer as premium_credits,
  a.credit_debt
from public.user_accounts a;

grant select on public.entitlement_summary to authenticated;

revoke all on function public.reserve_pitch_entitlement(uuid, public.pitch_tier) from public;
grant execute on function public.reserve_pitch_entitlement(uuid, public.pitch_tier) to authenticated;
revoke all on function public.settle_pitch_reservation(uuid, text, text) from public;
grant execute on function public.settle_pitch_reservation(uuid, text, text) to service_role;
revoke all on function public.grant_paid_credits(uuid, public.credit_source, integer, text, timestamptz, jsonb) from public;
grant execute on function public.grant_paid_credits(uuid, public.credit_source, integer, text, timestamptz, jsonb) to service_role;
