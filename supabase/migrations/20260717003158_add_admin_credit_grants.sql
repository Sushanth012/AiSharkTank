create or replace function private.grant_admin_credits(
  p_user_id uuid,
  p_quantity integer,
  p_external_ref text,
  p_admin_user_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_grant_id uuid;
begin
  if v_role <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_quantity < 1 or p_quantity > 100 then
    raise exception 'Admin credit quantity must be between 1 and 100' using errcode = '22023';
  end if;
  if p_external_ref is null or p_external_ref !~ '^admin:[0-9a-f-]+:[0-9a-f-]+$' then
    raise exception 'Invalid admin credit reference' using errcode = '22023';
  end if;
  if length(coalesce(p_note, '')) > 240 then
    raise exception 'Admin credit note is too long' using errcode = '22023';
  end if;

  select id into v_grant_id
  from public.credit_grants
  where source = 'adjustment' and external_ref = p_external_ref;
  if v_grant_id is not null then
    return v_grant_id;
  end if;

  insert into public.user_accounts(user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  insert into public.credit_grants(
    user_id, source, original_credits, remaining_credits, external_ref, metadata
  ) values (
    p_user_id,
    'adjustment',
    p_quantity,
    p_quantity,
    p_external_ref,
    jsonb_build_object('kind', 'admin_grant', 'granted_by', p_admin_user_id, 'note', coalesce(p_note, ''))
  ) returning id into v_grant_id;

  insert into public.credit_ledger(
    user_id, grant_id, entry_type, credit_delta, idempotency_key, source_object_id, metadata
  ) values (
    p_user_id,
    v_grant_id,
    'adjustment',
    p_quantity,
    'admin-grant:' || p_external_ref,
    p_external_ref,
    jsonb_build_object('granted_by', p_admin_user_id, 'note', coalesce(p_note, ''))
  );
  return v_grant_id;
end;
$$;

create or replace function public.grant_admin_credits(
  p_user_id uuid,
  p_quantity integer,
  p_external_ref text,
  p_admin_user_id uuid,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return private.grant_admin_credits(p_user_id, p_quantity, p_external_ref, p_admin_user_id, p_note);
end;
$$;

revoke all on function private.grant_admin_credits(uuid, integer, text, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.grant_admin_credits(uuid, integer, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.grant_admin_credits(uuid, integer, text, uuid, text)
  to service_role;
