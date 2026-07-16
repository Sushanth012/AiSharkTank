import type Stripe from "stripe";

const settledDisputeStatuses = new Set<Stripe.Dispute.Status>([
  "won",
  "warning_closed",
  "prevented"
]);

export function hasActiveDispute(disputes: Pick<Stripe.Dispute, "status">[]) {
  return disputes.some((dispute) => !settledDisputeStatuses.has(dispute.status));
}

export function objectId(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function requirePositiveAmount(value: number | null | undefined, label: string) {
  if (!Number.isSafeInteger(value) || !value || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}
