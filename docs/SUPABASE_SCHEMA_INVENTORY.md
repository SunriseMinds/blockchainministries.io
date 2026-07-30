# Supabase Schema Inventory — `public` schema

Retrieved from the live project `ilykpeafezzcrdxorlmb` via Supabase metadata API (no SQL executed).
Postgres 17.6.1.104. **All 12 tables have RLS enabled.** Planner row estimate is `0` for every
table — see `BACKEND_INVENTORY.md` §3 (not confirmed empty).

**Indexes:** only PRIMARY KEY and UNIQUE constraints are visible through the metadata API.
Any additional (non-constraint) indexes are **NOT RETRIEVED** — run
`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public';`

Legend: PK = primary key · FK = foreign key · U = unique · NN = NOT NULL (i.e. not nullable)

---

## `profiles` — *"User profile information, extending auth.users."*
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NN | — | **PK**, **FK → auth.users.id** |
| `role` | text | NN | `'member'` | **CHECK** `role IN ('member','admin')` |
| `display_name` | text | null | — | populated from signup metadata |
| `wallet_xrpl` | text | null | — | member XRPL address |
| `created_at` | timestamptz | null | `now()` | |
| `stripe_customer_id` | text | null | — | |

## `memberships` — *"Manages official membership status and associated NFTs."*
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | null | — | **U**, **FK → auth.users.id** (one membership per user) |
| `status` | text | NN | `'pending'` | **CHECK** `IN ('pending','approved','rejected')` |
| `nft_token_id` | text | null | — | XRPL NFT |
| `tx_hash` | text | null | — | XRPL tx |
| `approved_by` | uuid | null | — | **FK → auth.users.id** |
| `membership_type` | text | null | — | |
| `created_at` / `updated_at` | timestamptz | null | `now()` | |

## `ordinations` — *"Stores ordination applications and their status."*
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | null | — | **FK → auth.users.id** |
| `status` | text | NN | `'pending'` | **CHECK** `IN ('pending','approved','rejected')` |
| `application_json` | jsonb | NN | — | full application payload |
| `credential_pdf_path` | text | null | — | → R2 `bm-protected` |
| `verify_slug` | text | null | — | **U** — backs public `/verify/:slug` |
| `approved_by` | uuid | null | — | **FK → auth.users.id** |
| `created_at` / `updated_at` | timestamptz | null | `now()` | |

## `donations` — *"Tracks all monetary donations."*
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | null | — | **FK → auth.users.id** (nullable ⇒ anonymous) |
| `provider` | text | null | — | **CHECK** `IN ('stripe','coinbase')` |
| `amount_cents` | integer | NN | — | minor units |
| `currency` | text | NN | `'usd'` | |
| `status` | text | NN | — | |
| `provider_id` | text | null | — | Stripe/Coinbase reference |
| `receipt_url` | text | null | — | |
| `created_at` | timestamptz | null | `now()` | |

## `scrolls` — *"Stores sacred documents and texts."*
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `title` | text | NN | — | |
| `pdf_path` | text | NN | — | → R2 |
| `verify_slug` | text | null | — | **U** |
| `chain_tx_hash` | text | null | — | XRPL notarization |
| `published_at` | timestamptz | null | `now()` | |

> No `status` column. Public `/verify/:slug` reads scrolls with no status filter.

## `scroll_requests` — public form target
| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` (**PK**) |
| `created_at` | timestamptz | NN | `now()` |
| `name` | text | NN | — |
| `email` | text | NN | — |
| `request_type` | text | NN | — |
| `message` | text | null | — |
| `status` | text | NN | `'pending'` |

Frontend inserts `{name, email, request_type, message}`; `status` uses the default.

## `contact_inquiries` — public form target
| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` (**PK**) |
| `created_at` | timestamptz | NN | `now()` |
| `name` | text | NN | — |
| `email` | text | null | — |
| `message` | text | null | — |
| `inquiry_type` | text | null | — |

---

# Tables NOT used by the frontend

## `users` (public.users) — ⚠️ distinct from `auth.users`
| Column | Type | Null | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** (self-generated, *not* FK to auth) |
| `email` | text | NN | — | **U** |
| `name` | text | NN | — | |
| `role` | text | null | `'member'` | second role system |
| `is_admin` | boolean | null | `false` | third role signal |
| `created_at` | timestamptz | null | utc now | |

Referenced by `ministries.user_id`, and by the PostgREST join `users(email)` in
`AdminManagement.jsx`. **A parallel identity table competing with `auth.users` + `profiles`.**

## `credentials`
`id` uuid **PK** · `user_id` uuid NN **FK → auth.users.id** · `type` text NN ·
`details` jsonb · `created_at` timestamptz `now()`

## `ministries` — legacy prototype
`id` uuid **PK** · `user_id` uuid **FK → public.users.id** · `covenanttier` text ·
`eftbalance` numeric `0` · `photourl` text · `wallet` text · `submittedat` timestamptz ·
`isverified` boolean `false`

Lowercase run-together column names indicate an early prototype predating the current schema.

## `requests`
`id` bigint **identity PK** (only non-uuid PK) · `user_id` uuid NN **FK → auth.users.id** ·
`request_type` text NN · `details` text · `status` text `'pending'` · `created_at` · `updated_at`

## `subscriptions`
`id` uuid **PK** · `user_id` uuid NN **FK → auth.users.id** · `status` text ·
`provider` text `'stripe'` · `provider_subscription_id` text NN **U** · `provider_plan_id` text ·
`created_at` · `updated_at`

Backs recurring Stripe billing; no frontend reads it. Related function `handle_subscription_update`.

---

## Foreign-key graph
```
auth.users.id ──< profiles.id            (1:1)
              ──< memberships.user_id    (1:1, UNIQUE)
              ──< memberships.approved_by
              ──< ordinations.user_id
              ──< ordinations.approved_by
              ──< donations.user_id      (nullable)
              ──< credentials.user_id
              ──< requests.user_id
              ──< subscriptions.user_id

public.users.id ──< ministries.user_id   (separate island)

scrolls            (no FKs)
scroll_requests    (no FKs)
contact_inquiries  (no FKs)
```

## Extensions installed
`plpgsql` 1.0 · `pgcrypto` 1.3 (`extensions`) · `uuid-ossp` 1.1 (`extensions`) ·
`pg_graphql` 1.5.11 (`graphql`) · `supabase_vault` 0.3.1 (`vault`) ·
`pg_stat_statements` 1.11 · `wrappers` 0.6.0

Not installed: `pg_cron`, `pg_net`, `postgis`, `vector`, `pgjwt`, `pgsodium`.
⇒ **No scheduled jobs and no in-database HTTP.** All outbound calls happen in Edge Functions.

## Schema version control
`list_migrations` → **empty**. No migration history exists. Schema was applied ad hoc.
