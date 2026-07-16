begin;

do $$
declare
  function_name text;
  function_oid regprocedure;
begin
  foreach function_name in array array[
    'public.process_stripe_fulfillment_event(text,text,text,boolean,uuid,public.credit_source,integer,text,text,integer,text,timestamptz,jsonb)',
    'public.reconcile_stripe_credit_reversal(text,text,text,boolean,text,integer,boolean,jsonb)',
    'public.claim_pitch_job()',
    'public.heartbeat_pitch_job(uuid,uuid)',
    'public.retry_or_fail_pitch_job(uuid,uuid,text,text,boolean)',
    'public.complete_claimed_pitch_job(uuid,uuid,uuid,jsonb,text,integer)',
    'public.reconcile_stale_pitch_jobs(integer,integer)'
  ] loop
    function_oid := function_name::regprocedure;

    if pg_get_functiondef(function_oid::oid)
      not like '%set_config(''request.jwt.claim.role'', ''service_role'', true)%'
    then
      raise exception '% does not normalize opaque secret-key authorization', function_name;
    end if;

    if not has_function_privilege('service_role', function_oid, 'EXECUTE') then
      raise exception 'service_role cannot execute %', function_name;
    end if;

    if has_function_privilege('authenticated', function_oid, 'EXECUTE')
      or has_function_privilege('anon', function_oid, 'EXECUTE')
    then
      raise exception '% is executable by a client role', function_name;
    end if;
  end loop;
end $$;

do $$
begin
  if not coalesce(
    (select c.reloptions @> array['security_invoker=true']
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = 'entitlement_summary'),
    false
  ) then
    raise exception 'entitlement_summary must enforce underlying RLS as security invoker';
  end if;
end $$;

rollback;
