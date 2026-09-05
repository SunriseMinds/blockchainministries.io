/**
 * Worker entry for the Blockchain Ministries React 18 + Vite SPA.
 *
 * Two responsibilities, in order:
 *
 *  1. /api/*  → the parallel Cloudflare backend (D1 / R2 / Workers auth).
 *               Entirely feature-flagged; with USE_NEW_API unset it returns
 *               503 and touches nothing else. The production site does not
 *               call /api/* today (the SPA talks to Supabase directly), so
 *               mounting it cannot affect current behaviour.
 *
 *  2. everything else → the existing SPA routing, unchanged:
 *     built assets in ./dist are served by Cloudflare's static-assets layer
 *     BEFORE this Worker runs, so this handler only sees requests that did
 *     not match an asset. A path that looks like a file (last segment
 *     contains a ".") is a missing asset → genuine 404, so broken asset
 *     references stay visible. Anything else is a client-side route →
 *     index.html (200) so deep links and refreshes work.
 */
import { getFlags } from '@reellink/core/flags.js';
import { handleApi } from './routes/index.js';

export default {
  async fetch(request, env, executionCtx) {
    const url = new URL(request.url);

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return handleApi({
        request,
        env,
        url,
        flags: getFlags(env),
        executionCtx,
        waitUntil: (p) => executionCtx?.waitUntil?.(p),
      });
    }

    const lastSegment = url.pathname.split('/').pop() || '';

    // Missing file-like request -> real 404 (do not hide asset errors).
    if (lastSegment.includes('.')) {
      return new Response('Not Found', {
        status: 404,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }

    // Client-side route -> serve the SPA shell so React Router can render it.
    // Fetch the canonical "/" (not "/index.html", which the assets layer would
    // 307-redirect to "/") so the route resolves to index.html with HTTP 200.
    return env.ASSETS.fetch(new Request(new URL('/', url.origin), request));
  },
};
