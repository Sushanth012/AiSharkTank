begin;

do $$
declare
  function_name text;
  function_oid regprocedure;
begin
  foreach function_name in array array[
    'private.grant_paid_credits(uuid,public.credit_source,integer,text,timestamptz,jsonb)',
    'private.process_stripe_fulfillment_event(text,text,text,boolean,uuid,public.credit_source,integer,text,text,integer,text,timestamptz,jsonb)',
    'private.reconcile_stripe_credit_reversal(text,text,text,boolean,text,integer,boolean,jsonb)'
  ] loop
    function_oid := function_name::regprocedure;

    if pg_get_functiondef(function_oid::oid) like '%request.jwt.claim.role%' then
      raise exception '% still requires the legacy service-role JWT claim', function_name;
    end if;

    if not has_function_privilege('service_role', function_oid, 'EXECUTE') then
      raise exception 'service_role cannot execute %', function_name;
    end if;

    if has_function_privilege('authenticated', function_oid, 'EXECUTE')
      or has_function_privilege('anon', function_oid, 'EXECUTE')
      or has_function_privilege('public', function_oid, 'EXECUTE')
    then
      raise exception '% is executable by a client role', function_name;
    end if;
  end loop;
end $$;

rollback;
