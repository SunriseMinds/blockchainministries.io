# Supabase → D1 Schema Map — Blockchain Ministries

> **Status: DESIGN / PROPOSAL.** Column lists are **inferred from frontend usage**
> in `src/` (the Hostinger export does not include the database DDL). Before any
> migration, dump the authoritative schema from the live Supabase project
> (`supabase db dump` / SQL editor) and reconcile it against this map. No SQL has
> been executed.

## Legend
- **PK** primary key · **FK** foreign key · **RLS** row-level security
- Types shown are the proposed **D1 (SQLite)** types. D1 has no native `uuid`,
  `jsonb`, `timestamptz`, or Postgres RLS — see "D1 differences" per table.

## Global differences: Postgres → D1 (SQLite)
| Postgres feature | D1 equivalent / handling |
|---|---|
| `uuid` + `gen_random_uuid()` | `TEXT` storing a UUID; generate in the Worker (`crypto.randomUUID()`) |
| `timestamptz`, `now()` | `TEXT` ISO-8601 (UTC) or `INTEGER` epoch ms; set in Worker |
| `jsonb` | `TEXT` containing JSON; parse in the Worker |
| **RLS policies** | **No DB-level RLS.** Authorization MUST move into Worker API code (per-request auth checks). This is the biggest behavioral change. |
| Triggers / DB functions | Re-implement as Worker logic (e.g. profile creation on signup) |
| Postgres `auth.users` | Replaced by chosen auth system (see `AUTH_MIGRATION_OPTIONS.md`) |
| Foreign keys | Supported in D1; enable `PRAGMA foreign_keys=ON` per connection |

---

## Table 1 — `profiles`
1. **Current name:** `profiles`
2. **Inferred columns:** `id` (uuid = auth user id), `role` (text: `member`|`admin`), `display_name` (text). Likely also `created_at`. `display_name` is passed at signup via `signUp({ options: { data: { ... } } })`, implying a **DB trigger** copies it into `profiles`.
3. **PK:** `id`
4. **FK:** `id` → `auth.users.id` (1:1 with the auth user)
5. **Indexes:** PK on `id`; consider index on `role`
6. **RLS:** user can read/update own row; admin can read all; role must not be self-editable by members
7. **Used by:** `AuthProvider`, `DashboardLayout`, `AdminRoute` (reads `role`), `Verify`/`AdminManagement` (join `profiles(display_name)`)
8. **Proposed D1 table:** `profiles(id TEXT PRIMARY KEY, role TEXT NOT NULL DEFAULT 'member', display_name TEXT, created_at TEXT NOT NULL)`
9. **API routes:** `GET /api/me` (session→profile), `PATCH /api/me` (display_name only), admin `GET /api/admin/profiles`
10. **Migration:** export rows; re-key `id` to the new auth system's user id (see auth doc — may require id mapping)
11. **Validation:** row count parity; every `profiles.id` maps to a valid auth user; exactly the same set of `role='admin'` rows

---

## Table 2 — `ordinations`
1. **Current name:** `ordinations`
2. **Inferred columns:** `id`, `user_id` (FK), `status` (`pending`|`approved`), `verify_slug` (text, unique, public verification), `title` (text), `application_json` (json — from `apply-for-ordination`), `nft_token_id` (text), `chain_tx_hash` (text), `created_at`, `updated_at`
3. **PK:** `id`
4. **FK:** `user_id` → auth user / `profiles.id`
5. **Indexes:** unique on `verify_slug`; index on `user_id`, `status`
6. **RLS:** owner reads own; admin reads/updates all; **public read limited to `status='approved'` by `verify_slug`** (verification page)
7. **Used by:** `DashboardHome` (own list), `Verify` (public approved by slug), `AdminManagement` (pending queue), `admin-approve-ordination`
8. **Proposed D1 table:** `ordinations(id TEXT PK, user_id TEXT, status TEXT DEFAULT 'pending', verify_slug TEXT UNIQUE, title TEXT, application_json TEXT, nft_token_id TEXT, chain_tx_hash TEXT, created_at TEXT, updated_at TEXT, FOREIGN KEY(user_id) REFERENCES profiles(id))`
9. **API routes:** `POST /api/ordinations/apply`, `GET /api/ordinations/mine`, `GET /api/verify/:slug` (public, approved only), admin `GET /api/admin/ordinations?status=pending`, `POST /api/admin/ordinations/:id/approve`
10. **Migration:** export all rows incl. on-chain fields; preserve `verify_slug` exactly (public URLs depend on it)
11. **Validation:** count parity; approved slugs resolve identically pre/post; no null `verify_slug` on approved rows

---

