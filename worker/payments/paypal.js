/**
 * M14.5 — PayPal Orders v2 + webhook verification, over fetch().
 *
 * No PayPal SDK: like the Stripe module, the REST API over fetch is a far
 * better fit for Workers than a Node-assuming client library.
 *
 * Nothing here is ever reachable from the browser. The client secret, the
 * OAuth access token and the webhook id exist only inside the Worker, and no
 * function returns or logs any of them.
 */
import { HttpError } from '@reellink/core/http.js';

/* ----------------------------------------------------------------- oauth -- */

/**
 * Client-credentials access token.
 *
 * Cached per isolate with a safety margin, because a Worker isolate can serve
 * many requests and PayPal tokens last hours — re-authenticating per request
 * would be wasteful and rate-limit-prone. NOT persisted to D1: a token is
 * short-lived bearer credential, and storing it would create a durable secret
 * where none is needed.
 */
const tokenCache = new Map();

export async function accessToken(cfg, { now = Date.now() } = {}) {
  const key = `${cfg.api}:${cfg.clientId}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > now) return cached.token;

  const basic = btoa(`${cfg.clientId}:${cfg.clientSecret}`);
  let res;
  try {
    res = await fetch(`${cfg.api}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
  } catch {
    throw new HttpError(502, 'provider_unavailable', 'PayPal is unreachable, please try again');
  }
  if (!res.ok) {
    // Deliberately does not echo PayPal's body: it can carry account detail.
    throw new HttpError(502, 'provider_unavailable', 'PayPal authorization failed');
  }
  const data = await res.json();
  const token = data?.access_token;
  if (!token) throw new HttpError(502, 'provider_unavailable', 'PayPal authorization failed');

  // Expire a minute early so a token can never be used moments after lapsing.
  const ttl = Number(data.expires_in);
  tokenCache.set(key, {
    token,
    expiresAt: now + (Number.isFinite(ttl) ? Math.max(ttl - 60, 30) : 300) * 1000,
  });
  return token;
}

/** Test-only: drop cached tokens so cache behaviour can be exercised. */
export function __clearTokenCache() { tokenCache.clear(); }

/* ------------------------------------------------------------------ api -- */

async function call(cfg, path, { method = 'POST', body, headers = {} } = {}) {
  const token = await accessToken(cfg);
  let res;
  try {
    res = await fetch(`${cfg.api}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new HttpError(502, 'provider_unavailable', 'PayPal is unreachable, please try again');
  }

  let data = null;
  try { data = await res.json(); } catch { /* 204 or non-JSON */ }

  if (!res.ok) {
    // 429 and 5xx are transient: the donor should retry, not be told the
    // payment failed. 4xx other than 429 is a genuine rejection.
    const transient = res.status === 429 || res.status >= 500;
    console.error('[paypal] error', res.status, data?.name);
    throw new HttpError(
      transient ? 502 : 400,
      transient ? 'provider_unavailable' : 'provider_error',
      transient ? 'PayPal is temporarily unavailable, please try again' : 'PayPal could not process that request',
    );
  }
  return data;
}

/**
 * Create an order. The AMOUNT is decided by the server; the browser only
 * asked. `custom_id` carries the server-resolved user id (or empty for an
 * anonymous gift) — the same discipline as Stripe's `metadata.user_id`.
 *
 * `custom_id` is visible to the merchant in PayPal's own dashboard, so it
 * carries an opaque internal id and nothing else: no email, no name, no
 * session material.
 *
 * `PayPal-Request-Id` is PayPal's documented idempotency header, fed from the
 * same per-action `request_id` contract M14.1 established for Stripe.
 */
export function createOrder(cfg, { amountCents, currency = 'USD', userId = '', requestId, returnUrl, cancelUrl }) {
  const value = (Number(amountCents) / 100).toFixed(2);
  return call(cfg, '/v2/checkout/orders', {
    headers: { 'PayPal-Request-Id': requestId },
    body: {
      intent: 'CAPTURE',
      purchase_units: [{
        custom_id: userId || '',
        amount: { currency_code: currency, value },
      }],
      application_context: {
        brand_name: 'Blockchain Ministries',
        user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',
        ...(returnUrl ? { return_url: returnUrl } : {}),
        ...(cancelUrl ? { cancel_url: cancelUrl } : {}),
      },
    },
  });
}

/**
 * M14.5B — create a recurring subscription, server-side.
 *
 * The browser named a TIER; the server resolved it to a Plan id here and the
 * Plan id never travels inbound. `custom_id` carries the server-resolved user
 * id, the same discipline as one-time orders, and is the ONLY identity
 * channel — a webhook's own subscriber fields are never trusted over it.
 *
 * The subscription is NOT recorded as active by this call. PayPal returns
 * `APPROVAL_PENDING`; only a verified BILLING.SUBSCRIPTION.ACTIVATED webhook
 * makes it active.
 */
export function createSubscription(cfg, { planId, userId, requestId, returnUrl, cancelUrl }) {
  return call(cfg, '/v1/billing/subscriptions', {
    headers: requestId ? { 'PayPal-Request-Id': requestId } : {},
    body: {
      plan_id: planId,
      custom_id: userId,
      application_context: {
        brand_name: 'Blockchain Ministries',
        user_action: 'SUBSCRIBE_NOW',
        shipping_preference: 'NO_SHIPPING',
        ...(returnUrl ? { return_url: returnUrl } : {}),
        ...(cancelUrl ? { cancel_url: cancelUrl } : {}),
      },
    },
  });
}

/** The approval URL a subscriber must visit, from the HATEOAS links. */
export function approvalUrlFrom(subscription) {
  const link = (subscription?.links ?? []).find((l) => l?.rel === 'approve');
  return typeof link?.href === 'string' ? link.href : null;
}

/** Capture an approved order, server-side. */
export function captureOrder(cfg, orderId, { requestId } = {}) {
  return call(cfg, `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    headers: requestId ? { 'PayPal-Request-Id': requestId } : {},
    body: {},
  });
}

