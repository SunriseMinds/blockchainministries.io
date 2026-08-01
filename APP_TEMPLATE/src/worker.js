/**
 * <APP_NAME> — Worker entry point.
 *
 * This file is complete as-is. It contains NO platform logic: auth, sessions,
 * roles, D1/R2/KV, Turnstile, rate limiting, audit, routing and validation all
 * come from @reellink/*. You should not need to edit it.
 */
import { createApp, createContext, isApiRequest } from '@reellink/api';
import { requireSameOrigin, loadSession } from '@reellink/auth/middleware.js';
import { mountRoutes } from './routes.js';
import { APP } from './config.js';

const app = createApp({
  name: APP.name,
  flags: APP.flags,
  routes: mountRoutes,
  // Same-origin (CSRF) guard, then best-effort session load for every route.
  middleware: [requireSameOrigin, loadSession],
});

export default {
  async fetch(request, env, executionCtx) {
    const ctx = createContext(request, env, executionCtx, APP.flags);
    if (isApiRequest(ctx.url, app.basePath)) return app.handle(ctx);

    // Static assets are served by Cloudflare before the Worker runs, so a
    // file-like miss is a genuine 404; anything else is a client-side route.
    const last = ctx.url.pathname.split('/').pop() || '';
    if (last.includes('.')) return new Response('Not Found', { status: 404 });
    return env.ASSETS.fetch(new Request(new URL('/', ctx.url.origin), request));
  },
};
