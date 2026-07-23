# Supabase Edge Functions → Cloudflare Workers/Pages Functions Map

> **Status: DESIGN / PROPOSAL.** The Edge Function *source* is not in the export
> (only the frontend `invoke(...)` calls are). Bodies below are inferred from call
> sites and must be reconciled against the deployed Supabase functions before
> porting. No Worker code has been written.

## Secrets these functions require (server-side only — never in the browser)
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_DONATION`,
`COINBASE_COMMERCE_API_KEY`, `COINBASE_COMMERCE_WEBHOOK_SECRET`,
`SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM`,
`XRPL_NETWORK`, `XRPL_ISSUER_ADDRESS`, `XRPL_SEED`, and (today) `SUPABASE_SERVICE_ROLE`.
In Cloudflare these become **Worker secrets** (`wrangler secret put ...` / dashboard),
bound at runtime — never committed, never sent to the client.

## Bindings each Worker will need
- `DB` → D1 database
- `R2` → R2 bucket (scroll PDFs / documents)
- `TURNSTILE_SECRET` → for public endpoints
- Auth context (from chosen auth system) to authorize admin vs member

---

| # | Supabase function | Called from | Request body | Purpose (inferred) | Target CF handler | Auth | Secrets/bindings |
|---|---|---|---|---|---|---|---|
| 1 | `stripe-create-intent` | `StripeDonateForm`, `StripeTiers` | `{ amount }` (cents) / tier info | Create Stripe PaymentIntent, return client secret | `POST /api/payments/stripe/create-intent` | public (rate-limit + Turnstile) | `STRIPE_SECRET_KEY` |
| 2 | `apply-for-membership` | `MembershipApply` | application fields | Insert `memberships` (pending); notify | `POST /api/memberships/apply` | member session | `DB`, SMTP |
| 3 | `apply-for-ordination` | `Ordination` | `{ application_json }` | Insert `ordinations` (pending); notify | `POST /api/ordinations/apply` | member session | `DB`, SMTP |
| 4 | `join-membership` | `Join` | membership/join payload | Create/advance membership | `POST /api/memberships/join` | member session | `DB`, SMTP |
| 5 | `admin-approve-membership` | `AdminManagement` | `{ membership_id }` | Approve membership; likely mint/record XRPL (`nft_token_id`, `chain_tx_hash`); email | `POST /api/admin/memberships/:id/approve` | **admin only** | `DB`, `XRPL_SEED`, SMTP |
| 6 | `admin-approve-ordination` | `AdminManagement` | `{ ordination_id }` | Approve ordination; set `verify_slug`; likely XRPL mint/record; email | `POST /api/admin/ordinations/:id/approve` | **admin only** | `DB`, `XRPL_SEED`, SMTP |

## Additional handlers to add (not currently Edge Functions)
- `POST /api/webhooks/stripe` — verify `STRIPE_WEBHOOK_SECRET`, record `donations`.
- `POST /api/webhooks/coinbase` — verify `COINBASE_COMMERCE_WEBHOOK_SECRET`, record crypto donations.
- `POST /api/contact` and `POST /api/scroll-requests` — Turnstile-verified public inserts (replace direct Supabase client inserts).

## Porting notes
- **XRPL signing** (functions 5–6) must occur only in the Worker with `XRPL_SEED`
  held as a secret. Make approval **idempotent** (guard on current `status`) so a
  retried request never double-mints or double-charges.
- **Email**: Cloudflare Workers cannot open raw SMTP sockets. Replace SMTP with an
  HTTP email API (e.g. MailChannels/Resend/Postmark) called from the Worker, or a
  queue. Note this in `REMAINING_MANUAL_SETUP.md`.
- **Authorization** replaces Supabase RLS: functions 5–6 must verify the caller is
  an admin server-side; 2–4 must verify a valid member session.
- **Input validation** on every endpoint (amounts, enums, lengths) — do not trust
  client payloads.
