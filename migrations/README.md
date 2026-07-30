# D1 Migrations

Version-controlled schema for Cloudflare D1 database **`blockchain-ministries-db`**
(binding `DB`).

## ⚠️ NOT APPLIED
No Cloudflare resources have been created and **no migration has been run**. These files are
reviewable SQL only. Applying them is a Phase 2D action, after the blockers in
`docs/MIGRATION_RISK_REGISTER.md` are resolved.

## Files
| File | Contents |
|---|---|
| `0001_initial_schema.sql` | All 16 tables, constraints, foreign keys and indexes |

## Applying (later, once approved)
```bash
# create the database (Phase 2D)
wrangler d1 create blockchain-ministries-db
# add the returned database_id to wrangler.jsonc, then:
wrangler d1 migrations list  blockchain-ministries-db
wrangler d1 migrations apply blockchain-ministries-db --local   # local first
wrangler d1 migrations apply blockchain-ministries-db           # remote
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
