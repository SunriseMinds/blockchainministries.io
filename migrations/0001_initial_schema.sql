-- =============================================================================
-- Blockchain Ministries — D1 initial schema (PROPOSAL — NOT YET APPLIED)
-- Target: Cloudflare D1 `blockchain-ministries-db` (binding: DB)
--
-- Reviewable, version-controlled DDL. Do NOT apply until the owner approves.
--   Apply with: wrangler d1 migrations apply blockchain-ministries-db
--
-- Revision note (M2): this schema replaces the earlier draft's identity split
-- (users + profiles) with a single canonical `users` table, replaces the
-- overloaded `memberships.status` with two independent dimensions
-- (application_status / payment_status), merges `ordination_applications`
-- into `ordinations.application_json`, drops `membership_applications`, adds
-- real Stripe webhook idempotency, and adds a `subscriptions` table for the
-- paid membership tier. See docs of the Phase 0 Supabase audit and the
-- approved Cloudflare cutover plan for the reasoning behind each change.
-- Several existing Worker/package files still assume the OLD shape (a
-- separate `profiles` table, a single `memberships.status` column, a
-- separate `ordination_applications`/`membership_applications` table) and
-- MUST be updated before this migration is ever applied to a database those
-- files talk to — see the M2 report's "Existing Code Requiring Later
-- Updates" section for the exact list. This file is schema-only; no
-- application code was changed alongside it.
--
-- Conventions:
--   * ids are TEXT uuids generated in the Worker (crypto.randomUUID())
--   * timestamps are TEXT ISO-8601 UTC, set by the Worker
--   * booleans are INTEGER 0/1
--   * money is INTEGER minor units (cents)
--   * D1 has NO row-level security: every rule is enforced in Worker code
--   * SQLite/D1 only: no JSONB, no native UUID/SERIAL types, no Postgres
--     trigger syntax, no RLS — JSON payloads are stored as TEXT.
-- =============================================================================

PRAGMA foreign_keys = ON;

