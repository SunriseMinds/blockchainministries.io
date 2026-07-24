/**
 * Static-asset Worker for the Blockchain Ministries React 18 + Vite SPA.
 *
 * Built assets in ./dist are served directly by Cloudflare's static-assets layer
 * BEFORE this Worker runs. This handler is therefore invoked only for requests
 * that do NOT match a built asset, and implements SPA-aware fallback:
 *
 *   - A path that looks like a file (its last segment contains a ".") is treated
 *     as a missing asset and returns a genuine 404 — so broken asset references
 *     are surfaced, not silently masked by index.html.
 *   - Any other path is a client-side route (React Router), so index.html is
 *     served (HTTP 200) to make deep links and refreshes work.
 *
 * No application/server logic lives here — this is routing only. Backend APIs
 * (D1/R2/Workers) are a separate, later phase.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
