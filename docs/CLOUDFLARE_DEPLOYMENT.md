# Cloudflare Pages Deployment — Blockchain Ministries

Exact settings to deploy this React/Vite SPA to **Cloudflare Pages**. This covers
the **frontend only** — Supabase and Firebase remain the backend for now
(no backend migration yet).

## Product choice
**Cloudflare Pages** (not Workers). The app is a static SPA — no server-side code
runs at request time today. Pages Functions/Workers come later, only when the
backend migration begins.

---

## 1. Connect the repository
- Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
- Repository: **`SunriseMinds/blockchainministries.io`**.

## 2. Build settings (enter exactly)
| Setting | Value |
|---|---|
| **Framework preset** | `Vite` (or "None" — settings below are what matter) |
| **Root directory** | `/` (repository root) |
| **Build command** | `npm run build` |
| **Build output directory** | `dist` |
| **Install command** | `npm ci` (auto-detected from `package-lock.json`) |
| **Production branch** | `main` |

> **Production branch note:** the approved Phase 2A work is currently on
> `claude/blockchain-ministries-github-4lpvcf`. Cloudflare builds its **production**
> deployment from the branch set as "Production branch" (recommended: `main`).
> To ship to production, merge the feature branch into `main` first (open a PR when
> you're ready — I won't push to `main` without your go). Until then, Cloudflare
> creates a **preview deployment** for the feature branch that you can test on a
> `*.pages.dev` URL immediately.

## 3. Node version
The repo pins Node via `.nvmrc` = **22**. Cloudflare Pages reads `.nvmrc`
automatically. To be explicit, also add an environment variable:
- `NODE_VERSION = 22`

## 4. Environment variables (Pages → Settings → Environment variables)
Set these for **Production** (and **Preview** if you want previews fully functional).
Only `VITE_*` (public) values belong here — **never** put server secrets in Pages.

| Variable | Required? | Notes |
|---|---|---|
| `VITE_STRIPE_PUBLISHABLE_KEY` | For donations | `pk_live_...` (or `pk_test_...` for preview) |
| `VITE_PAYPAL_CLIENT_ID` | For PayPal | public client id |
| `VITE_SUPABASE_URL` | Optional | app currently hard-codes this; set for consistency |
| `VITE_SUPABASE_ANON_KEY` | Optional | public anon key; hard-coded today |
| `VITE_NEXT_PUBLIC_SITE_URL` | Optional | `https://blockchainministries.io` |
| `VITE_NEXT_PUBLIC_XRPL_EXPLORER` | Optional | `https://livenet.xrpl.org` |

> The site will build and render without any env vars because Supabase URL/anon key
> are hard-coded in the export. Stripe/PayPal flows, however, need their `VITE_*`
> keys to function.

## 5. SPA routing & headers (already in the repo)
- **`public/_redirects`** → `/*  /index.html  200` (client-side routes and refreshes
  return the app, not 404). No extra Pages config needed.
- **`public/_headers`** → conservative security headers + long-cache for `/assets/*`.
  No CSP (intentional, to avoid breaking Supabase/fonts/Stripe/PayPal/wallets).

Do **not** add a second redirect system — `_redirects` is the single source of truth.

## 6. First deploy & verification (on the temporary `*.pages.dev` URL)
Verify before touching DNS:
1. Home renders identically to Hostinger (fonts, gold-on-blue theme, animations).
2. Direct-load and refresh on deep routes: `/about`, `/ministries`, `/scrolls`,
   `/token`, `/join`, `/donate`, `/contact`, `/login`, `/privacy`, `/terms` → all 200,
   no 404.
3. Unknown route (e.g. `/nope`) shows the in-app "404 - Scroll Not Found" page.
4. Auth: sign-up / login / logout / password reset work (Supabase). **Add the
   `*.pages.dev` origin to Supabase Auth → URL Configuration** (redirect URLs), or
   password-reset/verify links will fail.
5. Forms: contact + scroll request submit (writes to Supabase).
6. Browser console clean of blocking errors; `favicon.svg`, `robots.txt`,
   `sitemap.xml` load.
7. Mobile + desktop layouts.

## 7. Custom domain (LATER — do not attach yet)
Do **not** attach `blockchainministries.io` or change DNS until the `*.pages.dev`
deployment is tested and approved. Hostinger must stay live as the fallback. When
approved, add the custom domain in Pages → Custom domains and follow the DNS steps
then (separate approval).

## 8. GitHub Actions
None configured in this repo (`.github/workflows` absent). Cloudflare Pages builds
directly from the Git integration, so no Actions workflow is required. (Optional: a
CI workflow to run `npm run build` on PRs can be added later if desired.)

## Quick reference
```
Framework preset:        Vite
Root directory:          /
Build command:           npm run build
Build output directory:  dist
Production branch:        main   (merge feature branch first)
Node version:            22      (.nvmrc; or NODE_VERSION=22)
Public env vars:         VITE_STRIPE_PUBLISHABLE_KEY, VITE_PAYPAL_CLIENT_ID,
                         VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,
                         VITE_NEXT_PUBLIC_SITE_URL, VITE_NEXT_PUBLIC_XRPL_EXPLORER
SPA fallback:            public/_redirects  (/* /index.html 200)
Headers:                 public/_headers
Custom domain:           attach later, after approval
```
