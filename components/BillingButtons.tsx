"use client";

import { useState } from "react";
import type { OfferId } from "@/lib/billing/catalog";

export function CheckoutButton({ offerId, disabled }: { offerId: OfferId; disabled?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function beginCheckout() {
    setLoading(true);
    setError(null);
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId })
    });
    const payload = (await response.json()) as { url?: string; error?: string };
    if (!response.ok || !payload.url) {
      setLoading(false);
      setError(payload.error ?? "Checkout could not be started.");
      return;
    }
    window.location.assign(payload.url);
  }

  return (
    <div className="grid" style={{ gap: 8 }}>
      <button className="button primary full" disabled={disabled || loading} onClick={beginCheckout} type="button">
        {disabled ? "Coming soon" : loading ? "Opening checkout…" : "Choose plan"}
      </button>
      {error ? <span className="error" role="alert">{error}</span> : null}
    </div>
  );
}

export function BillingPortalButton({ disabled }: { disabled?: boolean }) {
  const [loading, setLoading] = useState(false);

  async function openPortal() {
    setLoading(true);
    const response = await fetch("/api/billing/portal", { method: "POST" });
    const payload = (await response.json()) as { url?: string };
    setLoading(false);
    if (response.ok && payload.url) window.location.assign(payload.url);
  }

  return (
    <button className="button secondary full" disabled={disabled || loading} onClick={openPortal} type="button">
      {loading ? "Opening billing…" : "Manage billing"}
    </button>
  );
}