-- --------------------------------------------------------- identity (single) --
-- ONE canonical identity/profile/role table. There is deliberately no
-- separate `profiles` table (Supabase's split) and no `public.users`-style
-- second identity table (Supabase had one; it was dead — 0 rows, no write
-- path — and is not reproduced here).
CREATE TABLE users (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,          -- stored lowercase
  password_hash      TEXT NOT NULL,                 -- Argon2id; never a Supabase hash
  email_verified     INTEGER NOT NULL DEFAULT 0,
  role               TEXT NOT NULL DEFAULT 'member'
                       CHECK (role IN ('member','admin')),   -- never client-writable
  display_name       TEXT,
  wallet_xrpl        TEXT,
  stripe_customer_id TEXT,
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','suspended','deleted')),
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until       TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_users_role   ON users(role);
CREATE INDEX idx_users_status ON users(status);

-- -------------------------------------------------------- auth support --
-- Unchanged from the previous draft: these already match what
-- packages/auth/src/repositories.js and session.js read and write
-- (token_hash, expires_at, revoked_at, last_seen_at, consumed_at, etc).
CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,                -- SHA-256 of the cookie token
  expires_at   TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  last_seen_at TEXT,
  ip           TEXT,
  user_agent   TEXT,
  revoked_at   TEXT
);
CREATE INDEX idx_sessions_user    ON sessions(user_id);
CREATE INDEX idx_sessions_token   ON sessions(token_hash);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE email_verification_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  consumed_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_evt_user ON email_verification_tokens(user_id);

CREATE TABLE password_reset_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  consumed_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_prt_user ON password_reset_tokens(user_id);

-- -------------------------------------------------------------- membership --
-- Two independent lifecycle dimensions instead of one overloaded `status`
-- column (the exact bug found in the Supabase audit: join-membership wrote
-- 'pending_payment'/'active', which aren't legal application-review states).
--   application_status — did the ministry approve this person, admin-decided
--   payment_status     — is their billing current, webhook-decided only, and
--                        only meaningful for a 'paid' membership_type
CREATE TABLE memberships (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  application_status TEXT NOT NULL DEFAULT 'pending'
                       CHECK (application_status IN ('pending','approved','rejected')),
  -- NULL until a paid tier is chosen; existing Worker code (POST
  -- /api/membership/apply) creates a membership without picking a tier yet,
  -- so this cannot be NOT NULL without breaking that call site.
  payment_status     TEXT
                       CHECK (payment_status IS NULL OR payment_status IN
                              ('pending_payment','active','past_due','cancelled')),
  -- Nullable for the same reason as payment_status; when set, constrained to
  -- the two tiers the product actually offers.
  membership_type    TEXT
                       CHECK (membership_type IS NULL OR membership_type IN ('free','paid')),
  nft_token_id       TEXT,
  tx_hash            TEXT,
  approved_by        TEXT REFERENCES users(id),
  approved_at        TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_memberships_application_status ON memberships(application_status);
CREATE INDEX idx_memberships_payment_status     ON memberships(payment_status);

-- -------------------------------------------------------------- ordination --
-- ONE table. `application_json` lives directly on the ordination record —
-- Supabase's live production data never separated "application" from
-- "ordination" into two rows, so a normalized ordination_applications table
-- (as the previous D1 draft had) invents a two-step workflow that doesn't
-- exist in the real product. Existing Worker code currently writes this JSON
-- to a separate table (see the M2 report) and will need a small update to
-- write it here at creation time instead — that update is NOT made in M2.
CREATE TABLE ordinations (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_json  TEXT NOT NULL,                  -- JSON, e.g. { fullName, ... }
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected')),
  verify_slug       TEXT UNIQUE,                    -- PUBLIC URL — migrate verbatim
  credential_r2_key TEXT,                           -- bm-protected
  nft_token_id      TEXT,
  tx_hash           TEXT,
  approved_by       TEXT REFERENCES users(id),
  approved_at       TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX idx_ordinations_user   ON ordinations(user_id);
CREATE INDEX idx_ordinations_status ON ordinations(status);

-- ------------------------------------------------------------- content/docs --
-- Visibility restored even though live Supabase's `scrolls` table never had
-- this column — the Worker's existing files.js already implements a
-- 'scrolls-member/' gated-access path, and worker/db/repositories.js already
-- assumes this exact column (listPublic filters WHERE visibility='public').
CREATE TABLE scrolls (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  slug          TEXT UNIQUE,
  verify_slug   TEXT UNIQUE,                        -- PUBLIC URL — migrate verbatim
  r2_key        TEXT NOT NULL,                      -- bm-public or bm-protected
  visibility    TEXT NOT NULL DEFAULT 'public'
                  CHECK (visibility IN ('public','member','admin')),
  chain_tx_hash TEXT,
  published_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_scrolls_visibility ON scrolls(visibility);
CREATE INDEX idx_scrolls_published  ON scrolls(published_at);

CREATE TABLE scroll_requests (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  request_type TEXT NOT NULL,
  message      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','fulfilled','rejected')),
  ip           TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_scroll_requests_created ON scroll_requests(created_at);

-- ----------------------------------------------------------------- finance --
-- Real Stripe idempotency: `stripe_event_id` is Stripe's own event.id, unique
-- per delivery, so a webhook redelivery is a guaranteed no-op via
-- INSERT OR IGNORE. `provider_charge_id` remains for the existing
-- provider-reference lookup use case (the underlying object id — payment
-- intent, checkout session, or invoice id — which is NOT guaranteed unique
-- across event types the way event.id is).
CREATE TABLE donations (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT REFERENCES users(id) ON DELETE SET NULL,   -- NULL = anonymous
  provider           TEXT NOT NULL CHECK (provider IN ('stripe')),
  stripe_event_id    TEXT NOT NULL UNIQUE,          -- webhook idempotency key
  provider_charge_id TEXT,                          -- payment_intent/session/invoice id
  amount_cents       INTEGER NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'usd',
  status             TEXT NOT NULL,
  receipt_url        TEXT,
  created_at         TEXT NOT NULL
);
CREATE INDEX idx_donations_user    ON donations(user_id);
CREATE INDEX idx_donations_created ON donations(created_at);
CREATE INDEX idx_donations_charge  ON donations(provider_charge_id);

-- Paid membership tier only. Populated exclusively by the Stripe webhook —
-- never client-settable. Not present in the Supabase-era schema at all
-- (the closest thing there was dead, broken reconciliation code); this is a
-- clean rebuild justified by the paid tier being a real product requirement.
CREATE TABLE subscriptions (
  id                     TEXT PRIMARY KEY,
  user_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT NOT NULL UNIQUE,
  stripe_customer_id     TEXT NOT NULL,
  status                 TEXT NOT NULL
                           CHECK (status IN ('active','past_due','cancelled','incomplete')),
  current_period_end     TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL
);
CREATE INDEX idx_subscriptions_user   ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- ------------------------------------------------------------------ inbound --
CREATE TABLE contact_inquiries (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT,
  message      TEXT,
  inquiry_type TEXT,
  status       TEXT NOT NULL DEFAULT 'new'
                 CHECK (status IN ('new','read','responded','archived')),
  ip           TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_contact_created ON contact_inquiries(created_at);

-- Unrelated to the Supabase audit/cutover — a live Cloudflare-native feature
-- (worker/routes/public.js POST/GET /api/consultations, admin.js's list
-- endpoint) with no Supabase equivalent. Left unchanged.
CREATE TABLE consultations (
  id           TEXT PRIMARY KEY,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  topic        TEXT,
  requested_at TEXT,
  scheduled_at TEXT,
  status       TEXT NOT NULL DEFAULT 'requested'
                 CHECK (status IN ('requested','scheduled','completed','cancelled')),
  notes        TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_consultations_status ON consultations(status);

-- --------------------------------------------------------------- directory --
-- Also unrelated to the Supabase audit — populated from Firebase Firestore
-- separately (worker/db/repositories.js `ministers`, public.js GET
-- /api/ministers). Firestore document ids MUST be kept: /minister/:ministerId
-- is a live public URL. Left unchanged.
CREATE TABLE ministers (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL,
  title         TEXT,
  bio           TEXT,
  photo_key     TEXT,                                -- bm-public
  ordination_id TEXT REFERENCES ordinations(id) ON DELETE SET NULL,
  is_published  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_ministers_published ON ministers(is_published);

-- ------------------------------------------------------------------- audit --
-- Matches exactly what packages/security/src/audit-repo.js inserts and
-- selects (actor_user_id, actor_email, action, entity_type, entity_id,
-- metadata_json, ip, user_agent, created_at) — unchanged from the prior draft.
CREATE TABLE audit_logs (                            -- append-only
  id            TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_email   TEXT,
  action        TEXT NOT NULL,                       -- e.g. 'membership.approve'
  entity_type   TEXT,
  entity_id     TEXT,
  metadata_json TEXT,
  ip            TEXT,
  user_agent    TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_audit_actor   ON audit_logs(actor_user_id);
CREATE INDEX idx_audit_entity  ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- =============================================================================
-- Deliberately NOT carried forward from Supabase or the prior D1 draft:
--   * profiles                  — merged into users (see above)
--   * public.users-equivalent   — Supabase's dead second identity table (0
--                                 rows, no write path); never had a D1 form
--   * credentials               — 0 rows live, no code anywhere reads/writes it
--   * ministries                — 0 rows live, no code anywhere reads/writes it
--   * requests                  — 0 rows live, no code anywhere reads/writes it
--   * membership_applications   — existing Worker code still calls this (see
--                                 the M2 report); required update documented,
--                                 not made here
--   * ordination_applications   — same as above; application_json now lives
--                                 directly on ordinations instead
--   * handle_subscription_update / upsert_subscription — confirmed broken
--     and orphaned in Supabase; D1/SQLite has no equivalent trigger-function
--     mechanism to port them to even if they had worked
-- =============================================================================
