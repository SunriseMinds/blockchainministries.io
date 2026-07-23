# Data Export & Import Plan (Supabase → D1) — Blockchain Ministries

> **Status: DESIGN / PROPOSAL.** No data has been exported or imported. All steps
> run against a **copy**; production Supabase is read-only during this process.

## Principles
- **Read-only on production Supabase.** Export only; never mutate source data.
- **Reproducible & idempotent.** Re-running import into a fresh D1 yields the same result.
- **Validated.** Row counts and key relationships must match before cutover.
- **Order matters.** Import parents before children to satisfy foreign keys.

## Tables & dependency order
1. `profiles` (and the auth users they map to) — **first**
2. `memberships`, `ordinations`, `donations` (FK → profiles)
3. `scrolls`
4. `scroll_requests`, `contact_inquiries` (independent)

## Step 1 — Authoritative schema dump
Before exporting data, capture the **real** DDL from Supabase (SQL editor or
`supabase db dump --schema public`). Reconcile against `SUPABASE_TO_D1_SCHEMA_MAP.md`
and finalize the D1 migrations. (The export ZIP contains no DDL; the map is inferred.)

## Step 2 — Export from Supabase (read-only)
For each table, export to CSV/JSON via the Supabase dashboard export, `pg_dump
--data-only --column-inserts`, or a read-only service query. Keep exports in a
secure, git-ignored working directory — **never commit exported member data.**

## Step 3 — Transform (Postgres → D1/SQLite)
- `uuid` → keep as `TEXT`.
- `timestamptz` → ISO-8601 UTC `TEXT`.
- `jsonb` (e.g. `ordinations.application_json`) → JSON `TEXT`.
- Booleans → `0/1`.
- Resolve `users(email)` joins: denormalize each application's email onto the row
  (or into the auth system's user table), since D1 has no `auth.users`.
- **User id mapping:** if the chosen auth system issues new user ids, build an
  `old_uuid → new_id` map and rewrite every `user_id`/`profiles.id` during transform.
  (Avoided entirely if Supabase Auth is retained as IdP — see auth doc.)

## Step 4 — Import into D1
- Apply migrations to create tables (`wrangler d1 migrations apply`).
- Load data with batched `INSERT`s (`wrangler d1 execute --file=...`) in dependency order.
- Enable `PRAGMA foreign_keys=ON` and load parents first.

## Step 5 — Validation (must pass before cutover)
| Check | Method |
|---|---|
| Row-count parity per table | `COUNT(*)` in Supabase vs D1 |
| Donations total | `SUM(amount)` parity |
| FK integrity | no orphan `user_id` in memberships/ordinations/donations |
| Unique slugs | `verify_slug` unique & non-null on approved ordinations/published scrolls |
| Admin set | identical set of `role='admin'` profiles |
| Spot checks | sample N rows per table, field-by-field compare |
| Public verify | sample approved slugs resolve identically old vs new |

## Step 6 — Delta re-sync (near cutover)
Production data changes during the build. Just before cutover, re-export and
re-import (or apply a delta of rows created/updated since the last export) so D1
reflects the latest state. Re-run Step 5.

## Artifacts (created later, git-ignored)
- `scripts/export-supabase.*` — read-only exporter
- `scripts/transform.*` — Postgres→D1 transform + id remap
- `scripts/validate.*` — count/relationship checks
- Raw exports live outside the repo or in an ignored path — **member PII must never be committed.**
