/**
 * The Original Vault — Worker entry.
 *
 * Contains NO platform code. Authentication, sessions, roles, D1/R2/KV,
 * Turnstile, rate limiting, audit and the router all come from
 * @reellink/* packages. Only the domain routes below are app-specific.
 */
import { createApp, createContext, isApiRequest } from '@reellink/api';
import { requireSameOrigin, loadSession } from '@reellink/auth/middleware.js';
import { mountRoutes } from './routes.js';

const app = createApp({
  name: 'the-original-vault',
  routes: mountRoutes,
  middleware: [requireSameOrigin, loadSession],
});

export default {
  async fetch(request, env, executionCtx) {
    const ctx = createContext(request, env, executionCtx);
    if (isApiRequest(ctx.url, app.basePath)) return app.handle(ctx);

    // Static assets are served by Cloudflare before the Worker runs; a
    // file-like miss is a real 404, anything else is a client-side route.
    const last = ctx.url.pathname.split('/').pop() || '';
    if (last.includes('.')) return new Response('Not Found', { status: 404 });
    return env.ASSETS.fetch(new Request(new URL('/', ctx.url.origin), request));
  },
};
