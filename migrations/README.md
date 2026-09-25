# D1 Migrations

Version-controlled schema for Cloudflare D1 database **`blockchain-ministries-db`**
(binding `DB`), with an isolated preview counterpart **`blockchain-ministries-db-preview`**
(`env.preview`, see `wrangler.jsonc`).

## Status — APPLIED (Phase 2E prep, verified 2026-09-25)
All 6 migrations below are applied to BOTH the preview D1
(`blockchain-ministries-db-preview`) and production D1 (`blockchain-ministries-db`) —
confirmed live via `wrangler d1 migrations list <db> --env preview --remote` /
`--remote` returning "No migrations to apply!" on both, and via
`SELECT name FROM sqlite_master WHERE type='table'` returning all 16 application
tables (plus D1/SQLite internal tables) on both databases. This section previously
said "NOT APPLIED" — that was stale; corrected during the Phase 2E preview cutover
prep pass. `docs/MIGRATION_RISK_REGISTER.md`'s open items are tracked separately and
do not block what has already shipped here.

## Files
| File | Contents |
|---|---|
| `0001_initial_schema.sql` | All 16 tables, constraints, foreign keys and indexes |
| `0002_login_tokens.sql` | `login_tokens` table (passwordless login link flow) |
| `0003_ordination_credentials.sql` | Ordination credential fields |
| `0004_subscription_event_ordering.sql` | Webhook event-ordering columns on `subscriptions` |
| `0005_provider_neutral_donations.sql` | `donations`/`donation_intents` rebuilt provider-neutral (Stripe/XRPL) |
| `0006_provider_neutral_subscriptions.sql` | `subscriptions` rebuilt provider-neutral (Stripe/PayPal) |

## Applying
```bash
wrangler d1 migrations list  blockchain-ministries-db-preview --env preview --remote
wrangler d1 migrations apply blockchain-ministries-db-preview --env preview --remote
# Production — requires separate explicit owner approval, see
# docs/PHASE2E_CUTOVER_CHECKLIST.md Stage 2:
wrangler d1 migrations apply blockchain-ministries-db --remote
```

## Conventions
- **ids** — `TEXT` uuid generated in the Worker (`crypto.randomUUID()`).
- **timestamps** — `TEXT` ISO-8601 UTC, set by the Worker. SQLite has no `timestamptz`,
  and ISO-8601 sorts correctly as text.
- **booleans** — `INTEGER` 0/1.
- **money** — `INTEGER` minor units (cents). Never floating point.
- **JSON** — `TEXT`, serialized/parsed in the Worker.
- **No row-level security.** D1 has none. Every authorization rule is enforced in Worker
  code (`worker/middleware/`, `worker/db/repositories.js`), where ownership filters are
  bound to the session's user id.

## Schema-affecting decisions still open
Tracked in `docs/MIGRATION_RISK_REGISTER.md`; they may change `0001` before it is applied:
- **R-05** — no authoritative Supabase DDL exists (`list_migrations` was empty). Reconcile
  against `supabase db dump --schema public` before applying; non-constraint indexes,
  defaults, or triggers may be missing here.
- **R-06/R-07** — how `auth.users`, `public.users`, `profiles.role` and `users.is_admin`
  reconcile into the single `users` + `profiles` model.
- **R-19** — `scrolls.visibility` is new; each scroll must be classified public/member/admin.
- **R-16** — disposition of the four orphan Supabase tables (`credentials`, `ministries`,
  `requests`, `subscriptions`). If `subscriptions` is live in Stripe (R-09) a
  `subscriptions` table must be added here.

Do not add a `0002_*.sql` for these until the decisions land — amend `0001` while it remains
unapplied, so the first applied migration is clean.
