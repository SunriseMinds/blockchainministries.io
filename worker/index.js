/**
 * Worker entry for the Blockchain Ministries React 18 + Vite SPA.
 *
 * Two responsibilities, in order:
 *
 *  1. /api/*  → the Cloudflare backend (D1 / R2 / Workers auth). This is the
 *               only backend the SPA talks to (Supabase was retired in M10.4).
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
  /**
   * M14.4 — scheduled XRPL reconciliation.
   *
   * The XRP Ledger has no webhooks, so a donor who pays and closes the tab
   * would otherwise never be credited. This sweep reads the ministry
   * donation address's own validated history and records what the donor-
   * submitted fast path missed.
   *
   * Strictly bounded and read-only: one capped page of `account_tx` per run,
   * resuming from the highest ledger already recorded. It signs nothing, and
   * it never runs on the request path — `fetch` traffic is untouched.
   *
   * Fails quietly by design. If XRP giving is not configured (the normal
   * state until the owner supplies a donation address) there is nothing to
   * do, and a cron tick must not become noise.
   */
  async scheduled(event, env, executionCtx) {
    const run = async () => {
      let cfg;
      try {
        const { donationConfig } = await import('./config/xrpl.js');
        cfg = donationConfig(env);
      } catch {
        return; // rail not configured — nothing to reconcile
      }
      if (!env.DB) return;
      try {
        const { reconcile } = await import('./payments/xrplReconcile.js');
        const summary = await reconcile({ env }, cfg);
        // A SUMMARY only. No transaction payloads, no addresses, no amounts
        // beyond counts — the donation rows themselves are the record.
        console.log('[xrpl reconcile]', JSON.stringify({ cron: event?.cron, ...summary }));
      } catch (err) {
        console.error('[xrpl reconcile] sweep failed', err?.message || 'unknown');
      }
    };
    // waitUntil so a slow ledger node cannot hold the scheduled invocation open.
    if (executionCtx?.waitUntil) executionCtx.waitUntil(run());
    else await run();
  },

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
