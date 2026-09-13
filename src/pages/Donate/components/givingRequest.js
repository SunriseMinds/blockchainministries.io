/**
 * M14.1 — the browser half of the idempotency contract.
 *
 * One opaque id per INTENTIONAL giving action, reused for every retry of that
 * same action. The server derives the Stripe Idempotency-Key from it plus
 * server-known identity (see worker/payments/idempotency.js), so pressing
 * "Give" twice on a flaky connection reaches the SAME Stripe Session instead
 * of creating a second chance to be charged.
 *
 * It is a nonce, never a credential: nothing is authorized or looked up by it,
 * and the server scopes it by session identity.
 *
 * Pure and framework-free so the retry semantics can be tested directly.
 */

/** 32 URL-safe characters from the platform CSPRNG. */
export function newRequestId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/** Mirrors the server's accepted shape — see validateRequestId. */
export const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Holds one request id per giving action and hands the SAME one back until
 * the action succeeds or the user starts a different one.
 *
 * `key` distinguishes intentional actions — a tier subscription and a one-off
 * gift of the same size are different acts and must never share an id.
 */
export function createRequestIds() {
  const live = new Map();
  return {
    /** Same key -> same id, so a retry is a retry. */
    forAction(key) {
      if (!live.has(key)) live.set(key, newRequestId());
      return live.get(key);
    },
    /** Call once an action genuinely completed, so the next gift is new. */
    complete(key) {
      live.delete(key);
    },
  };
}
