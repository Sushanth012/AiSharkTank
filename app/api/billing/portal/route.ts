import { NextResponse } from "next/server";
import { billingEnabled } from "@/lib/config";
import { getOrCreateStripeCustomer } from "@/lib/billing/customers";
import { getStripe } from "@/lib/stripe";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!billingEnabled) {
    return NextResponse.json({ error: "Billing is not available yet." }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const stripe = getStripe();
  if (!supabase || !stripe) {
    return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in to manage billing." }, { status: 401 });
  }

  const customerId = await getOrCreateStripeCustomer(user);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/dashboard`
  });

  return NextResponse.json({ url: session.url });
}
