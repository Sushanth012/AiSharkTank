alter table public.credit_ledger
  drop constraint if exists credit_ledger_entry_type_check;

alter table public.credit_ledger
  add constraint credit_ledger_entry_type_check
  check (entry_type in (
    'grant', 'reserve', 'release', 'debt', 'debt_payment', 'expiry',
    'adjustment', 'reversal', 'reinstatement'
  ));

create table public.billing_payments (
  payment_intent_id text primary key,
  livemode boolean not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  grant_id uuid references public.credit_grants(id) on delete restrict,
  external_ref text not null,
  amount_paid integer not null check (amount_paid > 0),
  currency text not null check (currency = lower(currency) and length(currency) = 3),
  created_at timestamptz not null default now()
);

create index billing_payments_user_created_idx
  on public.billing_payments(user_id, created_at desc);

alter table public.billing_payments enable row level security;
revoke all on table public.billing_payments from public, anon, authenticated;
grant select, insert, update on table public.billing_payments to service_role;

create or replace function private.grant_paid_credits(
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
  v_existing public.credit_grants%rowtype;
  v_quantity integer := p_quantity;
  v_subscription_balance integer;
begin
  if v_role <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_quantity <= 0 or p_source = 'adjustment' then
    raise exception 'Invalid paid credit grant' using errcode = '22023';
  end if;

  insert into public.user_accounts(user_id) values (p_user_id)
    on conflict (user_id) do nothing;

  perform 1 from public.user_accounts
    where user_id = p_user_id for update;

  select * into v_existing from public.credit_grants
    where source = p_source and external_ref = p_external_ref;
  if found then
    if v_existing.user_id <> p_user_id then
      raise exception 'Credit grant is already linked to a different user' using errcode = '23505';
    end if;
    return v_existing.id;
  end if;

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
    p_user_id, v_grant_id, 'grant', v_quantity,
    'grant:' || p_source::text || ':' || p_external_ref, p_external_ref, p_metadata
  );
  return v_grant_id;
end;
$$;

