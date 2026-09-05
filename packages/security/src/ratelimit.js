/**
 * Fixed-window rate limiting backed by KV.
 *
 * Fails OPEN when the KV binding is absent so that a misconfigured preview
 * environment cannot lock users out — but auth routes additionally enforce
 * per-account lockout in D1, which does not depend on KV.
 */
import { tooManyRequests } from '@reellink/core/http.js';

/** Named policies: [maxAttempts, windowSeconds]. */
export const POLICIES = Object.freeze({
  login: [5, 15 * 60],
  signup: [3, 60 * 60],
  passwordReset: [3, 60 * 60],
  publicForm: [5, 60 * 60],
  payment: [10, 60 * 60],
  verifyEmail: [10, 60 * 60],
  // M9.8 — magic-link login request. Same shape as `login`: unguessable
  // token makes brute force moot, this limit is purely abuse/cost control.
  loginLink: [5, 15 * 60],
});

/**
 * @param {object} ctx
 * @param {keyof POLICIES} policy
 * @param {string} identifier e.g. ip, or `${ip}:${email}`
 * @throws {HttpError} 429 when the window is exhausted
 */
export async function enforce(ctx, policy, identifier) {
  const kv = ctx.env.RATE_LIMIT;
  if (!kv) return; // fail open — see module note
  const [max, windowSeconds] = POLICIES[policy] ?? POLICIES.publicForm;

  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `rl:${policy}:${identifier}:${window}`;

  const current = Number((await kv.get(key)) ?? 0);
  if (current >= max) {
    throw tooManyRequests('Too many attempts. Please try again later.', windowSeconds);
  }
  // Not atomic (KV has no increment); over-counting under burst is acceptable
  // for abuse mitigation and always errs toward blocking, never allowing more.
  await kv.put(key, String(current + 1), { expirationTtl: windowSeconds + 60 });
}

/** Clear a counter after a successful, legitimate action (e.g. login). */
export async function reset(ctx, policy, identifier) {
  const kv = ctx.env.RATE_LIMIT;
  if (!kv) return;
  const [, windowSeconds] = POLICIES[policy] ?? POLICIES.publicForm;
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  await kv.delete(`rl:${policy}:${identifier}:${window}`);
}
