/**
 * M14.1 — THE authoritative Blockchain Ministries giving catalogue.
 *
 * WHY THIS FILE IS THE ONLY PLACE A PRICE ID MAY APPEAR
 * Before M14.1 each placeholder price id was written out four times across
 * three files, two of which were hand-maintained mirrors of each other
 * (`CONFIGURED_PRICE_IDS` vs `tiers[].priceId`). Nothing linked them, so
 * updating one and not the other either disabled a working checkout or
 * enabled a UI the server rejects. Both failure modes were silent.
 *
 * The contract is now semantic: the browser names a TIER ("supporter"), never
 * a Stripe Price. Price ids exist server-side only, here, once. A price id
 * cannot cross the wire inbound, so it cannot be injected — see
 * resolveTier().
 *
 * Placeholder semantics are IMPORTED from @reellink/payments rather than
 * restated, so there is exactly one definition of "not a real price" too.
 */
import { PLACEHOLDER_PRICE_IDS } from '@reellink/payments/stripe.js';

/**
 * Monthly support levels. `amountCents` is the displayed price and is NOT sent
 * to Stripe — the Price object is authoritative for what is actually charged.
 * It exists so the public page can show a figure without a second catalogue.
 *
 * `priceId` stays a placeholder until the owner creates real Stripe Products
 * and Prices (M14.5). Until then resolveTier() refuses to build a checkout,
 * which is what keeps the UI honest.
 *
 * DELIBERATELY NO benefit list: M14 ratified that tiers are monthly support
 * levels and must not promise capabilities that are not implemented.
 */
export const TIERS = Object.freeze({
  supporter: Object.freeze({ key: 'supporter', name: 'Supporter', amountCents: 1000, priceId: 'price_supporter_tier', paypalPlanId: 'PLAN_SUPPORTER_PLACEHOLDER' }),
  guardian: Object.freeze({ key: 'guardian', name: 'Guardian', amountCents: 5000, priceId: 'price_guardian_tier', paypalPlanId: 'PLAN_GUARDIAN_PLACEHOLDER' }),
  archangel: Object.freeze({ key: 'archangel', name: 'Archangel', amountCents: 10000, priceId: 'price_archangel_tier', paypalPlanId: 'PLAN_ARCHANGEL_PLACEHOLDER' }),
});

/**
 * M14.5 — PayPal plan placeholders, the exact counterpart of the Stripe ones.
 * They exist so the tier-resolution security model is identical across both
 * recurring rails and can be tested before either is live. Recurring PayPal
 * itself is DEFERRED behind migration 0006 (see the M14.5 report).
 */
export const PLACEHOLDER_PLAN_IDS = Object.freeze([
  'PLAN_SUPPORTER_PLACEHOLDER',
  'PLAN_GUARDIAN_PLACEHOLDER',
  'PLAN_ARCHANGEL_PLACEHOLDER',
]);

/** The closed set of tier identifiers the API will even consider. */
export const TIER_KEYS = Object.freeze(Object.keys(TIERS));

/** One-off giving bounds. The server is authoritative; the UI only suggests. */
export const ONE_TIME = Object.freeze({
  currency: 'usd',
  minCents: 100,          // $1
  maxCents: 10_000_000,   // $100,000
  suggestedCents: Object.freeze([2500, 5000, 10000, 25000, 50000, 100000]),
});

/** A tier is usable only once its Price id is a real one. */
export function tierIsConfigured(tier) {
  return Boolean(tier?.priceId) && !PLACEHOLDER_PRICE_IDS.includes(tier.priceId);
}

/**
 * Resolve a caller-supplied tier key to the ministry's own tier.
 *
 * Fails CLOSED in both directions:
 *   unknown key            -> null  (an arbitrary Stripe Price cannot be named)
 *   known but unconfigured -> null  (a placeholder can never reach Stripe)
 *
 * `Object.hasOwn` rather than `TIERS[key]` so a key like "constructor" or
 * "__proto__" resolves to nothing instead of an inherited object.
 */
