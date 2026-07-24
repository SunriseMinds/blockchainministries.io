# Blockchain Ministries

The official website of **Blockchain Ministries**, a sovereign ecclesiastical
trust — offering ordination, sacred scrolls, the EFT token, membership, and
information on global recognition. Migrated from a Hostinger Horizons export and
prepared for deployment on Cloudflare Pages.

## Tech stack (detected)
- **React 18** SPA built with **Vite**
- **React Router v6** (`BrowserRouter`)
- **Tailwind CSS 3** + shadcn/ui (Radix) + **framer-motion**
- **Supabase** — authentication + application database (transitional)
- **Firebase Firestore** — ministers directory (temporary)
- Payments: **Stripe**, **PayPal**, **Coinbase Commerce**
- On-chain: **XRP Ledger** / **Xaman (XUMM)** for the EFT token & trustline

> A migration to a Cloudflare-native backend (Workers/Pages Functions + D1 + R2 +
> Turnstile) is **designed but not yet implemented** — see `docs/`. Supabase and
> Firebase remain live until that work is completed and validated.

## Requirements
- Node **22** (see `.nvmrc`)
- npm (repo uses `package-lock.json`)

## Install
```bash
npm ci
```

## Develop
```bash
npm run dev      # Vite dev server on http://localhost:3000
```

## Production build
```bash
npm run build    # outputs to dist/
```
**Build output directory:** `dist`

## Preview the production build
```bash
npm run preview
```

## Test / lint
```bash
npm run lint     # eslint
```
> Note: the exported shadcn/ui component kit under `src/components/ui/` includes
> unused components that reference Radix packages not listed in `package.json`,
> producing `import/no-unresolved` lint errors. These files are not imported by any
> routed page and **do not affect the production build**. They are left as-is for now.

## Environment variables
Copy `.env.example` to `.env` (local) or set in Cloudflare Pages. Only `VITE_*`
(public) values belong in the frontend; server secrets must live in server-side
secret storage, never in the repo.

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Supabase (public anon; hard-coded fallback exists) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe donations |
| `VITE_PAYPAL_CLIENT_ID` | PayPal |
| `VITE_NEXT_PUBLIC_SITE_URL` | `https://blockchainministries.io` |
| `VITE_NEXT_PUBLIC_XRPL_EXPLORER` | `https://livenet.xrpl.org` |

## Deployment (Cloudflare Workers Builds)
Deployed as a static-assets Worker via `wrangler.jsonc` through Cloudflare's current
Workers Builds Git integration.

| Dashboard field | Value |
|---|---|
| Project name | `blockchainministries-io` |
| Build command | `npm run build` |
| Deploy command | `npm run deploy` |
| Non-production branch deploy command | `npm run deploy:preview` |
| Path | `/` |
| Production branch | `main` |
| Node version | `22` (set `NODE_VERSION=22` env var) |

> Use the npm scripts (not `npx wrangler` directly) so the deploy uses the repo's
> pinned wrangler `4.114.0`; the Workers Builds `npx` path was seen fetching an
> older wrangler that fails to parse `vite.config.js`.

SPA routing is handled by a minimal Worker (`worker/index.js`) with static
assets from `./dist`: client-side routes serve `index.html` (200) while missing
file-like paths return a genuine 404; security headers by `public/_headers`.
(No `_redirects` file.) Full instructions, env vars, token permissions, and
verification steps: **`docs/CLOUDFLARE_DEPLOYMENT.md`**.

## Supabase configuration
After deploying, add the deployment origin(s) to **Supabase → Authentication → URL
Configuration** so login, email verification, and password-reset links resolve.
See `docs/SUPABASE_REQUIRED_CONFIGURATION.md` (to be added) and the backend
migration design in `docs/`.

## Documentation
- `docs/CLOUDFLARE_DEPLOYMENT.md` — Pages deployment settings & verification
- `docs/CLOUDFLARE_BACKEND_MIGRATION_PLAN.md` — target architecture & sequencing
- `docs/SUPABASE_TO_D1_SCHEMA_MAP.md` — table-by-table schema mapping
- `docs/AUTH_MIGRATION_OPTIONS.md` — authentication options & recommendation
- `docs/EDGE_FUNCTION_TO_WORKER_MAP.md` — Edge Functions → Workers
- `docs/R2_STORAGE_PLAN.md` — object storage (`bm-public`, `bm-protected`)
- `docs/DATA_EXPORT_AND_IMPORT_PLAN.md` — data migration & validation
- `docs/MIGRATION_ROLLBACK_PLAN.md` — feature flag & rollback

## License
Not yet specified. All rights reserved by Blockchain Ministries unless a license is
added by the owner.
