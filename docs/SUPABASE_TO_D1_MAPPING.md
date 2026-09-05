# Supabase → D1 Mapping

**Status: DESIGN.** Proposed D1 schema for the 16 requested tables, mapped to real Supabase
sources (see `SUPABASE_SCHEMA_INVENTORY.md`). Version-controlled DDL lives in
`migrations/0001_initial_schema.sql` — **proposed, not applied.**

## Type conversion rules (Postgres → SQLite/D1)
| Postgres | D1 | Handling |
|---|---|---|
| `uuid` + `gen_random_uuid()` | `TEXT` | generate with `crypto.randomUUID()` in the Worker |
| `timestamptz` / `now()` | `TEXT` ISO-8601 UTC | set in Worker; SQLite has no tz type |
| `jsonb` | `TEXT` | `JSON.stringify` / `JSON.parse`; validate before insert |
| `boolean` | `INTEGER` 0/1 | |
| `numeric` | `REAL` (or `INTEGER` minor units) | prefer integer minor units for money |
| `bigint identity` | `INTEGER PRIMARY KEY AUTOINCREMENT` | |
| `CHECK (x IN (...))` | `CHECK` | supported by SQLite |
| **RLS policies** | **none** | → explicit Worker authorization |
| triggers / plpgsql | none | → Worker logic |
| `auth.users` | `users` table | → own auth system |

`PRAGMA foreign_keys = ON` must be set; parents load before children.

## Table-by-table

### 1. `users` ← **`auth.users` + `public.users`** (consolidation)
Replaces Supabase Auth. **Note:** the legacy `public.users` table is a *different* island (its own
uuid PK, `role`, `is_admin`) — reconcile with `auth.users` during export; do not blindly union.

| Column | Type | Constraints |
|---|---|---|
| `id` | TEXT | PK (uuid) |
| `email` | TEXT | NOT NULL, **UNIQUE**, stored lowercase |
| `password_hash` | TEXT | NOT NULL — Argon2id/scrypt, **never** a Supabase hash |
| `email_verified` | INTEGER | NOT NULL DEFAULT 0 |
| `status` | TEXT | NOT NULL DEFAULT `'active'` CHECK(active,suspended,deleted) |
| `failed_login_count` | INTEGER | NOT NULL DEFAULT 0 |
| `locked_until` | TEXT | nullable |
| `created_at`/`updated_at` | TEXT | NOT NULL |

Index: `idx_users_email`. **Authorization:** self-read only; admin reads all.
**Routes:** all `/api/auth/*`, `/api/me`.

### 2. `sessions` ← *(new — replaces Supabase JWT)*
`id` TEXT PK · `user_id` TEXT NOT NULL **FK→users(id) ON DELETE CASCADE** ·
`token_hash` TEXT NOT NULL UNIQUE (**store only the SHA-256 hash**) · `expires_at` TEXT NOT NULL ·
`created_at` TEXT NOT NULL · `last_seen_at` TEXT · `ip` TEXT · `user_agent` TEXT ·
`revoked_at` TEXT
Indexes: `idx_sessions_user`, `idx_sessions_token`, `idx_sessions_expires`.
**Routes:** login, logout, logout-all, every authenticated request.

### 3. `email_verification_tokens` ← *(new)*
`id` TEXT PK · `user_id` TEXT NOT NULL FK→users CASCADE · `token_hash` TEXT NOT NULL UNIQUE ·
`expires_at` TEXT NOT NULL (24 h) · `consumed_at` TEXT · `created_at` TEXT NOT NULL
Single-use; consume atomically.

### 4. `password_reset_tokens` ← *(new)*
Same shape; **15–60 min** expiry, single-use, invalidate all other outstanding tokens for the user
on use, and **revoke all sessions** after a successful reset.

### 5. `profiles` ← `public.profiles` (1:1)
`id` TEXT PK **FK→users(id) CASCADE** · `role` TEXT NOT NULL DEFAULT 'member' CHECK(member,admin) ·
`display_name` TEXT · `wallet_xrpl` TEXT · `stripe_customer_id` TEXT · `created_at`/`updated_at` TEXT
Index: `idx_profiles_role`. **Authorization:** self read/update (**`role` NOT self-writable**); admin all.
**Routes:** `/api/me`, `/api/admin/profiles`.

### 6. `memberships` ← `public.memberships`
`id` TEXT PK · `user_id` TEXT **UNIQUE** FK→users · `status` TEXT DEFAULT 'pending'
CHECK(pending,approved,rejected) · `membership_type` TEXT · `nft_token_id` TEXT ·
`tx_hash` TEXT · `approved_by` TEXT FK→users · `approved_at` TEXT · `created_at`/`updated_at`
Indexes: `idx_memberships_user`, `idx_memberships_status`.
**Routes:** `/api/memberships/mine`, `/api/memberships/join`, `/api/admin/memberships/:id/approve|reject`.

### 7. `membership_applications` ← *(new — split out of `memberships`)*
Supabase overloaded one row for both application and membership. Separating gives a clean audit
trail and lets a user reapply after rejection without destroying history.
`id` TEXT PK · `user_id` TEXT NOT NULL FK→users · `application_json` TEXT NOT NULL ·
`status` TEXT DEFAULT 'pending' CHECK(pending,approved,rejected) · `reviewed_by` TEXT FK→users ·
`reviewed_at` TEXT · `review_notes` TEXT · `created_at`/`updated_at`
**Migration:** for each legacy `memberships` row, create one application row mirroring its status.

