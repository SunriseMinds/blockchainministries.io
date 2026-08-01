/**
 * Request context + application bootstrap.
 *
 * This is the seam between platform and business logic. An application calls
 * `createApp()` with its own route modules and configuration; everything else
 * — flag gating, CSRF, session loading, error shaping — is platform behaviour
 * that no application should reimplement.
 */
import { Router } from './router.js';
import { errorResponse, unavailable, json } from '@reellink/core/http.js';
import { getFlags, describeFlags } from '@reellink/core/flags.js';

/**
 * @typedef {object} AppDefinition
 * @property {string} name                      application identifier
 * @property {(router: Router) => void} routes  mounts the application's routes
 * @property {string[]} [flags]                 extra application feature flags
 * @property {string}  [basePath]               defaults to '/api'
 * @property {Function[]} [middleware]          runs before every matched route
 */

/**
 * Build a fetch handler for an application.
 *
 * Returns `{ handle }` where `handle(ctx)` serves the API. The caller keeps
 * control of everything outside the API base path (e.g. SPA asset serving), so
 * the platform never dictates how a site's frontend is delivered.
 *
 * @param {AppDefinition} app
 */
export function createApp(app) {
  const basePath = app.basePath ?? '/api';
  let router = null;

  function build() {
    const r = new Router();
    // Health is provided by the platform so every app exposes the same probe.
    r.get(`${basePath}/health`, [], (ctx) => json({
      ok: true,
      service: app.name,
      flags: describeFlags(ctx.env, app.flags ?? []),
      time: new Date().toISOString(),
    }));
    app.routes(r);
    return r;
  }

  return {
    basePath,

    /** @param {object} ctx */
    async handle(ctx) {
      if (!ctx.flags.USE_NEW_API) {
        // Master switch off: the API is not mounted at all.
        return errorResponse(unavailable('API is not enabled in this environment'));
      }
      if (!router) router = build();

      try {
        for (const mw of app.middleware ?? []) {
          const early = await mw(ctx);
          if (early instanceof Response) return early;
        }
      } catch (err) {
        return errorResponse(err, ctx);
      }
      return router.handle(ctx);
    },
  };
}

/**
 * Build the per-request context passed to middleware and handlers.
 *
 * @param {Request} request
 * @param {object} env
 * @param {ExecutionContext} executionCtx
 * @param {string[]} [extraFlags]
 */
export function createContext(request, env, executionCtx, extraFlags = []) {
  const url = new URL(request.url);
  return {
    request,
    env,
    url,
    flags: getFlags(env, extraFlags),
    executionCtx,
    waitUntil: (p) => executionCtx?.waitUntil?.(p),
    // Correlates logs, audit rows and error responses for one request.
    requestId: request.headers.get('CF-Ray') || crypto.randomUUID(),
    // Populated by middleware.
    session: null,
    sessionLoaded: false,
    params: {},
    body: undefined,
  };
}

/** True when the request targets the API base path. */
export function isApiRequest(url, basePath = '/api') {
  return url.pathname === basePath || url.pathname.startsWith(`${basePath}/`);
}
