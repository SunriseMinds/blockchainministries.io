/**
 * Post-M14 — Stripe rail configuration and availability.
 *
 * WHY THIS FILE EXISTS
 * M14.4 and M14.5 gave XRP and PayPal an authoritative, server-derived
 * availability flag. Stripe never got one. The public giving config exposed
 * `one_time.available: true`, which describes the CATALOGUE — one-off giving
 * needs no pre-created Price, so it is ready as soon as Stripe itself is —
 * and the browser had nothing else to consult. So the production Donate page
 * rendered an enabled "Give $100" button against a Stripe account that does
 * not exist, and the honest 503 only arrived after the donor pressed it.
 *
 * Catalogue readiness and PROVIDER readiness are different questions. This
 * module answers the second one, the same way worker/config/paypal.js does.
 *
 * NOTHING SECRET LEAVES HERE. No function returns a key, and the only thing
 * derived from one is a boolean about its mode.
 */
import { HttpError } from '@reellink/core/http.js';

/**
 * What the server genuinely needs before it can operate the Stripe rail.
 *
 * `STRIPE_SECRET_KEY` alone is what `createCheckoutSession` requires — see
 * packages/payments/src/stripe.js `secret()`. But a Session the ministry
 * cannot RECORD is not a working giving rail: M14.1 ratified that the webhook
 * is authoritative for durable persistence, so without
 * `STRIPE_WEBHOOK_SECRET` a donor could be charged and no donation row would
 * ever exist — no member history, no admin visibility, no acknowledgement.
 *
 * Offering checkout in that state would be exactly the "fake readiness" this
 * module was written to remove, one step later in the flow. So availability
 * requires BOTH, and `webhook_configured` is reported separately so a
 * half-configured account is diagnosable rather than merely refused.
 */
export function stripeConfig(env) {
  const secretKey = env?.STRIPE_SECRET_KEY;
  if (!secretKey) throw new HttpError(503, 'unavailable', 'Stripe is not configured');
  if (!env?.STRIPE_WEBHOOK_SECRET) {
    throw new HttpError(503, 'unavailable', 'Stripe webhook verification is not configured');
  }
  return {
    // Derived from the key's DOCUMENTED prefix, never from its contents. Live
    // keys are `sk_live_`/`rk_live_`; everything else is a test key. This is
    // the Stripe counterpart of PayPal's `live` and XRPL's `network`, and it
    // lets the page say plainly when giving is running in test mode instead
    // of silently taking play money.
    live: /^(sk|rk)_live_/.test(secretKey),
    webhookConfigured: true,
  };
}

/** Never throws — the Donate page asks this to decide whether to offer Card. */
export function stripeAvailable(env) {
  try {
    stripeConfig(env);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether webhook verification alone is configured.
 *
 * Reported independently of `available` so the owner can tell "no Stripe at
 * all" apart from "keys present, webhook missing" without reading logs.
 */
export function stripeWebhookConfigured(env) {
  return Boolean(env?.STRIPE_WEBHOOK_SECRET);
}

/**
 * What the public Donate page is allowed to know about Stripe.
 *
 * Deliberately shaped like the PayPal and XRP blocks: `available` first, and
 * nothing that is not needed to render an honest UI. No key, no prefix, no
 * account identifier, no webhook secret.
 */
export function stripePublicConfig(env) {
  if (!stripeAvailable(env)) {
    return {
      available: false,
      // Distinguishes the two ways to be unavailable. Booleans only.
      webhook_configured: stripeWebhookConfigured(env),
    };
  }
  const cfg = stripeConfig(env);
  return {
    available: true,
    live: cfg.live,
    webhook_configured: true,
  };
}
