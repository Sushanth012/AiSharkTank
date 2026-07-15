create function private.process_stripe_credit_event(
  p_event_id text,
  p_event_type text,
  p_object_id text,
  p_livemode boolean,
  p_user_id uuid,
  p_source public.credit_source,
  p_quantity integer,
  p_external_ref text,
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
begin
  if v_role <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  insert into public.stripe_events(event_id, event_type, object_id, livemode, status)
    values (p_event_id, p_event_type, p_object_id, p_livemode, 'processing')
    on conflict (event_id) do nothing;

  select status into v_status from public.stripe_events
    where event_id = p_event_id for update;

  if v_status = 'complete' then
    return false;
  end if;

  perform private.grant_paid_credits(
    p_user_id, p_source, p_quantity, p_external_ref, p_expires_at, p_metadata
  );

  update public.stripe_events
    set status = 'complete', processed_at = now(), error_message = null
    where event_id = p_event_id;
  return true;
end;
$$;

revoke all on function private.process_stripe_credit_event(
  text, text, text, boolean, uuid, public.credit_source, integer, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
grant execute on function private.process_stripe_credit_event(
  text, text, text, boolean, uuid, public.credit_source, integer, text, timestamptz, jsonb
) to service_role;

create function public.process_stripe_credit_event(
  p_event_id text,
  p_event_type text,
  p_object_id text,
  p_livemode boolean,
  p_user_id uuid,
  p_source public.credit_source,
  p_quantity integer,
  p_external_ref text,
  p_expires_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.process_stripe_credit_event(
    p_event_id, p_event_type, p_object_id, p_livemode, p_user_id,
    p_source, p_quantity, p_external_ref, p_expires_at, p_metadata
  );
$$;

revoke all on function public.process_stripe_credit_event(
  text, text, text, boolean, uuid, public.credit_source, integer, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.process_stripe_credit_event(
  text, text, text, boolean, uuid, public.credit_source, integer, text, timestamptz, jsonb
) to service_role;
