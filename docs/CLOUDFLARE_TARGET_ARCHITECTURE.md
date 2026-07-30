# Cloudflare Target Architecture

**Status: DESIGN.** No Cloudflare resources have been created. No authentication implemented.
No frontend changes. Supabase and Firebase remain live and untouched.

## Resources

| Resource | Name | Binding |
|---|---|---|
| Pages/Worker (existing) | `blockchainministries-io` | — |
| D1 database | `blockchain-ministries-db` | `DB` |
| R2 public bucket | `bm-public` | `PUBLIC_FILES` |
| R2 protected bucket | `bm-protected` | `PROTECTED_FILES` |
| KV (rate limiting / session cache) | `bm-rate-limit` | `RATE_LIMIT` |
| Turnstile | site key (public) + secret | `TURNSTILE_SECRET` |
| Cloudflare Access | policy on `/admin*` | — |

### Proposed `wrangler.jsonc` additions (not yet applied)
```jsonc
{
  "name": "blockchainministries-io",
  "main": "worker/index.js",
  "compatibility_date": "2025-01-01",
  "assets": { "directory": "./dist", "binding": "ASSETS" },
  "d1_databases": [
    { "binding": "DB", "database_name": "blockchain-ministries-db", "database_id": "<tbd>" }
  ],
  "r2_buckets": [
    { "binding": "PUBLIC_FILES",    "bucket_name": "bm-public" },
    { "binding": "PROTECTED_FILES", "bucket_name": "bm-protected" }
  ],
  "kv_namespaces": [ { "binding": "RATE_LIMIT", "id": "<tbd>" } ]
}
```
Secrets via `wrangler secret put` (never in config, never in the frontend):
`TURNSTILE_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `COINBASE_COMMERCE_API_KEY`,
`COINBASE_COMMERCE_WEBHOOK_SECRET`, `EMAIL_API_KEY`, `XRPL_SEED`, `XRPL_ISSUER_ADDRESS`,
`SESSION_PEPPER`.

## Request flow
```
Browser
  ├── static asset match  → Cloudflare static assets (dist/)
  └── /api/*              → Worker
                              ├── /api/admin/*  → Cloudflare Access JWT + role check → D1
                              ├── /api/*        → session cookie → D1
                              ├── public POSTs  → Turnstile verify → rate limit → D1
                              └── /api/files/*  → authz → R2 (PUBLIC_FILES | PROTECTED_FILES)
Non-asset, non-/api path   → index.html (SPA fallback, current behavior preserved)
```

## Worker route map

### Public (Turnstile-protected where marked ⛨)
| Method | Route | Notes |
|---|---|---|
| POST | `/api/contact` ⛨ | replaces direct `contact_inquiries` insert |
| POST | `/api/scroll-requests` ⛨ | replaces direct `scroll_requests` insert |
| GET | `/api/verify/:slug` | approved ordinations + published scrolls only |
| GET | `/api/scrolls` | published, public metadata |
| GET | `/api/ministers`, `/api/ministers/:id` | after Firebase migration (later) |
| POST | `/api/payments/stripe/create-intent` ⛨ | rate-limited |
| POST | `/api/webhooks/stripe` | Stripe signature verified |
| POST | `/api/webhooks/coinbase` | Coinbase signature verified |

### Auth (see AUTH_CUTOVER_PLAN.md)
`POST /api/auth/signup` ⛨ · `POST /api/auth/login` ⛨ · `POST /api/auth/logout` ·
`POST /api/auth/verify-email` · `POST /api/auth/request-password-reset` ⛨ ·
`POST /api/auth/reset-password` · `GET /api/auth/session` · `POST /api/auth/logout-all`

### Member (session required)
`GET /api/me` · `PATCH /api/me` · `GET /api/memberships/mine` ·
`POST /api/memberships/apply` · `POST /api/memberships/join` ·
`GET /api/ordinations/mine` · `POST /api/ordinations/apply` ·
`GET /api/donations/mine` · `GET /api/files/protected/:key` (entitlement-checked)

### Admin (Cloudflare Access + `role='admin'`)
`GET /api/admin/{profiles,donations,scrolls,memberships,ordinations,contact-inquiries,scroll-requests}` ·
`POST /api/admin/memberships/:id/approve` · `POST /api/admin/memberships/:id/reject` ·
`POST /api/admin/ordinations/:id/approve` · `POST /api/admin/ordinations/:id/reject` ·
`POST /api/admin/scrolls` (upload → R2) · `GET /api/admin/audit-logs`

## Authorization model

**Defence in depth, replacing RLS with explicit code:**

1. **Cloudflare Access** in front of `/admin*` and `/api/admin/*` — identity before the Worker
   runs. Free ≤50 seats; ideal for a small elder council. Worker additionally validates the
   `Cf-Access-Jwt-Assertion` header and re-checks `profiles.role = 'admin'` in D1 (never trust the
   client).
2. **Member sessions** — opaque session token in an `HttpOnly; Secure; SameSite=Lax` cookie,
   validated against `sessions` in D1 on every request.
3. **Every query is scoped in SQL** — `WHERE user_id = ?` bound to the session's user id. No
   query trusts a client-supplied user id.
4. **Turnstile** on every unauthenticated POST, always verified **server-side** against
   `https://challenges.cloudflare.com/turnstile/v0/siteverify`.
5. **Rate limiting** via KV per IP + per route.
6. **Audit logging** of every privileged action into `audit_logs`.

### What the browser may never hold
Stripe secret, webhook secrets, XRPL seed, email API key, session pepper, Turnstile **secret**,
any admin capability that isn't re-verified server-side.

## R2 model
- **`bm-public` / `PUBLIC_FILES`** — published scrolls, minister photos, logos. Served through a
  Worker route with long-cache headers (keeps headers/consistency under our control).
- **`bm-protected` / `PROTECTED_FILES`** — ordination credential PDFs, member-only scrolls.
  **Never public.** Only reachable via `GET /api/files/protected/:key` after session + entitlement
  check; the Worker streams the object so the bucket stays fully private.

Key convention:
```
bm-public/     scrolls/<scroll_id>.pdf · ministers/<minister_id>.jpg · brand/eft-logo.png
bm-protected/  credentials/<ordination_id>.pdf · scrolls-member/<scroll_id>.pdf
```

## Email
Workers cannot open raw SMTP sockets, so the existing `SMTP_*` configuration cannot be carried
over. Use an HTTP email API (MailChannels / Resend / Postmark) behind a single `sendEmail()`
helper. Required for: email verification, password reset, application received, approval issued.
**Owner decision required — provider not yet chosen.**

## What stays unchanged in Phase 2
Frontend design, routes, components, and copy; Firebase ministers directory; Supabase (live,
untouched, source of truth until cutover); Stripe/PayPal/XRPL production credentials.