export function resolveTier(key) {
  if (typeof key !== 'string' || !Object.hasOwn(TIERS, key)) return null;
  const tier = TIERS[key];
  return tierIsConfigured(tier) ? tier : null;
}

/**
 * M14.5B — the effective PayPal Plan id for a tier, or null if there is none.
 *
 * A PayPal Plan id is account-specific: it is created in the owner's own
 * PayPal dashboard and cannot be known here. So the catalogue holds a
 * PLACEHOLDER, and the real id arrives as owner-set server configuration
 * (`PAYPAL_PLAN_SUPPORTER` and friends) — never from a browser, never from a
 * request body. Env is consulted FIRST, so going live is a configuration
 * change rather than a code change, which is what §16 requires of a UI that
 * must "activate without a redesign".
 *
 * Fails closed: no configuration, or a leftover placeholder, both yield null.
 */
export function paypalPlanId(tier, env) {
  if (!tier?.key) return null;
  const configured = env?.[`PAYPAL_PLAN_${tier.key.toUpperCase()}`];
  const id = configured || tier.paypalPlanId;
  if (!id || PLACEHOLDER_PLAN_IDS.includes(id)) return null;
  return id;
}

/** A tier is usable on PayPal only once its Plan id is a real one. */
export function tierPlanIsConfigured(tier, env) {
  return paypalPlanId(tier, env) !== null;
}

/**
 * The PayPal counterpart of resolveTier, with identical security properties:
 * a browser names a TIER, never a PayPal Plan, and an unknown or unconfigured
 * tier fails closed. A Plan id cannot travel inbound, so it cannot be
 * injected.
 *
 * Returns the tier with its EFFECTIVE plan id resolved, so a caller never has
 * to re-derive it and can never accidentally use the placeholder.
 */
export function resolvePayPalTier(key, env) {
  if (typeof key !== 'string' || !Object.hasOwn(TIERS, key)) return null;
  const tier = TIERS[key];
  const planId = paypalPlanId(tier, env);
  return planId ? Object.freeze({ ...tier, paypalPlanId: planId }) : null;
}

/**
 * What the public Donate page is allowed to know.
 *
 * `available` is derived from the same catalogue the server charges against,
 * so the UI cannot claim a tier is open while the server would refuse it —
 * the drift that made the old mirrored lists dangerous is now impossible:
 * there is nothing left to keep in sync.
 *
 * No price id is exposed. The browser has no use for one.
 *
 * M14 checkpoint — `name` is NO LONGER exposed. "Supporter", "Guardian" and
 * "Archangel" are inherited working labels the owner has not approved as
 * ministry terminology, and a public API field called `name` presents one as
 * though it were settled. The browser identifies a level by its monthly
 * amount instead. `key` stays, because it is an internal identifier the API
 * contract needs and carries no branding claim. When the owner chooses real
 * names, re-adding the field is one line and breaks nothing.
 */
export function givingConfig(env) {
  return {
    tiers: TIER_KEYS.map((key) => {
      const t = TIERS[key];
      return {
        key: t.key,
        amount_cents: t.amountCents,
        // Per RAIL, because the two are configured independently: a tier can
        // have a real Stripe Price and still no PayPal Plan. One flag for both
        // would force the UI to lie about one of them. No id is exposed for
        // either — only whether the server would accept that tier.
        available: tierIsConfigured(t),
        paypal_available: tierPlanIsConfigured(t, env),
      };
    }),
    one_time: {
      currency: ONE_TIME.currency,
      min_cents: ONE_TIME.minCents,
      max_cents: ONE_TIME.maxCents,
      suggested_cents: [...ONE_TIME.suggestedCents],
      // One-off giving needs no pre-created Price — createCheckoutSession
      // builds ad-hoc price_data — so it is ready as soon as Stripe itself is.
      available: true,
    },
  };
}
