/**
 * M14.1 — Stripe idempotency keys that actually survive a retry.
 *
 * THE BUG THIS REPLACES
 * Both checkout routes passed `idempotencyKey: crypto.randomUUID()`, minted
 * fresh inside the request handler. A retry therefore carried a NEW key, which
 * is precisely the case the header exists to defend against: Stripe saw two
 * unrelated requests and could create two Sessions — two chances to be
 * charged — from one donor pressing a button twice on a flaky connection.
 *
 * THE CONTRACT
 * The browser mints one opaque `request_id` per INTENTIONAL giving action and
 * reuses it for every retry of that same action. The server derives the Stripe
 * key deterministically from:
 *
 *     operation  the giving action  (one-time vs tier — never interchangeable)
 *   + subject    server-known identity (session user id, or "anon")
 *   + requestId  the client's per-action nonce
 *
 * Properties that matter:
 *   - Same logical retry  -> identical key -> Stripe returns the first Session.
 *   - New intentional gift -> new request id -> new key -> a second gift is
 *     still possible, which a naive amount-based key would have blocked.
 *   - A one-time and a subscription action can never collide: `operation` is
 *     part of the key and the two values are disjoint.
 *   - Amount and price are deliberately ABSENT. Keying on them would conflate
 *     two genuine $50 gifts into one, and would let a caller change the amount
 *     mid-retry while keeping the key.
 *
 * SECURITY
 * `request_id` is a nonce, never a credential. Nothing is authorized by it and
 * nothing is looked up by it; `subject` comes from the session cookie, so one
 * caller cannot reuse another's key to reach their Session. It is also scoped
 * by subject, so two anonymous donors colliding on a random id would need to
 * collide across 22+ URL-safe characters.
 *
 * No D1 state: Stripe already stores idempotent responses for 24 hours, which
 * is longer than any legitimate retry window for a button press.
 */
import { badRequest } from '@reellink/core/http.js';

/** The giving actions that may create a Stripe object. Disjoint by construction. */
export const OPERATIONS = Object.freeze({
  ONE_TIME: 'donate-once',
  TIER: 'tier-subscribe',
});

const REQUEST_ID = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Validate the client's per-action nonce.
 *
 * Bounded and character-restricted because it is interpolated into the
 * Stripe-bound key: 64 chars keeps the whole key far inside Stripe's 255-char
 * limit, and the charset admits no separator that could let one field
 * impersonate another (see keyFor's `:` delimiter).
 */
export function validateRequestId(body, field = 'request_id') {
  const value = body?.[field];
  if (typeof value !== 'string' || !REQUEST_ID.test(value)) {
    throw badRequest('Invalid request_id');
  }
  return value;
}

/**
 * Derive the Stripe Idempotency-Key.
 *
 * @param {string} operation one of OPERATIONS
 * @param {string|null} subject session user id, or null for an anonymous gift
 * @param {string} requestId validated client nonce
 */
export function keyFor(operation, subject, requestId) {
  return `bm:${operation}:${subject || 'anon'}:${requestId}`;
}