create or replace function private.process_stripe_fulfillment_event(
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
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_status text;
  v_event_livemode boolean;
  v_grant_id uuid;
  v_payment public.billing_payments%rowtype;
begin
  if v_role <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_payment_intent_id is null or p_amount_paid <= 0 or lower(p_currency) <> 'usd' then
    raise exception 'Invalid settled payment' using errcode = '22023';
  end if;

  insert into public.stripe_events(event_id, event_type, object_id, livemode, status)
    values (p_event_id, p_event_type, p_object_id, p_livemode, 'processing')
    on conflict (event_id) do nothing;

  select status, livemode into v_status, v_event_livemode from public.stripe_events
    where event_id = p_event_id for update;
  if v_event_livemode <> p_livemode then
    raise exception 'Stripe event mode does not match its original delivery' using errcode = '23505';
  end if;
  if v_status = 'complete' then
    return false;
  end if;

  v_grant_id := private.grant_paid_credits(
    p_user_id, p_source, p_quantity, p_external_ref, p_expires_at, p_metadata
  );

  insert into public.billing_payments(
    payment_intent_id, livemode, user_id, grant_id, external_ref, amount_paid, currency
  ) values (
    p_payment_intent_id, p_livemode, p_user_id, v_grant_id, p_external_ref, p_amount_paid, lower(p_currency)
  ) on conflict (payment_intent_id) do nothing;

  select * into v_payment from public.billing_payments
    where payment_intent_id = p_payment_intent_id;
  if v_payment.livemode <> p_livemode
    or v_payment.user_id <> p_user_id
    or v_payment.grant_id is distinct from v_grant_id
    or v_payment.external_ref <> p_external_ref
    or v_payment.amount_paid <> p_amount_paid
    or v_payment.currency <> lower(p_currency)
  then
    raise exception 'PaymentIntent is already linked to a different purchase' using errcode = '23505';
  end if;

  update public.stripe_events
    set status = 'complete', processed_at = now(), error_message = null
    where event_id = p_event_id;
  return true;
end;
$$;

create or replace function private.reconcile_stripe_credit_reversal(
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
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_status text;
  v_event_livemode boolean;
  v_payment public.billing_payments%rowtype;
  v_grant public.credit_grants%rowtype;
  v_debt integer;
  v_target integer;
  v_current integer;
  v_grant_debt integer;
  v_delta integer;
  v_credit_change integer := 0;
  v_debt_change integer := 0;
  v_restore integer;
begin
  if v_role <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_refunded_amount < 0 then
    raise exception 'Refund amount cannot be negative' using errcode = '22023';
  end if;

  insert into public.stripe_events(event_id, event_type, object_id, livemode, status)
    values (p_event_id, p_event_type, p_object_id, p_livemode, 'processing')
    on conflict (event_id) do nothing;

  select status, livemode into v_status, v_event_livemode from public.stripe_events
    where event_id = p_event_id for update;
  if v_event_livemode <> p_livemode then
    raise exception 'Stripe event mode does not match its original delivery' using errcode = '23505';
  end if;
  if v_status = 'complete' then
    return false;
  end if;

  select * into v_payment from public.billing_payments
    where payment_intent_id = p_payment_intent_id;
  if not found then
    raise exception 'PaymentIntent has not been fulfilled yet' using errcode = 'P0001';
  end if;
  if v_payment.livemode <> p_livemode then
    raise exception 'PaymentIntent belongs to a different Stripe mode' using errcode = '23505';
  end if;

  if v_payment.grant_id is null then
    update public.stripe_events
      set status = 'complete', processed_at = now(), error_message = null
      where event_id = p_event_id;
    return true;
  end if;

  select * into v_grant from public.credit_grants
    where id = v_payment.grant_id for update;
  select credit_debt into v_debt from public.user_accounts
    where user_id = v_payment.user_id for update;

  v_target := case
    when p_disputed then v_grant.original_credits
    else least(
      v_grant.original_credits,
      ceil(v_grant.original_credits::numeric * p_refunded_amount / v_payment.amount_paid)::integer
    )
  end;

  select
    coalesce(sum(-credit_delta + debt_delta), 0)::integer,
    coalesce(sum(debt_delta), 0)::integer
  into v_current, v_grant_debt
    from public.credit_ledger
    where grant_id = v_grant.id and entry_type in ('reversal', 'reinstatement');
  v_delta := v_target - v_current;

  if v_delta > 0 then
    v_credit_change := -least(v_delta, v_grant.remaining_credits);
    v_debt_change := v_delta + v_credit_change;
    update public.credit_grants
      set remaining_credits = remaining_credits + v_credit_change
      where id = v_grant.id;
    update public.user_accounts
      set credit_debt = credit_debt + v_debt_change
      where user_id = v_payment.user_id;
    insert into public.credit_ledger(
      user_id, grant_id, entry_type, credit_delta, debt_delta,
      idempotency_key, source_object_id, metadata
    ) values (
      v_payment.user_id, v_grant.id, 'reversal', v_credit_change, v_debt_change,
      'reversal:' || p_event_id, p_object_id,
      p_metadata || jsonb_build_object('target_reversal', v_target)
    );
  elsif v_delta < 0 then
    v_restore := -v_delta;
    v_debt_change := -least(v_restore, greatest(0, v_grant_debt));
    v_credit_change := v_restore + v_debt_change;
    update public.user_accounts
      set credit_debt = credit_debt + v_debt_change
      where user_id = v_payment.user_id;
    update public.credit_grants
      set remaining_credits = least(original_credits, remaining_credits + v_credit_change)
      where id = v_grant.id;
    insert into public.credit_ledger(
      user_id, grant_id, entry_type, credit_delta, debt_delta,
      idempotency_key, source_object_id, metadata
    ) values (
      v_payment.user_id, v_grant.id, 'reinstatement', v_credit_change, v_debt_change,
      'reinstatement:' || p_event_id, p_object_id,
      p_metadata || jsonb_build_object('target_reversal', v_target)
    );
  end if;

  update public.stripe_events
    set status = 'complete', processed_at = now(), error_message = null
    where event_id = p_event_id;
  return true;
end;
$$;

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
returns boolean language sql security invoker set search_path = ''
as $$
  select private.process_stripe_fulfillment_event(
    p_event_id, p_event_type, p_object_id, p_livemode, p_user_id, p_source,
    p_quantity, p_external_ref, p_payment_intent_id, p_amount_paid, p_currency,
    p_expires_at, p_metadata
  );
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
returns boolean language sql security invoker set search_path = ''
as $$
  select private.reconcile_stripe_credit_reversal(
    p_event_id, p_event_type, p_object_id, p_livemode, p_payment_intent_id,
    p_refunded_amount, p_disputed, p_metadata
  );
$$;

revoke all on function private.process_stripe_fulfillment_event(
  text, text, text, boolean, uuid, public.credit_source, integer, text, text,
  integer, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all on function private.reconcile_stripe_credit_reversal(
  text, text, text, boolean, text, integer, boolean, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.process_stripe_fulfillment_event(
  text, text, text, boolean, uuid, public.credit_source, integer, text, text,
  integer, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.reconcile_stripe_credit_reversal(
  text, text, text, boolean, text, integer, boolean, jsonb
) from public, anon, authenticated, service_role;

grant execute on function private.process_stripe_fulfillment_event(
  text, text, text, boolean, uuid, public.credit_source, integer, text, text,
  integer, text, timestamptz, jsonb
) to service_role;
grant execute on function private.reconcile_stripe_credit_reversal(
  text, text, text, boolean, text, integer, boolean, jsonb
) to service_role;
grant execute on function public.process_stripe_fulfillment_event(
  text, text, text, boolean, uuid, public.credit_source, integer, text, text,
  integer, text, timestamptz, jsonb
) to service_role;
grant execute on function public.reconcile_stripe_credit_reversal(
  text, text, text, boolean, text, integer, boolean, jsonb
) to service_role;
