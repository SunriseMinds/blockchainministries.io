/**
 * Turnstile middleware for public submission endpoints.
 *
 * Reads the body once and caches it on the context so the route handler does
 * not have to re-read the (already consumed) request stream.
 */
import { readJson, clientIp } from '@reellink/core/http.js';
import { verifyTurnstile, TURNSTILE_FIELD } from './turnstile.js';

/**
 * Verifies the captcha token from the JSON body, then leaves the parsed body
 * at ctx.body for the handler.
 */
export async function requireTurnstile(ctx) {
  const body = ctx.body ?? (await readJson(ctx.request));
  ctx.body = body;
  await verifyTurnstile(ctx, body[TURNSTILE_FIELD], clientIp(ctx.request));
}
