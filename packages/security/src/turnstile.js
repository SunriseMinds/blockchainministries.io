/**
 * Cloudflare Turnstile — server-side verification only.
 *
 * The browser widget produces a token; it means nothing until this Worker
 * exchanges it with Cloudflare's siteverify endpoint using the secret key.
 * The secret never reaches the client.
 */
import { badRequest, HttpError } from '@reellink/core/http.js';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * @param {object} ctx
 * @param {string} token value of the `cf-turnstile-response` field
 * @param {string} [ip]
 * @returns {Promise<void>} resolves when human-verified, throws otherwise
 */
export async function verifyTurnstile(ctx, token, ip) {
  // Gated: when USE_TURNSTILE is off the check is skipped entirely so the
  // parallel backend is testable before a widget exists.
  if (!ctx.flags.USE_TURNSTILE) return;

  const secret = ctx.env.TURNSTILE_SECRET;
  if (!secret) {
    // Fail CLOSED: if protection is switched on it must actually protect.
    throw new HttpError(503, 'unavailable', 'Turnstile is enabled but TURNSTILE_SECRET is not configured');
  }
  if (!token || typeof token !== 'string') throw badRequest('Missing captcha token');

  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip && ip !== 'unknown') body.append('remoteip', ip);

  let outcome;
  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body });
    outcome = await res.json();
  } catch {
    throw new HttpError(502, 'captcha_unavailable', 'Could not verify captcha, please retry');
  }

  if (!outcome?.success) {
    throw new HttpError(403, 'captcha_failed', 'Captcha verification failed');
  }
}

/** Field name the frontend widget submits. */
export const TURNSTILE_FIELD = 'cf-turnstile-response';
