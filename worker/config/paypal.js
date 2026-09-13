/**
 * M14.5 — PayPal rail configuration.
 *
 * Verified against current official PayPal documentation (see the M14.5
 * report for URLs), not against the deleted legacy component.
 *
 * SANDBOX ONLY in this phase. `live` requires an explicit second switch that
 * is absent everywhere, mirroring the XRPL rail's mainnet gate.
 *
 * The client SECRET, the webhook id and every access token stay server-side.
 * Only the public client id is ever exposed, and only through the giving
 * config endpoint the Donate page already reads.
 */
import { HttpError } from '@reellink/core/http.js';

const ENVIRONMENTS = Object.freeze({
  sandbox: { api: 'https://api-m.sandbox.paypal.com', sdk: 'https://www.paypal.com/sdk/js', live: false },
  live: { api: 'https://api-m.paypal.com', sdk: 'https://www.paypal.com/sdk/js', live: true },
});

/**
 * Resolve and validate PayPal configuration. Fails closed on every axis.
 *
 *   missing client id / secret -> the rail is simply off
 *   unknown environment        -> refuse
 *   live without the switch    -> refuse (M14.5 is sandbox-only)
 *
 * The webhook id is NOT required to create orders, only to verify webhooks,
 * so it is resolved separately — a half-configured account can still be
 * exercised without silently accepting unverifiable webhooks.
 */
export function paypalConfig(env) {
  const clientId = env?.PAYPAL_CLIENT_ID;
  const clientSecret = env?.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new HttpError(503, 'unavailable', 'PayPal is not configured');

  const name = String(env.PAYPAL_ENVIRONMENT || 'sandbox').toLowerCase();
  const e = ENVIRONMENTS[name];
  if (!e) throw new HttpError(503, 'unavailable', 'PayPal is misconfigured');
  if (e.live && env.PAYPAL_ALLOW_LIVE !== 'true') {
    throw new HttpError(503, 'unavailable', 'PayPal is not enabled on this environment');
  }

  return {
    clientId,
    clientSecret,
    environment: name,
    live: e.live,
    api: env.PAYPAL_API_URL || e.api,
    sdk: e.sdk,
    webhookId: env.PAYPAL_WEBHOOK_ID || null,
  };
}

/** Never throws — the Donate page asks this to decide whether to offer PayPal. */
export function paypalAvailable(env) {
  try {
    paypalConfig(env);
    return true;
  } catch {
    return false;
  }
}

/**
 * Webhook verification requires the webhook id. Without it the endpoint must
 * refuse rather than accept an unverifiable message — an unverified webhook
 * must never alter financial state.
 */
export function requireWebhookId(cfg) {
  if (!cfg.webhookId) {
    throw new HttpError(503, 'unavailable', 'PayPal webhook verification is not configured');
  }
  return cfg.webhookId;
}
