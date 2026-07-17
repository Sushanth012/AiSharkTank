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
  v_rollover_cap integer;
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
    begin
      v_rollover_cap := coalesce((p_metadata->>'rollover_cap')::integer, 30);
    exception when invalid_text_representation then
      raise exception 'Invalid subscription rollover cap' using errcode = '22023';
    end;
    if v_rollover_cap < p_quantity then
      raise exception 'Subscription rollover cap cannot be below its monthly grant' using errcode = '22023';
    end if;

    select coalesce(sum(remaining_credits), 0)::integer into v_subscription_balance
      from public.credit_grants
      where user_id = p_user_id and source = 'subscription'
        and remaining_credits > 0 and (expires_at is null or expires_at > now());
    v_quantity := least(p_quantity, greatest(0, v_rollover_cap - v_subscription_balance));
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
