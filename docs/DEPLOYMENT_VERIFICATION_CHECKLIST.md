# Deployment Verification Checklist — Blockchain Ministries

Frontend deployment verification for the Cloudflare Workers Builds static-assets
deploy. **Backend migration not started.** Supabase + Firebase remain live.

- **Branch:** `claude/blockchain-ministries-github-4lpvcf`
- **Verified commit:** `317abd4` (SPA Worker + EISDIR fix + Workers Builds config)
- **How verified:** local `wrangler dev` (faithful to production static-assets +
  Worker routing) and headless Chromium render — see method notes per row.

## Legend
✅ PASS (genuinely tested) · ⚠️ NEEDS LIVE URL · 🔑 NEEDS CREDENTIALS · ℹ️ INFO

---

## A. Routing & static serving (tested locally via `wrangler dev`)
| Check | Result | Evidence |
|---|---|---|
| All app routes return 200 | ✅ | `/ /about /ministries /ordination /join /membership/apply /scrolls /token /donate /recognition /partnerships /contact /ministers /login /signup /forgot-password /privacy /terms` → all 200 |
| Direct-route load (deep link) | ✅ | curl of each deep path returns index.html (200) |
| Browser refresh on nested route | ✅ | same paths served by SPA Worker regardless of entry |
| Unknown navigation route | ✅ | `/unknown-route` → 200, app renders in-app "404 - Scroll Not Found" |
| **Missing asset returns real 404** | ✅ | `/assets/x.js`, `/nope.css`, `/images/missing.png`, `/favicon.ico` → **404** (not index.html) |
| Real hashed asset serves | ✅ | `/assets/About-*.js` → 200 |
| favicon.svg | ✅ | 200, `image/svg+xml` |
| robots.txt | ✅ | 200 |
| sitemap.xml | ✅ | 200, `text/xml` |
| llms.txt (build-generated) | ✅ | 200, now complete (EISDIR fixed) |
| Security headers (`_headers`) | ✅ | `x-content-type-options`, `x-frame-options: SAMEORIGIN`, `referrer-policy`, `permissions-policy` present |

## B. Rendering & design (tested via headless Chromium against `wrangler dev`)
| Check | Result | Evidence |
|---|---|---|
| React app mounts / not blank | ✅ | `#root` renders 545–3712 chars of content on every route |
| Per-page metadata (react-helmet) | ✅ | title changes per route (e.g. Token → "🕊️ EFT — …", Privacy → "Privacy Policy - …") |
| Design elements present (icons/animation nodes) | ✅ | 5–24 `svg`/animation nodes per page rendered |
| Navigation renders | ✅ | header nav (Home/About/Ministries/Scrolls/Token/Contact/Login) present on all pages |
| Fonts (Cinzel/Inter via Google Fonts) | ⚠️ | external font host is network-blocked in the test sandbox; renders with fallback locally — confirm on live preview |
| Animations (framer-motion) visual smoothness | ⚠️ | motion components mount; visual smoothness needs a real browser on the live preview |
| Mobile navigation (hamburger/interactions) | ⚠️ | requires interactive testing on the live preview at mobile viewport |

## C. Browser console
| Check | Result | Notes |
|---|---|---|
| Hard JS errors from app code | ✅ (none) | no React/runtime errors originating in app bundles |
| Console errors overall | ⚠️ | In the sandbox, external CDNs are blocked, producing `supabase is not defined` (from the `index.html` jsDelivr bootstrap) and PayPal/Firestore load failures. **These are environment artifacts and should not occur in production where those hosts load.** A fully clean production console must be confirmed on the live preview. See finding **F-1**. |

## D. Forms, auth, payments, wallet (NOT claimed working — require live backend/credentials)
| Element | Status | Notes |
|---|---|---|
| Contact form → `contact_inquiries` | 🔑 | code inserts to Supabase; write path needs live Supabase + RLS to test |
| Scroll request → `scroll_requests` | 🔑 | same |
| Login / Signup / Password reset | 🔑 | Supabase Auth; needs credentials + `*.workers.dev` added to Supabase Auth URL config |
| Stripe donate/tiers | 🔑 / ℹ️ | needs `VITE_STRIPE_PUBLISHABLE_KEY`; **tier price IDs are placeholders** (`price_supporter_tier`, `price_guardian_tier`, `price_archangel_tier`) — code shows a "must create products/prices in Stripe" note; also needs the `stripe-create-intent` Edge Function |
| PayPal | ℹ️ | `main.jsx` hardcodes `client-id: "test"`; `PaypalDonate` uses `VITE_PAYPAL_CLIENT_ID || 'YOUR_PAYPAL_CLIENT_ID'` and self-displays an "unconfigured" message; **placeholder subscription plan ID** |
| Wallet / XRPL (Xaman/XUMM, trustline) | ✅ (safe) / 🔑 | external links use `target="_blank" rel="noopener noreferrer"`; actual wallet round-trip needs a real XUMM app + on-chain test |
| Scroll / document downloads | 🔑 | depends on data + (future) R2; not testable now |

## E. Cloudflare deployment state (from Cloudflare API via MCP + timestamps)
| Item | Finding |
|---|---|
| Worker exists | ✅ `blockchainministries-io` (id `07da37b1…`), created `2026-07-23T21:39:31Z`, modified `2026-07-23T21:57:35Z` |
| Worker type | assets-oriented (no fetchable script returned by the API before this change) |
| **Production Worker version id** | ❓ not exposed by available MCP tools — check Workers → Deployments in the dashboard |
| **Feature-branch preview version** | ❓ not confirmed — no successful preview build of `317abd4` verified from here |
| **Commit serving apex `blockchainministries.io`** | ❓ cannot determine — the live domain is network-blocked from this environment (403 at the agent proxy) |
| **Commit serving `www.blockchainministries.io`** | ❓ same — cannot fetch from here |
| Domains serving latest feature code vs older | ❓ cannot verify from here; the last dashboard deploy log **failed at the deploy step** (wrong wrangler version), so the current commit is very likely **not** yet live |

> **Important:** commit `317abd4` (with the SPA Worker and the corrected deploy
> command) has **not** been confirmed deployed. Re-run the Workers Build with
> **Deploy command = `npm run deploy`** to deploy it, then re-verify items marked ⚠️
> on the real `*.workers.dev` preview URL.

## F. Findings
- **F-1 (recommendation, not yet applied):** `index.html` loads Supabase from
  `cdn.jsdelivr.net` and creates a `globalSupabaseClient` that the React app **does
  not use** (the app uses the bundled npm client in `src/lib/customSupabaseClient.js`).
  This dead bootstrap adds an external dependency and throws
  `supabase is not defined` if the CDN is unavailable. Removing the two script lines
  would eliminate that failure mode without touching the app's real Supabase usage.
  **Left in place pending approval** (touches Supabase-adjacent code).

## How to reproduce the local verification
```bash
npm ci
npm run build
npx wrangler dev --port 8788 --local --ip 127.0.0.1   # serves ./dist via worker/index.js
# then curl routes / open in a browser
```
