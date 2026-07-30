/**
 * API entry point. Builds the router and dispatches /api/* requests.
 *
 * Route groups are mounted here. Everything is gated by USE_NEW_API, which is
 * false unless explicitly enabled, so production behaviour is unchanged.
 */
import { Router } from './router.js';
import { json, errorResponse, unavailable } from '../lib/http.js';
import { describeFlags } from '../config/flags.js';

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

  return r;
}

/**
 * @param {object} ctx { request, env, url, flags, ctx: ExecutionContext }
 * @returns {Promise<Response>}
 */
export async function handleApi(ctx) {
  if (!ctx.flags.USE_NEW_API) {
    // Master switch off: the parallel backend is not mounted.
    return errorResponse(unavailable('API is not enabled in this environment'));
  }
  if (!cached) cached = buildRouter();
  return cached.handle(ctx);
}
