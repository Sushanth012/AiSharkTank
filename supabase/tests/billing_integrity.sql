begin;

select set_config('request.jwt.claim.role', 'service_role', true);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'billing-test-1@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'billing-test-2@example.com', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

select public.process_stripe_fulfillment_event(
  'evt_test_grant', 'checkout.session.completed', 'cs_test_1', false,
  '10000000-0000-0000-0000-000000000001', 'pitch_pack', 5, 'cs_test_1',
  'pi_test_1', 799, 'usd', now() + interval '12 months',
  '{"offer_id":"pitch_pack"}'::jsonb
);

do $$
begin
  begin
    perform public.process_stripe_fulfillment_event(
      'evt_test_mode_mismatch', 'checkout.session.completed', 'cs_test_1', true,
      '10000000-0000-0000-0000-000000000001', 'pitch_pack', 5, 'cs_test_1',
      'pi_test_1', 799, 'usd', now() + interval '12 months', '{}'::jsonb
    );
    raise exception 'Expected a live/test PaymentIntent mismatch to fail';
  exception
    when unique_violation then null;
  end;
end $$;

update public.credit_grants
set remaining_credits = 2
where external_ref = 'cs_test_1';

select public.reconcile_stripe_credit_reversal(
  'evt_test_refund', 'charge.refunded', 'ch_test_1', false,
  'pi_test_1', 799, false, '{}'::jsonb
);

do $$
declare
  v_remaining integer;
  v_debt integer;
begin
  select remaining_credits into v_remaining
  from public.credit_grants where external_ref = 'cs_test_1';
  select credit_debt into v_debt
  from public.user_accounts where user_id = '10000000-0000-0000-0000-000000000001';
  if v_remaining <> 0 or v_debt <> 3 then
    raise exception 'Expected full reversal to leave 0 credits and 3 debt, got % and %',
      v_remaining, v_debt;
  end if;
end $$;

select public.reconcile_stripe_credit_reversal(
  'evt_test_refund', 'charge.refunded', 'ch_test_1', false,
  'pi_test_1', 799, false, '{}'::jsonb
);

select public.reconcile_stripe_credit_reversal(
  'evt_test_reinstated', 'charge.dispute.funds_reinstated', 'ch_test_1', false,
  'pi_test_1', 0, false, '{}'::jsonb
);

do $$
declare
  v_remaining integer;
  v_debt integer;
  v_refund_entries integer;
begin
  select remaining_credits into v_remaining
  from public.credit_grants where external_ref = 'cs_test_1';
  select credit_debt into v_debt
  from public.user_accounts where user_id = '10000000-0000-0000-0000-000000000001';
  select count(*) into v_refund_entries
  from public.credit_ledger
  where idempotency_key = 'reversal:evt_test_refund';
  if v_remaining <> 2 or v_debt <> 0 or v_refund_entries <> 1 then
    raise exception 'Reinstatement or replay failed: remaining %, debt %, reversal rows %',
      v_remaining, v_debt, v_refund_entries;
  end if;
end $$;

select public.process_stripe_fulfillment_event(
  'evt_test_grant_2', 'checkout.session.completed', 'cs_test_2', false,
  '10000000-0000-0000-0000-000000000001', 'pitch_pack', 5, 'cs_test_2',
  'pi_test_2', 799, 'usd', now() + interval '12 months', '{}'::jsonb
);

update public.credit_grants set remaining_credits = 2 where external_ref = 'cs_test_1';
update public.credit_grants set remaining_credits = 0 where external_ref = 'cs_test_2';

select public.reconcile_stripe_credit_reversal(
  'evt_test_refund_1b', 'charge.refunded', 'ch_test_1', false,
  'pi_test_1', 799, false, '{}'::jsonb
);
select public.reconcile_stripe_credit_reversal(
  'evt_test_refund_2', 'charge.refunded', 'ch_test_2', false,
  'pi_test_2', 799, false, '{}'::jsonb
);
select public.reconcile_stripe_credit_reversal(
  'evt_test_reinstated_1b', 'charge.dispute.funds_reinstated', 'ch_test_1', false,
  'pi_test_1', 0, false, '{}'::jsonb
);

do $$
declare
  v_first_remaining integer;
  v_debt integer;
begin
  select remaining_credits into v_first_remaining
  from public.credit_grants where external_ref = 'cs_test_1';
  select credit_debt into v_debt
  from public.user_accounts where user_id = '10000000-0000-0000-0000-000000000001';
  if v_first_remaining <> 2 or v_debt <> 5 then
    raise exception 'Per-grant reinstatement failed: first remaining %, account debt %',
      v_first_remaining, v_debt;
  end if;
end $$;

select public.grant_paid_credits(
  '10000000-0000-0000-0000-000000000002', 'subscription', 25,
  'in_test_cap_1', null, '{}'::jsonb
);
select public.grant_paid_credits(
  '10000000-0000-0000-0000-000000000002', 'subscription', 15,
  'in_test_cap_2', null, '{}'::jsonb
);

do $$
declare
  v_balance integer;
begin
  select sum(remaining_credits)::integer into v_balance
  from public.credit_grants
  where user_id = '10000000-0000-0000-0000-000000000002'
    and source = 'subscription';
  if v_balance <> 30 then
    raise exception 'Subscription rollover cap failed: expected 30, got %', v_balance;
  end if;
end $$;

rollback;
