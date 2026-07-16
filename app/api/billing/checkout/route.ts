import { NextResponse } from "next/server";
import { billingEnabled } from "@/lib/config";
import { getConfiguredOffer, offerIdSchema } from "@/lib/billing/catalog";
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
    return NextResponse.json({ error: "Sign in before purchasing credits." }, { status: 401 });
  }

  const parsed = offerIdSchema.safeParse((await request.json()).offerId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Unknown billing offer." }, { status: 400 });
  }

  const offer = getConfiguredOffer(parsed.data);
  if (!offer) {
    return NextResponse.json({ error: "This offer is not configured." }, { status: 503 });
  }

  const customerId = await getOrCreateStripeCustomer(user);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const metadata = { supabase_user_id: user.id, offer_id: offer.id };

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: user.id,
    mode: offer.mode,
    line_items: [{ price: offer.priceId, quantity: 1 }],
    metadata,
    ...(offer.mode === "subscription"
      ? { subscription_data: { metadata } }
      : { payment_intent_data: { metadata } }),
    allow_promotion_codes: false,
    success_url: `${appUrl}/dashboard?checkout=success`,
    cancel_url: `${appUrl}/dashboard?checkout=cancelled`
  });

  if (!session.url) {
    return NextResponse.json({ error: "Stripe did not return a checkout URL." }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
}
