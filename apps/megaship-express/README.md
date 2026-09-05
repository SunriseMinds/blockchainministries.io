# Megaship Express

Courier quoting, invoicing and payment collection. **The first production
application built on the Reellink Cloud Platform.**

## Resources
| Resource | Name | Note |
|---|---|---|
| D1 (production) | `megaship-express-leads` | **existing** — adopted as-is, live records preserved |
| D1 (preview) | `megaship-express-db-preview` | `0cb062cf-533e-44c1-bb8a-e2f0f684e827` |
| R2 public | `megaship-express-public` | brand assets |
| R2 protected | `megaship-express-protected` | invoice + receipt PDFs |
| KV | `megaship-express-rate-limit` | rate limiting + dashboard cache |

## Domain model (pre-existing schema, adopted unchanged)
`quotes` → `invoices` → `payments` → `receipts`. These predate the platform and
use INTEGER AUTOINCREMENT keys with business identifiers (`quote_id`,
`invoice_number`, `receipt_number`). Adopting the real schema beat rewriting
live data to match a convention.

Platform tables (`users`, `sessions`, tokens, `profiles`, `audit_logs`) were
added alongside — additive only, nothing dropped or altered.

## Endpoints
**Public:** `POST /api/quotes` (Turnstile + rate limited + validated),
`GET /api/quotes/:quoteId/status`, `POST /api/webhooks/stripe`.
**Customer:** `GET /api/invoices/mine`, `GET /api/invoices/:n/pdf`,
`POST /api/invoices/:n/checkout`.
**Admin:** quote list/triage, invoice create/send/cancel, manual payments,
payment history, PDF upload, `GET /api/admin/stats`.
**Platform:** all of `/api/auth/*` from `@reellink/auth`.

## Business rules worth knowing
- Quote status transitions are **idempotent** — re-setting the same status
  returns 409 instead of silently rewriting the row.
- Invoice `draft → sent` is a guarded transition; a resend returns 409.
- Payments are **webhook-idempotent** via `provider_transaction_id`, so a
  replayed Stripe event cannot double-credit an invoice.
- A receipt is issued automatically the moment the balance clears.
- Invoice PDFs return **404, not 403**, to anyone who is not the customer or an
  admin, so invoice numbers cannot be probed.

## What this app does NOT contain
No password hashing, session handling, cookie logic, role checks, CSRF, rate
limiting, captcha verification, audit plumbing, router, error envelope, D1
helpers, R2 access control, Stripe signature verification, or email transport.
All of it comes from `@reellink/*`.

## Local testing
```bash
cd apps/megaship-express
W=../../node_modules/wrangler/bin/wrangler.js
node $W d1 execute megaship-express-leads --local --config wrangler.test.jsonc \
  --persist-to .wrangler-test --file=../../packages/auth/migrations/0001_identity.sql
node $W d1 execute megaship-express-leads --local --config wrangler.test.jsonc \
  --persist-to .wrangler-test --file=../../packages/security/migrations/0001_audit.sql
node $W d1 execute megaship-express-leads --local --config wrangler.test.jsonc \
  --persist-to .wrangler-test --file=./migrations/0002_domain.sql
node $W dev --local --config wrangler.test.jsonc --persist-to .wrangler-test --port 8789
```
`wrangler.test.jsonc` uses a distinct worker name so an accidental deploy cannot
overwrite production, and holds no real secrets.

## Before going live
1. `wrangler secret put SESSION_PEPPER` (32+ random bytes)
2. Create the Turnstile widget; `wrangler secret put TURNSTILE_SECRET`; put the
   site key in the frontend
3. `EMAIL_PROVIDER` + `wrangler secret put EMAIL_API_KEY` — **quote
   confirmations and invoices do not send without this**
4. `wrangler secret put STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`; register
   the webhook at `/api/webhooks/stripe`
5. Apply platform migrations to the production database (additive)
6. Enable flags one at a time
