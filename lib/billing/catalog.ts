import { z } from "zod";

export const offerIdSchema = z.enum(["pitch_pack", "builder", "addon_pack"]);
export type OfferId = z.infer<typeof offerIdSchema>;

export type BillingOffer = {
  id: OfferId;
  name: string;
  description: string;
  displayPrice: string;
  mode: "payment" | "subscription";
  credits: number;
  creditSource: "pitch_pack" | "subscription" | "addon_pack";
  priceEnv: "STRIPE_PRICE_PITCH_PACK" | "STRIPE_PRICE_BUILDER" | "STRIPE_PRICE_ADDON_PACK";
  expiresAfterMonths?: number;
};

export const billingOffers: Record<OfferId, BillingOffer> = {
  pitch_pack: {
    id: "pitch_pack",
    name: "Pitch Pack",
    description: "Five premium investor-panel reports, valid for 12 months.",
    displayPrice: "$7.99",
    mode: "payment",
    credits: 5,
    creditSource: "pitch_pack",
    priceEnv: "STRIPE_PRICE_PITCH_PACK",
    expiresAfterMonths: 12
  },
  builder: {
    id: "builder",
    name: "Builder",
    description: "15 premium reports each month, with rollover capped at 30.",
    displayPrice: "$9.99/mo",
    mode: "subscription",
    credits: 15,
    creditSource: "subscription",
    priceEnv: "STRIPE_PRICE_BUILDER"
  },
  addon_pack: {
    id: "addon_pack",
    name: "Add-on Pack",
    description: "Five extra premium reports, valid for 12 months.",
    displayPrice: "$4.99",
    mode: "payment",
    credits: 5,
    creditSource: "addon_pack",
    priceEnv: "STRIPE_PRICE_ADDON_PACK",
    expiresAfterMonths: 12
  }
};

export function getConfiguredOffer(offerId: OfferId) {
  const offer = billingOffers[offerId];
  const priceId = process.env[offer.priceEnv];
  return priceId ? { ...offer, priceId } : null;
}

export function findOfferByPriceId(priceId: string) {
  return Object.values(billingOffers).find((offer) => process.env[offer.priceEnv] === priceId);
}