### 8. `ordinations` ← `public.ordinations` (granted ordinations)
`id` TEXT PK · `user_id` TEXT NOT NULL FK→users · `status` TEXT DEFAULT 'pending'
CHECK(pending,approved,rejected) · `verify_slug` TEXT **UNIQUE** · `credential_r2_key` TEXT
(← `credential_pdf_path`) · `nft_token_id` TEXT · `tx_hash` TEXT · `approved_by` TEXT FK→users ·
`approved_at` TEXT · `created_at`/`updated_at`
Indexes: `idx_ordinations_user`, `idx_ordinations_status`, unique `verify_slug`.
⚠️ **`verify_slug` values are public URLs — migrate verbatim.**

### 9. `ordination_applications` ← `public.ordinations.application_json`
`id` TEXT PK · `user_id` TEXT NOT NULL FK→users · `ordination_id` TEXT FK→ordinations ·
`application_json` TEXT NOT NULL · `status` … · `reviewed_by`/`reviewed_at`/`review_notes` ·
`created_at`/`updated_at`

### 10. `scrolls` ← `public.scrolls`
`id` TEXT PK · `title` TEXT NOT NULL · `slug` TEXT UNIQUE · `verify_slug` TEXT UNIQUE ·
`r2_key` TEXT NOT NULL (← `pdf_path`) · `visibility` TEXT NOT NULL DEFAULT 'public'
CHECK(public,member,admin) · `chain_tx_hash` TEXT · `published_at` TEXT · `created_at`/`updated_at`
**`visibility` is new** and decides `bm-public` vs `bm-protected`. Supabase had no such column —
**owner must classify each scroll**; default `public` preserves current behavior.

### 11. `scroll_requests` ← `public.scroll_requests` (1:1)
`id` · `name` NOT NULL · `email` NOT NULL · `request_type` NOT NULL · `message` ·
`status` DEFAULT 'pending' · `ip` · `created_at`
**Authorization:** public insert **via Turnstile-protected Worker route only**; read = admin only
(replacing the `WITH CHECK (true)` policy).

### 12. `donations` ← `public.donations`
`id` TEXT PK · `user_id` TEXT NULL FK→users · `provider` TEXT CHECK(stripe,coinbase,paypal) ·
`provider_id` TEXT · `amount_cents` INTEGER NOT NULL · `currency` TEXT DEFAULT 'usd' ·
`status` TEXT NOT NULL · `receipt_url` TEXT · `created_at`
Indexes: `idx_donations_user`, `idx_donations_created`, unique `(provider, provider_id)` for
webhook idempotency. **Writes only from webhook handlers — never from the browser.**

### 13. `contact_inquiries` ← `public.contact_inquiries` (1:1)
`id` · `name` NOT NULL · `email` · `message` · `inquiry_type` · `status` DEFAULT 'new' · `ip` ·
`created_at`. Same authorization change as `scroll_requests`.

### 14. `consultations` ← *(new — no Supabase source)*
Requested in scope; no existing table or frontend flow. Designed for future booking:
`id` · `user_id` FK→users NULL · `name` NOT NULL · `email` NOT NULL · `topic` ·
`requested_at` TEXT · `scheduled_at` TEXT · `status` DEFAULT 'requested'
CHECK(requested,scheduled,completed,cancelled) · `notes` · `created_at`/`updated_at`
**No UI exists — table only, until a booking flow is approved.**

### 15. `ministers` ← **Firebase Firestore `ministers`**
`id` TEXT PK (**preserve Firestore document id** — `/minister/:id` is public) · `display_name`
NOT NULL · `title` · `bio` · `photo_key` TEXT (R2 `bm-public`) · `ordination_id` FK→ordinations ·
`is_published` INTEGER DEFAULT 0 · `created_at`/`updated_at`
**Not migrated in Phase 2** — table exists so the seam is ready.

### 16. `audit_logs` ← *(new — no Supabase equivalent)*
`id` TEXT PK · `actor_user_id` TEXT FK→users NULL · `actor_email` TEXT ·
`action` TEXT NOT NULL (e.g. `membership.approve`) · `entity_type` TEXT · `entity_id` TEXT ·
`metadata_json` TEXT · `ip` TEXT · `user_agent` TEXT · `created_at` TEXT NOT NULL
Indexes: `idx_audit_actor`, `idx_audit_entity`, `idx_audit_created`. **Append-only.**

## Legacy tables — disposition required (owner decision)
| Supabase table | Frontend use | Recommendation |
|---|---|---|
| `public.users` | join `users(email)` only | **Consolidate** into new `users`; reconcile with `auth.users` |
| `credentials` | none | Export & archive; fold into `ordinations`/`audit_logs` if still meaningful |
| `ministries` | none | **Archive** — legacy prototype superseded by `memberships`/`profiles` |
| `requests` | none | **Archive** unless something external writes to it |
| `subscriptions` | none | **Migrate if Stripe subscriptions are live** — recurring billing would break silently otherwise |

⚠️ `subscriptions` is the risky one: `handle_subscription_update` exists, so recurring billing may
be operating even though the frontend never reads it. **Confirm in the Stripe dashboard before cutover.**

## Coverage check
16/16 requested tables designed. 7 map from real Supabase tables, 1 from Firestore, 8 are new
(auth infrastructure, application split-outs, consultations, audit).
