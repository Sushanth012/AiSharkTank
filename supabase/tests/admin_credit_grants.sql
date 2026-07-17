begin;

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '30000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'admin-credit-test@example.com', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

set local role service_role;

select public.grant_admin_credits(
  '30000000-0000-0000-0000-000000000001',
  5,
  'admin:30000000-0000-0000-0000-000000000001:30000000-0000-4000-8000-000000000002',
  '30000000-0000-0000-0000-000000000001',
  'service role regression test'
);

do $$
declare
  v_balance integer;
begin
  select sum(remaining_credits)::integer into v_balance
  from public.credit_grants
  where user_id = '30000000-0000-0000-0000-000000000001';

  if v_balance <> 5 then
    raise exception 'Expected five admin credits, got %', v_balance;
  end if;
end $$;

rollback;

begin;

do $$
begin
  if has_function_privilege(
    'authenticated',
    'public.grant_admin_credits(uuid,integer,text,uuid,text)',
    'execute'
  ) or has_function_privilege(
    'anon',
    'public.grant_admin_credits(uuid,integer,text,uuid,text)',
    'execute'
  ) then
    raise exception 'A client role can execute the admin credit function';
  end if;

  if not has_function_privilege(
    'service_role',
    'private.grant_admin_credits(uuid,integer,text,uuid,text)',
    'execute'
  ) then
    raise exception 'service_role cannot execute the private admin credit helper';
  end if;
end $$;

rollback;
