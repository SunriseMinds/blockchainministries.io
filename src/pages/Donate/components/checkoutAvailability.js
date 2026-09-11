/**
 * M12 — is recurring covenant-tier checkout actually operational?
 *
 * Deliberately NOT a feature flag someone can flip optimistically. It is
 * derived from the tier price ids themselves: while they are the placeholder
 * strings the Worker already rejects (see stripe.PLACEHOLDER_PRICE_IDS), the
 * public page must not offer enrolment it cannot complete.
 *
 * Configuring real Stripe prices therefore turns the UI on by itself — there
 * is no second switch to remember, and no way for the page to claim payments
 * work while the backend still refuses them.
 *
 * This changes presentation only. It configures no Stripe credentials and
 * enables nothing server-side.
 */

/** Mirrors stripe.PLACEHOLDER_PRICE_IDS in @reellink/payments. */
export const PLACEHOLDER_PRICE_IDS = Object.freeze([
  'price_supporter_tier',
  'price_guardian_tier',
  'price_archangel_tier',
]);

export function isPlaceholderPrice(priceId) {
  return !priceId || PLACEHOLDER_PRICE_IDS.includes(priceId);
}

/**
 * @param {Array<{priceId:string}>} tiers
 * @returns {boolean} true only when EVERY tier has a real price id
 */
export function checkoutEnabled(tiers) {
  if (!Array.isArray(tiers) || tiers.length === 0) return false;
  return tiers.every((t) => !isPlaceholderPrice(t?.priceId));
}

/** The tier price ids as currently configured in StripeTiers.jsx. */
const CONFIGURED_PRICE_IDS = [
  { priceId: 'price_supporter_tier' },
  { priceId: 'price_guardian_tier' },
  { priceId: 'price_archangel_tier' },
];

export const CHECKOUT_ENABLED = checkoutEnabled(CONFIGURED_PRICE_IDS);
