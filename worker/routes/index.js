/**
 * API entry point. Builds the router and dispatches /api/* requests.
 *
 * Everything is gated by USE_NEW_API, which is false unless explicitly
 * enabled, so production behaviour is unchanged and the SPA keeps talking to
 * Supabase until cutover.
 */
import { Router } from '@reellink/api/router.js';
import { json, errorResponse, unavailable } from '@reellink/core/http.js';
import { describeFlags } from '@reellink/core/flags.js';
import { requireSameOrigin, loadSession } from '@reellink/auth/middleware.js';
import { templates } from '../email/templates.js';
import { mountAuthRoutes } from '@reellink/auth/routes.js';
import { mount as mountPublic } from './public.js';
import { mount as mountAdmin } from './admin.js';
import { mount as mountFiles } from './files.js';

let cached = null;

function buildRouter() {
  const r = new Router();

  // Liveness + flag introspection. Deliberately exposes no data.
  r.get('/api/health', [], (ctx) => json({
    ok: true,
    service: 'blockchainministries-api',
    flags: describeFlags(ctx.env),
    time: new Date().toISOString(),
  }));

  // Platform authentication routes; only the email copy is ours.
  mountAuthRoutes(r, { templates });
  mountPublic(r);
  mountAdmin(r);
  mountFiles(r);
  return r;
}

/**
 * @param {object} ctx { request, env, url, flags, executionCtx, waitUntil }
 * @returns {Promise<Response>}
 */
export async function handleApi(ctx) {
  if (!ctx.flags.USE_NEW_API) {
    // Master switch off: the parallel backend is not mounted.
    return errorResponse(unavailable('API is not enabled in this environment'));
  }
  if (!cached) cached = buildRouter();

  try {
    // CSRF guard on state-changing requests, then best-effort session load so
    // handlers and audit logging can see the caller without each re-doing it.
    const early = await requireSameOrigin(ctx);
    if (early instanceof Response) return early;
    await loadSession(ctx);
  } catch (err) {
    return errorResponse(err);
  }

  return cached.handle(ctx);
}
