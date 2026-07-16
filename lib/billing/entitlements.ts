export type EntitlementSummary = {
  freePitchAvailable: boolean;
  premiumCredits: number;
  creditDebt: number;
};

export function resolvePitchTierAvailability(
  entitlements: EntitlementSummary,
  premiumEnabled: boolean
) {
  const basicAvailable = entitlements.freePitchAvailable;
  const premiumAvailable =
    premiumEnabled && entitlements.premiumCredits > 0 && entitlements.creditDebt === 0;

  return {
    basicAvailable,
    premiumAvailable,
    defaultTier: basicAvailable ? "basic" : premiumAvailable ? "premium" : null
  } as const;
}
