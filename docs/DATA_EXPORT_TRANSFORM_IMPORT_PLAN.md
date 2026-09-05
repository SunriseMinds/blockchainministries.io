# Data Export → Transform → Import Plan (Supabase → D1)

**Status: DESIGN.** No data has been exported, transformed, or imported. Production Supabase is
**read-only** throughout this process.

## Step 0 — Resolve the two blocking unknowns (before anything else)
1. **Is there production data?** Every table reports a planner estimate of `rows: 0`, which is
   *not* proof of emptiness. Run the count query in `BACKEND_INVENTORY.md` §3 plus
   `SELECT count(*) FROM auth.users;`.
   - **If all zero:** this entire document collapses to "apply the schema" — no export, no
     transform, no id remapping, no password resets. Enormous simplification.
   - **If non-zero:** proceed with the full plan below.
2. **Capture the authoritative DDL.** `list_migrations` is empty, so no DDL history exists.
   Run `supabase db dump --schema public --project-ref ilykpeafezzcrdxorlmb > baseline_schema.sql`
   and reconcile against `SUPABASE_SCHEMA_INVENTORY.md` before finalizing
   `migrations/0001_initial_schema.sql`.

## Principles
- **Read-only on production.** Export only; never mutate the source.
- **Idempotent & reproducible.** Re-running against a fresh D1 yields identical results.
- **Ordered.** Parents before children (`PRAGMA foreign_keys = ON`).
- **PII never enters git.** Exports live in a git-ignored working directory or outside the repo.
- **Validated.** Counts and relationships must match before cutover.

## Dependency order
```
1. users            (from auth.users [+ reconciled public.users])
2. profiles
3. memberships, ordinations, subscriptions?, credentials?
4. membership_applications, ordination_applications   (derived)
5. donations
6. scrolls
7. scroll_requests, contact_inquiries                 (independent)
8. ministers                                          (Firebase — later phase)
```

## Step 1 — Export (read-only)
```bash
# Structured export per table (service-role key held only in the operator's shell)
supabase db dump --data-only --schema public --project-ref ilykpeafezzcrdxorlmb > data.sql
# or per-table CSV/JSON via the dashboard / a read-only client
```
Also export `auth.users` — **only** `id, email, email_confirmed_at, created_at, last_sign_in_at`.
**Never export `encrypted_password`** (it is unusable outside Supabase and is a liability).

## Step 2 — Transform
| Source | Target | Rule |
|---|---|---|
| `uuid` | TEXT | keep verbatim — **preserves all FK relationships** |
| `timestamptz` | TEXT | ISO-8601 UTC (`toISOString()`) |
| `jsonb` | TEXT | `JSON.stringify`; validate parses |
| `boolean` | INTEGER | `true→1`, `false→0` |
| `auth.users` | `users` | `password_hash` = random unusable sentinel; `email_verified` from `email_confirmed_at IS NOT NULL` |
| `ordinations.credential_pdf_path` | `credential_r2_key` | rewrite to R2 key convention |
| `scrolls.pdf_path` | `r2_key` | rewrite; set `visibility` (owner-classified, default `public`) |
| `memberships` row | + `membership_applications` row | derive one application mirroring status |
| `ordinations.application_json` | `ordination_applications` | split out; keep `ordination_id` link |
| `public.users` | reconcile | match on `email`; where a row has no `auth.users` counterpart, decide: create user / archive |

**Because uuids are preserved verbatim, no id remapping is required** — every `user_id` FK stays
valid. This is the single biggest simplification available and should be protected.

Reconciliation edge cases to decide (owner):
- `public.users` rows with no matching `auth.users` email → archive or invite?
- `ministries` / `credentials` / `requests` → archive to cold storage (recommended) or migrate?
- `subscriptions` with active Stripe status → **must** migrate or billing breaks silently.

## Step 3 — Import
```bash
wrangler d1 migrations apply blockchain-ministries-db          # schema
wrangler d1 execute blockchain-ministries-db --file=./out/01_users.sql
wrangler d1 execute blockchain-ministries-db --file=./out/02_profiles.sql
# ... in dependency order
```
Batch inserts (~500 rows/statement group), wrap in transactions, and re-run safely with
`INSERT OR IGNORE` on primary keys.

## Step 4 — Validation (all must pass before cutover)
| # | Check | Method |
|---|---|---|
| V1 | Row-count parity per table | `count(*)` Supabase vs D1 |
| V2 | User parity | every `auth.users.id` has a `users` row and a `profiles` row |
| V3 | Admin set identical | same set of `profiles.role='admin'` |
| V4 | FK integrity | zero orphans in memberships/ordinations/donations |
| V5 | Uniqueness | `verify_slug` unique & non-null on approved ordinations; unique on published scrolls |
| V6 | **Public URL parity** | every pre-existing `/verify/:slug` resolves identically old vs new |
| V7 | Donation totals | `SUM(amount_cents)` parity, grouped by provider+status |
| V8 | Timestamp sanity | no nulls where source was non-null; no epoch-0 artifacts |
| V9 | JSON validity | every `application_json` parses |
| V10 | R2 objects | every `r2_key` / `credential_r2_key` resolves to a real object |
| V11 | Spot check | 20 random rows per table, field-by-field |

Record results in a validation report and attach it to the cutover approval request.

## Step 5 — Delta re-sync (immediately before cutover)
Production keeps changing during the build. Re-export rows created/updated since the last export
(`created_at`/`updated_at` watermark), re-import, and **re-run Step 4**. Keep the cutover window
short to minimize the delta. Tables with no `updated_at` (`donations`, `contact_inquiries`,
`scroll_requests`, `scrolls`) use `created_at` and are effectively append-only.

## Artifacts (created later; git-ignored)
```
scripts/export-supabase.mjs    # read-only export
scripts/transform.mjs          # Postgres -> D1 conversion
scripts/import-d1.sh           # ordered load
scripts/validate.mjs           # V1..V11
```
Add to `.gitignore`: `/export/`, `/out/`, `*.dump`, `*.csv` — **member PII must never be committed.**
