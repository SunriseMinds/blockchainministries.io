# Cloudflare Deployment — Blockchain Ministries (Workers Builds)

Exact settings to deploy this React 18 + Vite **static SPA** through Cloudflare's
current **Workers Builds** Git integration (static assets via Wrangler). This covers
the **frontend only** — Supabase and Firebase remain the backend for now.

> Uses the current Workers Builds flow, **not** the older Cloudflare Pages dashboard.

## How it works
- The build runs `npm run build`, producing `./dist`.
- `wrangler.jsonc` (repo root) declares a **static-assets-only Worker** (no fetch
  handler) that serves `./dist`.
- SPA routing is handled natively by `assets.not_found_handling:
  "single-page-application"` — no `_redirects` file (removed to avoid a conflicting
  fallback that would also mask missing-asset 404s).

## `wrangler.jsonc` (already in the repo)
```jsonc
{
  "name": "blockchainministries-io",
  "compatibility_date": "2025-01-01",
  "assets": {
    "directory": "./dist",
    "not_found_handling": "single-page-application"
  }
}
```
- **No `main`/Worker script** — a fetch handler is only added later when server-side
  APIs (D1/R2/Workers) are introduced.
- `single-page-application` mode rewrites only extension-less navigation requests to
  `index.html` (200); a request for a real-looking asset path that is missing still
  returns a genuine 404, so broken asset references are not hidden.

---

## Cloudflare dashboard — exact field values (Workers Builds)
| Field | Value |
|---|---|
| **Project name** | `blockchainministries-io` |
| **Build command** | `npm run build` |
| **Deploy command** | `npx wrangler deploy` |
| **Non-production branch deploy command** | `npx wrangler versions upload` |
| **Path** | `/` |
| **Production branch** | `main` |

### Node version
Repo pins Node via `.nvmrc` = **22** (Workers Builds reads it). Optionally set build
env var `NODE_VERSION = 22` to be explicit.

### Environment variables (build-time, PUBLIC only)
Set on the build configuration. Only `VITE_*` (public) values — **never** server
secrets (no Stripe secret, SMTP, XRPL seed, Supabase service role, or API tokens here).

| Variable | Required? | Notes |
|---|---|---|
| `VITE_STRIPE_PUBLISHABLE_KEY` | For donations | `pk_live_...` / `pk_test_...` |
| `VITE_PAYPAL_CLIENT_ID` | For PayPal | public client id |
| `VITE_SUPABASE_URL` | Optional | hard-coded fallback exists |
| `VITE_SUPABASE_ANON_KEY` | Optional | public anon key; hard-coded fallback exists |
| `VITE_NEXT_PUBLIC_SITE_URL` | Optional | `https://blockchainministries.io` |
| `VITE_NEXT_PUBLIC_XRPL_EXPLORER` | Optional | `https://livenet.xrpl.org` |

> The app builds and renders without any env vars (Supabase URL/anon key are
> hard-coded in the export); Stripe/PayPal flows need their `VITE_*` keys.

### API token permissions (if you create a scoped token instead of OAuth)
When connecting via the dashboard's Git integration you normally authorize with your
Cloudflare login. If you instead use a **custom API token** (e.g. for CI), grant:
- **Workers Scripts: Edit** (deploy the Worker + upload versions)
- **Account Settings: Read** (resolve the account)
- **Workers Builds** / Workers R2/D1 etc. — only add later when those bindings exist
- Scope the token to the **specific account** (and zone only if attaching a domain)

Least privilege: Workers Scripts **Edit** + Account **Read** is sufficient for the
static-assets deploy described here.

---

## Local commands (optional, mirror the dashboard)
```bash
npm ci
npm run build
npx wrangler deploy --dry-run   # validate config without deploying
npx wrangler deploy             # production deploy (needs Cloudflare auth)
npx wrangler versions upload    # non-production/preview version
```
Convenience scripts also exist: `npm run deploy`, `npm run deploy:preview`.

## Production branch note
Approved work currently lives on `claude/blockchain-ministries-github-4lpvcf`.
Workers Builds deploys **production** from the branch set as **Production branch**
(recommended: `main`). Merge the feature branch into `main` when ready (open a PR —
`main` is not pushed to without approval). Non-production branches get a preview
version via `wrangler versions upload`.

## Verification (before any DNS change)
On the temporary `*.workers.dev` URL:
1. Home renders identically to Hostinger (fonts, gold-on-blue theme, animations).
2. Direct-load + refresh deep routes: `/about`, `/ministries`, `/scrolls`, `/token`,
   `/join`, `/donate`, `/contact`, `/login`, `/privacy`, `/terms` → all 200.
3. Unknown route (e.g. `/nope`) → in-app "404 - Scroll Not Found".
4. A missing asset path returns a real 404 (not index.html).
5. Auth (Supabase): sign-up/login/logout/reset — **add the `*.workers.dev` origin to
   Supabase → Authentication → URL Configuration** or email links fail.
6. Contact + scroll-request forms submit (write to Supabase).
7. Console clean; `favicon.svg`, `robots.txt`, `sitemap.xml`, `_headers` apply.
8. Mobile + desktop.

## Custom domain (LATER — do not attach yet)
Do not attach `blockchainministries.io` or change DNS until the temporary deployment
is tested and approved. Hostinger stays live as fallback.

## Quick reference
```
Project name:            blockchainministries-io
Build command:           npm run build
Deploy command:          npx wrangler deploy
Non-prod deploy command: npx wrangler versions upload
Path:                    /
Production branch:       main   (merge feature branch first)
Node version:            22
Output directory:        ./dist  (via wrangler.jsonc assets.directory)
SPA fallback:            wrangler.jsonc not_found_handling=single-page-application
Headers:                 public/_headers
Custom domain:           attach later, after approval
```
