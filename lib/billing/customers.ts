import "server-only";

import type { User } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function getOrCreateStripeCustomer(user: User) {
  const stripe = getStripe();
  const admin = createSupabaseAdminClient();

  if (!stripe || !admin) {
    throw new Error("Billing services are not configured.");
  }

  const { data: account, error: accountError } = await admin
    .from("user_accounts")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (accountError) {
    throw accountError;
  }

  if (account?.stripe_customer_id) {
    return account.stripe_customer_id;
  }

  const customer = await stripe.customers.create(
    {
      email: user.email,
      metadata: { supabase_user_id: user.id }
    },
    { idempotencyKey: `supabase-customer:${user.id}` }
  );

  const { error: upsertError } = await admin.from("user_accounts").upsert(
    {
      user_id: user.id,
      stripe_customer_id: customer.id
    },
    { onConflict: "user_id" }
  );

  if (upsertError) {
    throw upsertError;
  }

  return customer.id;
}
