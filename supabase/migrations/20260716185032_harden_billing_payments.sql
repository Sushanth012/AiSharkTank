create index billing_payments_grant_idx
  on public.billing_payments(grant_id);

create policy "Client roles cannot access billing payments"
  on public.billing_payments for all to anon, authenticated
  using (false) with check (false);
