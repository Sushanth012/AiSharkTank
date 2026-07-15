import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { billingOffers, findOfferByPriceId, getConfiguredOffer, offerIdSchema } from "@/lib/billing/catalog";
import { getStripe } from "@/lib/stripe";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const userIdSchema = z.string().uuid();

export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await request.text(), signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        await mapCheckoutOwnership(session);
        if (session.mode === "payment" && session.payment_status === "paid") {
          await fulfillPackCheckout(event, session);
        }
        break;
      }
      case "checkout.session.async_payment_succeeded":
        await mapCheckoutOwnership(event.data.object);
        await fulfillPackCheckout(event, event.data.object);
        break;
      case "invoice.paid":
        await fulfillSubscriptionInvoice(event, event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object);
        break;
      default:
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function mapCheckoutOwnership(session: Stripe.Checkout.Session) {
  const admin = requireAdmin();
  const userId = userIdSchema.parse(session.metadata?.supabase_user_id);
  if (session.client_reference_id !== userId) {
    throw new Error("Checkout ownership metadata does not match.");
  }

  const customerId = objectId(session.customer);
  if (!customerId) {
    throw new Error("Checkout Session has no Stripe customer.");
  }

  const { error } = await admin.from("user_accounts").upsert(
    { user_id: userId, stripe_customer_id: customerId },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

async function fulfillPackCheckout(event: Stripe.Event, session: Stripe.Checkout.Session) {
  const stripe = getStripe()!;
  const admin = requireAdmin();
  const userId = userIdSchema.parse(session.metadata?.supabase_user_id);
  const offerId = offerIdSchema.parse(session.metadata?.offer_id);
  const configuredOffer = getConfiguredOffer(offerId);

  if (!configuredOffer || configuredOffer.mode !== "payment" || session.currency !== "usd") {
    throw new Error("Checkout Session does not match a configured pack.");
  }

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });
  const purchasedPriceIds = lineItems.data.flatMap((item) => (item.price ? [item.price.id] : []));
  if (purchasedPriceIds.length !== 1 || purchasedPriceIds[0] !== configuredOffer.priceId) {
    throw new Error("Checkout line items do not match the expected pack price.");
  }

  const expiresAt = new Date();
  expiresAt.setUTCMonth(expiresAt.getUTCMonth() + (configuredOffer.expiresAfterMonths ?? 12));

  const { error } = await admin.rpc("process_stripe_credit_event", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_object_id: session.id,
    p_livemode: event.livemode,
    p_user_id: userId,
    p_source: configuredOffer.creditSource,
    p_quantity: configuredOffer.credits,
    p_external_ref: session.id,
    p_expires_at: expiresAt.toISOString(),
    p_metadata: { offer_id: configuredOffer.id, price_id: configuredOffer.priceId }
  });
  if (error) throw error;
}

async function fulfillSubscriptionInvoice(event: Stripe.Event, invoice: Stripe.Invoice) {
  if (
    invoice.currency !== "usd" ||
    !["subscription_create", "subscription_cycle"].includes(invoice.billing_reason ?? "")
  ) {
    return;
  }

  const builder = getConfiguredOffer("builder");
  if (!builder) {
    throw new Error("Builder price is not configured.");
  }

  const priceIds = invoice.lines.data.flatMap((line) => {
    const price = line.pricing?.price_details?.price;
    return price ? [objectId(price)!] : [];
  });
  if (!priceIds.includes(builder.priceId)) {
    return;
  }

  const admin = requireAdmin();
  const customerId = objectId(invoice.customer);
  if (!customerId) throw new Error("Paid invoice has no customer.");

  const { data: account, error: accountError } = await admin
    .from("user_accounts")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .single();
  if (accountError) throw accountError;

  const { error } = await admin.rpc("process_stripe_credit_event", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_object_id: invoice.id,
    p_livemode: event.livemode,
    p_user_id: account.user_id,
    p_source: billingOffers.builder.creditSource,
    p_quantity: billingOffers.builder.credits,
    p_external_ref: invoice.id,
    p_expires_at: null,
    p_metadata: { offer_id: "builder", price_id: builder.priceId, billing_reason: invoice.billing_reason }
  });
  if (error) throw error;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const admin = requireAdmin();
  const customerId = objectId(subscription.customer);
  if (!customerId) throw new Error("Subscription has no customer.");

  const { data: account, error: accountError } = await admin
    .from("user_accounts")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .single();
  if (accountError) throw accountError;

  const builderLine = subscription.items.data.find((item) => {
    const offer = findOfferByPriceId(item.price.id);
    return offer?.id === "builder";
  });
  if (!builderLine) return;

  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: account.user_id,
      stripe_subscription_id: subscription.id,
      stripe_price_id: builderLine.price.id,
      status: subscription.status,
      current_period_start: new Date(builderLine.current_period_start * 1000).toISOString(),
      current_period_end: new Date(builderLine.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end
    },
    { onConflict: "user_id" }
  );
  if (error) throw error;
}

function requireAdmin() {
  const admin = createSupabaseAdminClient();
  if (!admin) throw new Error("Supabase admin client is not configured.");
  return admin;
}

function objectId(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}
