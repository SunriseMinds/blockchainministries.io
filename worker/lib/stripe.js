/**
 * Stripe service layer — FRAMEWORK ONLY.
 *
 * No production keys, no live webhook registration, no payment cutover.
 * Everything here is inert until STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET are
 * configured as Worker secrets, which is a Phase 2D action.
 *
 * Stripe's Node SDK is not used: it is heavy and assumes Node APIs. The REST
 * API over fetch() is a better fit for Workers.
 */
import { HttpError } from './http.js';
import { hmacSha256Hex, timingSafeEqual } from './crypto.js';

const API = 'https://api.stripe.com/v1';

function secret(ctx) {
  const key = ctx.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, 'unavailable', 'Stripe is not configured');
  return key;
}

/** Stripe expects application/x-www-form-urlencoded, including nested keys. */
function form(params, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object' && !Array.isArray(v)) form(v, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function call(ctx, path, params, { idempotencyKey } = {}) {
  const headers = {
    Authorization: `Bearer ${secret(ctx)}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  // Protects against duplicate charges if a client retries.
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: form(params) });
  const data = await res.json();
  if (!res.ok) {
    console.error('[stripe] error', data?.error?.type, data?.error?.code);
    throw new HttpError(502, 'payment_error', data?.error?.message || 'Payment provider error');
  }
  return data;
}

/**
 * Create a PaymentIntent for a one-off donation.
 * @param {number} amountCents integer minor units, validated by the caller
 */
export function createPaymentIntent(ctx, { amountCents, currency = 'usd', metadata = {}, idempotencyKey }) {
  return call(
    ctx,
    '/payment_intents',
    {
      amount: amountCents,
      currency,
      // Card-only keeps the flow simple and matches the current UI.
      'automatic_payment_methods[enabled]': 'true',
      metadata,
    },
    { idempotencyKey },
  );
}

/**
 * Create a hosted Checkout Session.
 *
 * @param {'payment'|'subscription'} mode
 * @param {Array<{price?:string, amountCents?:number, quantity?:number, name?:string}>} items
 */
export function createCheckoutSession(ctx, { mode = 'payment', items, successUrl, cancelUrl, customerEmail, metadata = {}, idempotencyKey }) {
  const params = {
    mode,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  };
  if (customerEmail) params.customer_email = customerEmail;

  items.forEach((item, i) => {
    if (item.price) {
      // Pre-created Price object (required for subscriptions).
      params[`line_items[${i}][price]`] = item.price;
    } else {
      // Ad-hoc amount (one-off donations of an arbitrary size).
      params[`line_items[${i}][price_data][currency]`] = item.currency || 'usd';
      params[`line_items[${i}][price_data][unit_amount]`] = item.amountCents;
      params[`line_items[${i}][price_data][product_data][name]`] = item.name || 'Donation';
    }
    params[`line_items[${i}][quantity]`] = item.quantity || 1;
  });

  return call(ctx, '/checkout/sessions', params, { idempotencyKey });
}

/**
 * Verify a Stripe webhook signature (t=…,v1=… in the Stripe-Signature header).
 * Uses HMAC-SHA256 over `${timestamp}.${rawBody}` and a constant-time compare.
 *
 * @param {string} rawBody exact bytes as received — do not re-serialize
 */
export async function verifyWebhookSignature(ctx, rawBody, signatureHeader, toleranceSeconds = 300) {
  const whsec = ctx.env.STRIPE_WEBHOOK_SECRET;
  if (!whsec) throw new HttpError(503, 'unavailable', 'Stripe webhook secret is not configured');
  if (!signatureHeader) throw new HttpError(400, 'bad_request', 'Missing Stripe-Signature');

  const parts = Object.fromEntries(
    signatureHeader.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) throw new HttpError(400, 'bad_request', 'Malformed Stripe-Signature');

  // Replay protection.
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) {
    throw new HttpError(400, 'bad_request', 'Signature timestamp outside tolerance');
  }

  const expected = await hmacSha256Hex(whsec, `${timestamp}.${rawBody}`);
  if (!timingSafeEqual(expected, provided)) {
    throw new HttpError(400, 'bad_request', 'Invalid webhook signature');
  }
  return JSON.parse(rawBody);
}

/** Map a Stripe event to a donation row shape (used by the webhook route). */
export function donationFromEvent(event) {
  const obj = event?.data?.object;
  if (!obj) return null;
  switch (event.type) {
    case 'payment_intent.succeeded':
      return {
        provider: 'stripe',
        providerId: obj.id,
        amountCents: obj.amount_received ?? obj.amount,
        currency: obj.currency || 'usd',
        status: 'succeeded',
        receiptUrl: obj.charges?.data?.[0]?.receipt_url ?? null,
        userId: obj.metadata?.user_id ?? null,
      };
    case 'payment_intent.payment_failed':
      return {
        provider: 'stripe',
        providerId: obj.id,
        amountCents: obj.amount ?? 0,
        currency: obj.currency || 'usd',
        status: 'failed',
        receiptUrl: null,
        userId: obj.metadata?.user_id ?? null,
      };
    case 'checkout.session.completed':
      // One-off checkout. Subscriptions are recorded via invoice.paid instead,
      // so each billing period produces its own donation row.
      if (obj.mode === 'subscription') return null;
      return {
        provider: 'stripe',
        providerId: obj.payment_intent || obj.id,
        amountCents: obj.amount_total ?? 0,
        currency: obj.currency || 'usd',
        status: obj.payment_status === 'paid' ? 'succeeded' : (obj.payment_status || 'pending'),
        receiptUrl: null,
        userId: obj.metadata?.user_id ?? null,
      };

    case 'invoice.paid':
      // Recurring membership payment.
      return {
        provider: 'stripe',
        providerId: obj.id,
        amountCents: obj.amount_paid ?? 0,
        currency: obj.currency || 'usd',
        status: 'succeeded',
        receiptUrl: obj.hosted_invoice_url ?? null,
        userId: obj.subscription_details?.metadata?.user_id ?? obj.metadata?.user_id ?? null,
      };

    default:
      return null; // event types we deliberately ignore
  }
}

/**
 * KNOWN GAP (documented, not guessed): the current frontend references
 * placeholder Stripe price IDs — price_supporter_tier / price_guardian_tier /
 * price_archangel_tier — which do not exist in any Stripe account. Recurring
 * tier checkout cannot work until real products and prices are created and
 * the ids are supplied. See docs/BACKEND_INVENTORY.md §10.
 */
export const PLACEHOLDER_PRICE_IDS = Object.freeze([
  'price_supporter_tier',
  'price_guardian_tier',
  'price_archangel_tier',
]);