## Table 3 — `memberships`
1. **Current name:** `memberships`
2. **Inferred columns:** `id`, `user_id` (FK), `status` (`pending`|`approved`|`active`), `nft_token_id` (text), `chain_tx_hash` (text), likely `tier`, `created_at`, `updated_at`
3. **PK:** `id`
4. **FK:** `user_id` → auth user / `profiles.id`
5. **Indexes:** index on `user_id`, `status`; typically one active membership per user
6. **RLS:** owner reads own (`maybeSingle`); admin reads/updates all
7. **Used by:** `DashboardHome` (`membership.nft_token_id`, `membership?.status`), `AdminManagement` (pending), `apply-for-membership`, `join-membership`, `admin-approve-membership`
8. **Proposed D1 table:** `memberships(id TEXT PK, user_id TEXT, status TEXT DEFAULT 'pending', tier TEXT, nft_token_id TEXT, chain_tx_hash TEXT, created_at TEXT, updated_at TEXT, FOREIGN KEY(user_id) REFERENCES profiles(id))`
9. **API routes:** `POST /api/memberships/apply`, `POST /api/memberships/join`, `GET /api/memberships/mine`, admin `GET /api/admin/memberships?status=pending`, `POST /api/admin/memberships/:id/approve`
10. **Migration:** export rows incl. on-chain fields; confirm one-active-per-user invariant holds
11. **Validation:** count parity; each user's active membership matches pre-migration

---

## Table 4 — `scrolls`
1. **Current name:** `scrolls`
2. **Inferred columns:** `id`, `verify_slug` (unique), `title` (text), `status` (text), `published_at`, `created_at`. Scroll **file** (PDF) location TBD — candidate for **R2** (see `R2_STORAGE_PLAN.md`). No Supabase Storage calls found in the frontend.
3. **PK:** `id`
4. **FK:** possibly `author`/`minister_id` (not evidenced in frontend)
5. **Indexes:** unique on `verify_slug`; index on `status`, `published_at`
6. **RLS:** public read of published scrolls; write admin-only
7. **Used by:** `Verify` (public by `verify_slug`)
8. **Proposed D1 table:** `scrolls(id TEXT PK, verify_slug TEXT UNIQUE, title TEXT, status TEXT, r2_key TEXT, published_at TEXT, created_at TEXT)` — `r2_key` points to the PDF in R2
9. **API routes:** `GET /api/verify/:slug`, `GET /api/scrolls` (published), `GET /api/scrolls/:id/download` (Worker streams/signs from R2)
10. **Migration:** export rows; migrate any PDF assets to R2 and set `r2_key`
11. **Validation:** every published scroll resolves by slug; each `r2_key` object exists in R2

---

## Table 5 — `donations`
1. **Current name:** `donations`
2. **Inferred columns:** `id`, `user_id` (FK, nullable for anonymous), `amount`, `currency`, `status`, provider ref (e.g. `stripe_payment_intent`), `chain_tx_hash` (crypto donations), `created_at`
3. **PK:** `id`
4. **FK:** `user_id` → profiles (nullable)
5. **Indexes:** index on `user_id`, `created_at`
6. **RLS:** owner reads own; admin reads all; inserts happen server-side (webhooks), not from browser
7. **Used by:** `DashboardHome` (own donations), Stripe flow via `stripe-create-intent` + webhook
8. **Proposed D1 table:** `donations(id TEXT PK, user_id TEXT, amount INTEGER, currency TEXT, status TEXT, provider TEXT, provider_ref TEXT, chain_tx_hash TEXT, created_at TEXT)`
9. **API routes:** `POST /api/payments/stripe/create-intent`, `POST /api/webhooks/stripe`, `POST /api/webhooks/coinbase`, `GET /api/donations/mine`
10. **Migration:** export historical donations for record continuity
11. **Validation:** count + summed amounts parity

---

## Table 6 — `scroll_requests` (public form)
1. **Current name:** `scroll_requests`
2. **Columns (confirmed from insert):** `name`, `email`, `request_type`, `message` (+ `id`, `created_at`)
3. **PK:** `id`
4. **FK:** none
5. **Indexes:** index on `created_at`
6. **RLS:** **public INSERT allowed**, read admin-only
7. **Used by:** `Scrolls/components/ContactScrollForm.jsx`
8. **Proposed D1 table:** `scroll_requests(id TEXT PK, name TEXT, email TEXT, request_type TEXT, message TEXT, created_at TEXT)`
9. **API routes:** `POST /api/scroll-requests` (Turnstile-protected), admin `GET /api/admin/scroll-requests`
10. **Migration:** export existing submissions
11. **Validation:** count parity

---

## Table 7 — `contact_inquiries` (public form)
1. **Current name:** `contact_inquiries`
2. **Columns (confirmed from insert):** `name`, `email`, `message`, `inquiry_type` (+ `id`, `created_at`)
3. **PK:** `id`
4. **FK:** none
5. **Indexes:** index on `created_at`
6. **RLS:** **public INSERT allowed**, read admin-only
7. **Used by:** `Contact/components/ContactForm.jsx`
8. **Proposed D1 table:** `contact_inquiries(id TEXT PK, name TEXT, email TEXT, message TEXT, inquiry_type TEXT, created_at TEXT)`
9. **API routes:** `POST /api/contact` (Turnstile-protected), admin `GET /api/admin/contact-inquiries`
10. **Migration:** export existing submissions
11. **Validation:** count parity

---

## Cross-cutting notes
- **`users(email)` joins** in `AdminManagement` read the auth user's email. In D1 there is no `auth.users`; the API must join against whatever the chosen auth system stores (e.g. a `users`/`accounts` table) or denormalize `email` onto applications at insert time.
- **RLS replacement is mandatory.** Every route above must enforce auth server-side; do not rely on the client. This is the single most important correctness/security item in the migration.
- **Slugs are public contracts.** `verify_slug` values for ordinations and scrolls back public URLs — preserve verbatim.
