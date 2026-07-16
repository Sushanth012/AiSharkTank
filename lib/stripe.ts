import "server-only";

import Stripe from "stripe";

let client: Stripe | null = null;

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }

  client ??= new Stripe(secretKey, {
    appInfo: {
      name: "AI Shark Tank",
      version: "0.1.0"
    },
    maxNetworkRetries: 2
  });

  return client;
}