/* -------------------------------------------------------------- webhooks -- */

/** The headers PayPal signs a webhook with. */
export const SIGNATURE_HEADERS = Object.freeze([
  'paypal-transmission-id',
  'paypal-transmission-time',
  'paypal-cert-url',
  'paypal-auth-algo',
  'paypal-transmission-sig',
]);

/**
 * Verify a webhook by POSTBACK to PayPal.
 *
 * PayPal currently documents two routes: local cryptographic verification
 * (which it now states it prefers) and this postback. Postback is chosen here
 * deliberately — local verification requires parsing an X.509 certificate and
 * a CRC32 implementation, and getting either subtly wrong would produce a
 * verifier that *looks* strict while accepting forgeries. An extra API call
 * per webhook is a cheap price for a verification PayPal itself performs.
 *
 * FAILS CLOSED in every direction: a missing header, a missing webhook id, an
 * unreachable verifier or any answer other than SUCCESS all return false, and
 * the caller must then change no financial state.
 *
 * @param {string} rawBody the exact bytes received — never re-serialized
 */
export async function verifyWebhook(cfg, rawBody, headers) {
  if (!cfg.webhookId) return false;

  const h = {};
  for (const name of SIGNATURE_HEADERS) {
    const value = headers?.get?.(name) ?? headers?.[name];
    if (!value) return false;          // an unsigned message is not from PayPal
    h[name] = value;
  }

  let event;
  try { event = JSON.parse(rawBody); } catch { return false; }

  let res;
  try {
    res = await fetch(`${cfg.api}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${await accessToken(cfg)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        auth_algo: h['paypal-auth-algo'],
        cert_url: h['paypal-cert-url'],
        transmission_id: h['paypal-transmission-id'],
        transmission_sig: h['paypal-transmission-sig'],
        transmission_time: h['paypal-transmission-time'],
        webhook_id: cfg.webhookId,
        webhook_event: event,
      }),
    });
  } catch {
    return false;                      // cannot verify => do not act
  }
  if (!res.ok) return false;
  const data = await res.json().catch(() => null);
  return data?.verification_status === 'SUCCESS';
}

/* ------------------------------------------------------- event mapping -- */

/**
 * Map a PayPal webhook event to the ministry's provider-neutral donation
 * shape, or to a lifecycle transition on an existing one.
 *
 * Event names are taken verbatim from PayPal's published list — none is
 * invented. Anything not listed returns null and is deliberately ignored.
 *
 * Amounts come from the EVENT, which is PayPal's own record, never from
 * anything a browser said.
 */
export function donationFromEvent(event) {
  const type = event?.event_type;
  const r = event?.resource;
  if (!type || !r) return null;

  const amount = r.amount ?? r.seller_receivable_breakdown?.gross_amount;
  const cents = moneyToCents(amount?.value);
  const currency = String(amount?.currency_code || 'usd').toLowerCase();

  switch (type) {
    // ---- one-time -------------------------------------------------------
    case 'PAYMENT.CAPTURE.COMPLETED':
      if (cents === null) return null;
      return {
        kind: 'record',
        providerEventId: event.id,
        providerTxnId: r.id,
        amountCents: cents,
        currency,
        status: 'completed',
        userId: r.custom_id || null,
      };
    case 'PAYMENT.CAPTURE.PENDING':
      if (cents === null) return null;
      return {
        kind: 'record',
        providerEventId: event.id,
        providerTxnId: r.id,
        amountCents: cents,
        currency,
        // NOT completed. A pending capture is money that has not arrived.
        status: 'pending',
        userId: r.custom_id || null,
      };
    case 'PAYMENT.CAPTURE.DECLINED':
      if (cents === null) return null;
      return {
        kind: 'record',
        providerEventId: event.id,
        providerTxnId: r.id,
        amountCents: cents,
        currency,
        status: 'declined',
        userId: r.custom_id || null,
      };

    // ---- lifecycle on an EXISTING gift ----------------------------------
    // A refund carries its own event id, but it is not a second donation. It
    // transitions the capture it refers to. `up` in the HATEOAS links is the
    // capture that was refunded.
    case 'PAYMENT.CAPTURE.REFUNDED':
      return { kind: 'transition', providerEventId: event.id, status: 'refunded', targetTxnId: capturedIdFrom(r) };
    case 'PAYMENT.CAPTURE.REVERSED':
      return { kind: 'transition', providerEventId: event.id, status: 'reversed', targetTxnId: capturedIdFrom(r) };

    default:
      return null;                     // events we deliberately ignore
  }
}

/* ------------------------------------------------- M14.5B recurring events -- */

/**
 * PayPal's own event clock, in epoch MILLISECONDS.
 *
 * `create_time` is RFC 3339 (`yyyy-MM-ddTHH:mm:ss.SSSZ`) and is stamped by
 * PayPal, so it is stable across redeliveries — which is exactly what an
 * ordering baseline needs. Worker arrival time is never used: it records when
 * THIS server saw an event, not when PayPal made it, and PayPal explicitly
 * documents that events may arrive out of order.
 *
 * Returns null when there is nothing parseable, which the store treats as
 * 'unorderable' and refuses once a baseline exists.
 */
export function eventCreatedMs(event) {
  const t = event?.create_time;
  if (typeof t !== 'string') return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Subscription lifecycle events -> the ministry's own status vocabulary.
 *
 * Every name is taken verbatim from PayPal's published event list. Nothing is
 * invented, and events outside this map are deliberately not handled.
 *
 * BILLING.SUBSCRIPTION.CREATED and .UPDATED are real events that are
 * deliberately ABSENT: creation is not activation, and an update carries no
 * status this model needs. Acting on either would claim billing state that
 * has not happened.
 */
const SUBSCRIPTION_STATUS = Object.freeze({
  'BILLING.SUBSCRIPTION.ACTIVATED': 'active',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED': 'past_due',
  'BILLING.SUBSCRIPTION.SUSPENDED': 'suspended',
  'BILLING.SUBSCRIPTION.CANCELLED': 'cancelled',
  'BILLING.SUBSCRIPTION.EXPIRED': 'expired',
});

export function subscriptionEventFromEvent(event) {
  const type = event?.event_type;
  if (!type || !Object.hasOwn(SUBSCRIPTION_STATUS, type)) return null;
  const r = event.resource;
  const subscriptionId = r?.id;
  if (typeof subscriptionId !== 'string' || !subscriptionId) return null;

  return {
    providerSubscriptionId: subscriptionId,
    status: SUBSCRIPTION_STATUS[type],
    eventId: event.id ?? null,
    eventCreated: eventCreatedMs(event),
    // Only ever a hint. The stored subscription's own user_id wins, because
    // it was written from an authenticated session; see the webhook route.
    userIdHint: r?.custom_id || null,
  };
}

/**
 * Recurring payment events.
 *
 * PAYMENT.SALE.COMPLETED fires for every subscription payment and carries
 * `billing_agreement_id` — the subscription the money belongs to — which is
 * how a recurring gift is attributed without trusting anything a browser said.
 *
 * A refund or reversal is news about an existing payment, exactly as with
 * one-time captures: it TRANSITIONS the original sale rather than creating a
 * second donation.
 */
export function recurringPaymentFromEvent(event) {
  const type = event?.event_type;
  const r = event?.resource;
  if (!type || !r) return null;

  switch (type) {
    case 'PAYMENT.SALE.COMPLETED': {
      // Sale objects use amount.total/amount.currency; the newer money shape
      // uses value/currency_code. Accept either rather than guess wrong.
      const cents = moneyToCents(r.amount?.total ?? r.amount?.value);
      if (cents === null || typeof r.id !== 'string') return null;
      return {
        kind: 'record',
        providerEventId: event.id,
        providerTxnId: r.id,
        subscriptionId: r.billing_agreement_id ?? null,
        amountCents: cents,
        currency: String(r.amount?.currency ?? r.amount?.currency_code ?? 'usd').toLowerCase(),
        status: 'completed',
      };
    }
    case 'PAYMENT.SALE.REFUNDED':
      return { kind: 'transition', providerEventId: event.id, status: 'refunded', targetTxnId: saleIdFrom(r) };
    case 'PAYMENT.SALE.REVERSED':
      return { kind: 'transition', providerEventId: event.id, status: 'reversed', targetTxnId: saleIdFrom(r) };
    default:
      return null;
  }
}

/** Which sale does a refund/reversal refer to? `sale_id`, else the `up` link. */
function saleIdFrom(resource) {
  if (typeof resource?.sale_id === 'string' && resource.sale_id) return resource.sale_id;
  const up = (resource?.links ?? []).find((l) => l?.rel === 'up')?.href;
  if (typeof up === 'string') {
    const m = up.match(/\/sale\/([^/?#]+)|\/payments\/sale\/([^/?#]+)/);
    if (m) return m[1] ?? m[2];
  }
  return null;
}

/**
 * PayPal billing state -> the EXISTING membership payment vocabulary.
 *
 * `memberships.payment_status` allows only pending_payment/active/past_due/
 * cancelled (migration 0001). PayPal adds `suspended` and `expired`, which
 * that column cannot hold — and M14.5B ratified NOT expanding the membership
 * vocabulary. So they are mapped to their nearest true meaning:
 *
 *   suspended -> past_due   billing has stopped but the subscription can be
 *                           reactivated; "cancelled" would overstate it.
 *   expired   -> cancelled  the subscription is over and cannot be revived.
 *
 * Returns null when there is no honest mapping, and the caller then leaves
 * membership alone rather than guessing.
 */
const MEMBERSHIP_STATUS = Object.freeze({
  active: 'active',
  past_due: 'past_due',
  suspended: 'past_due',
  cancelled: 'cancelled',
  expired: 'cancelled',
});

export function membershipStatusFor(subscriptionStatus) {
  return MEMBERSHIP_STATUS[subscriptionStatus] ?? null;
}

/** Decimal money string -> integer cents, with no floating-point arithmetic. */
export function moneyToCents(value) {
  if (typeof value === 'number') return Math.round(value * 100);
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(BigInt(whole) * 100n + BigInt(frac.padEnd(2, '0') || '0'));
}

/**
 * Which capture does a refund/reversal refer to?
 *
 * PayPal puts the refunded capture in the `up` HATEOAS link. Falling back to
 * an explicit id field keeps this working if the shape carries one directly.
 */
function capturedIdFrom(resource) {
  const direct = resource?.capture_id ?? resource?.parent_payment ?? null;
  if (direct) return String(direct);
  const up = (resource?.links ?? []).find((l) => l?.rel === 'up')?.href;
  if (typeof up === 'string') {
    const m = up.match(/\/captures\/([^/?#]+)/);
    if (m) return m[1];
  }
  return null;
}
