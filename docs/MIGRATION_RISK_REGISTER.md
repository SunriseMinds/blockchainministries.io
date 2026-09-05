# Migration Risk Register

Severity: **S1** critical (blocks cutover) · **S2** high · **S3** medium · **S4** low.
Status: OPEN / MITIGATED / NEEDS-OWNER.

## S1 — Critical

### R-01 · Unknown whether production data exists
Every table reports planner estimate `rows: 0`; `auth.users` count not retrieved. The entire
migration plan (data transfer, id mapping, forced password resets, cutover window) is sized
completely differently for an empty vs. populated database.
**Mitigation:** run the read-only count queries in `BACKEND_INVENTORY.md` §3 before Phase 2C.
**Status:** NEEDS-OWNER.

### R-02 · Supabase password hashes are not portable
Members cannot carry passwords to D1. Every existing member must reset (or Supabase must remain
the IdP). Scale unknown pending R-01.
**Mitigation:** choose an option in `AUTH_CUTOVER_PLAN.md`; pre-announce; stage reset emails.
**Status:** NEEDS-OWNER.

### R-03 · `admin-approve-*` Edge Functions run with `verify_jwt = false`
Both admin approval functions bypass gateway JWT verification. If they do not independently verify
caller identity **and** admin role in code, an unauthenticated caller knowing a UUID could trigger
approval — plausibly minting an XRPL NFT and issuing credentials. Source could not be inspected.
**This is a risk in the system today, not only in the migration.**
**Mitigation:** download and audit both functions immediately; in the target, protect with
Cloudflare Access + server-side role check + idempotency guard.
**Status:** OPEN — verify before Phase 2C.

### R-04 · RLS policies are unknown; all tables are SELECT-granted to `anon`
All 12 tables are readable by the `anon` role at the grant level and exposed via GraphQL. Whether
rows actually leak depends on SELECT policies that could not be retrieved. If any is `USING (true)`,
member PII, donations, memberships and ordinations are **publicly readable today**.
**Mitigation:** run the `pg_policies` query in `SUPABASE_RLS_INVENTORY.md` §B.1 as the highest
priority read-only check. In D1 the public database surface disappears entirely.
**Status:** OPEN.

### R-05 · No schema version control / no authoritative DDL
`list_migrations` is empty; the schema was applied ad hoc. The D1 schema is derived from the
metadata API and could miss non-constraint indexes, triggers, defaults, or comments.
**Mitigation:** `supabase db dump --schema public` and reconcile before finalizing migration 0001.
**Status:** OPEN.

## S2 — High

### R-06 · Two competing identity systems (`auth.users` + `public.users`)
`public.users` has its own uuid PK, `email`, `role` and `is_admin`, and is the FK target for
`ministries`. The frontend joins `users(email)` in `AdminManagement`. Merging blindly could
duplicate or drop members, or lose admin status.
**Mitigation:** reconcile on `email`; document every unmatched row; owner decides per row.
**Status:** NEEDS-OWNER.

### R-07 · Three divergent role signals
`profiles.role`, `public.users.role`, `public.users.is_admin`, plus `get_user_role()`. If they
disagree, the migration could grant or revoke admin incorrectly.
**Mitigation:** `profiles.role` is authoritative (it is what `AdminRoute` reads); diff all sources
and have the owner sign off on the final admin list before import (validation V3).
**Status:** OPEN.

### R-08 · File storage location unknown
`scrolls.pdf_path` is NOT NULL and `ordinations.credential_pdf_path` exists, but no storage client
appears in the frontend and buckets could not be listed. R2 migration cannot start.
**Mitigation:** see `R2_FILE_MIGRATION_PLAN.md` — owner must locate the files.
**Status:** NEEDS-OWNER.

### R-09 · `subscriptions` may represent live recurring billing
No frontend reads it, but `handle_subscription_update()` exists and Stripe subscriptions may be
active. Dropping it would silently break recurring donations and orphan billing records.
**Mitigation:** check the Stripe dashboard for active subscriptions before deciding disposition.
**Status:** NEEDS-OWNER.

### R-10 · Workers cannot use SMTP
Existing `SMTP_*` configuration is unusable in Workers. Without an HTTP email provider, email
verification, password reset, and approval notifications all fail — which would strand every user
mid-signup at cutover.
**Mitigation:** select and configure MailChannels/Resend/Postmark **before** auth implementation.
**Status:** NEEDS-OWNER.

### R-11 · Non-idempotent approval could double-mint XRPL NFTs
A retried or duplicated approval request may mint twice, spending real assets irreversibly.
**Mitigation:** guard on current `status` inside a transaction; unique constraint on
`nft_token_id`; log every attempt to `audit_logs`; make the handler safe to retry.
**Status:** OPEN — design requirement for Phase 2C.

### R-12 · Public `verify_slug` URLs must not break
`/verify/:slug` is externally shared and may be printed on credentials. Any regeneration breaks
third-party references permanently.
**Mitigation:** migrate `verify_slug` verbatim; validation V6 asserts parity for every pre-existing slug.
**Status:** MITIGATED by design.

## S3 — Medium

### R-13 · Unrestricted public inserts on two tables
`contact_inquiries` and `scroll_requests` have `WITH CHECK (true)` INSERT policies with no
CAPTCHA, validation, or rate limiting — spammable with the public anon key today.
**Mitigation:** Turnstile + rate limiting + server-side validation on the Worker routes.
**Status:** MITIGATED by design.

### R-14 · `SECURITY DEFINER` functions callable by `anon`
`get_user_role`, `handle_new_user`, `handle_subscription_update` are all REST-callable by `anon`;
`handle_subscription_update` additionally has a mutable `search_path` (escalation vector).
**Mitigation:** none needed post-migration (functions disappear); consider revoking EXECUTE now as
a hardening step on the live system.
**Status:** OPEN.

### R-15 · `clever-processor` Edge Function is unidentified
Deployed, ACTIVE, `verify_jwt = true`, never referenced in the repo. Decommissioning Supabase could
break an unknown integration.
**Status:** NEEDS-OWNER.

### R-16 · Four orphan tables
`credentials`, `ministries`, `requests`, `subscriptions` have no frontend references. Migrating
them wastes effort; dropping them may lose real records.
**Mitigation:** export and archive all four regardless of the decision.
**Status:** NEEDS-OWNER.

### R-17 · Loss of RLS as a safety net
Postgres enforced (some) authorization centrally. D1 has none — a single missing check in one
Worker route is a direct data leak.
**Mitigation:** shared `requireSession()` / `requireAdmin()` helpers used by every route; deny by
default; route-level authorization tests; code review of every handler.
**Status:** MITIGATED by design.

### R-18 · Leaked-password protection disabled
Supabase Auth is not checking HaveIBeenPwned.
**Mitigation:** enforce breach checking + 12-char minimum in the new auth implementation.
**Status:** MITIGATED by design.

### R-19 · Scroll visibility is unclassified
D1 introduces `scrolls.visibility`; Supabase had no equivalent. Guessing could expose member-only
documents publicly.
**Mitigation:** owner classifies each scroll; default `public` preserves current behavior; R2 test
R5 verifies protected objects are unreachable anonymously.
**Status:** NEEDS-OWNER.

## S4 — Low

### R-20 · Timestamp semantics change
`timestamptz` → ISO-8601 TEXT. Sorting stays correct (ISO-8601 sorts lexicographically) but naive
date arithmetic differs.
**Mitigation:** always store UTC with `Z`; validation V8.

### R-21 · `requests.id` is the only `bigint identity` PK
Mixing integer and uuid PKs; not currently used.
**Mitigation:** if migrated, keep `INTEGER PRIMARY KEY AUTOINCREMENT`.

### R-22 · Firebase remains a live dependency
Ministers directory still requires Firestore; the `firebase` package is a large bundle cost for one
read-only collection. Firestore Security Rules were not retrievable.
**Mitigation:** out of Phase 2 scope by instruction; owner should confirm the rules allow read but
not write.

### R-23 · D1 operational limits
D1 has size/throughput limits and is not a drop-in Postgres. Current volumes appear small, so this
is low risk — but no `jsonb` operators, no server-side `now()`, and no stored procedures.
**Mitigation:** keep JSON handling in the Worker; monitor growth of `audit_logs` (fastest-growing
table) and plan pruning.

## Summary
| Severity | Open | Needs owner | Mitigated by design |
|---|---|---|---|
| S1 | 3 | 2 | 0 |
| S2 | 2 | 4 | 1 |
| S3 | 3 | 3 | 2 |
| S4 | 0 | 0 | 4 |

**Phase 2C must not begin until R-01, R-02, R-03, R-04 and R-05 are resolved.**
