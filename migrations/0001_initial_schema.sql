-- =============================================================================
-- Blockchain Ministries — D1 initial schema (PROPOSAL — NOT YET APPLIED)
-- Target: Cloudflare D1 `blockchain-ministries-db` (binding: DB)
--
-- Reviewable, version-controlled DDL. Do NOT apply until the owner approves and
-- the auth option is selected (see docs/AUTH_CUTOVER_PLAN.md).
--   Apply with: wrangler d1 migrations apply blockchain-ministries-db
--
-- Conventions:
--   * ids are TEXT uuids generated in the Worker (crypto.randomUUID())
--   * timestamps are TEXT ISO-8601 UTC, set by the Worker
--   * booleans are INTEGER 0/1
--   * money is INTEGER minor units (cents)
--   * D1 has NO row-level security: every rule is enforced in Worker code
-- =============================================================================

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------- identity ---
CREATE TABLE users (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,          -- stored lowercase
  password_hash      TEXT NOT NULL,                 -- Argon2id/scrypt; never a Supabase hash
  email_verified     INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','suspended','deleted')),
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until       TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_users_email  ON users(email);
CREATE INDEX idx_users_status ON users(status);

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

CREATE TABLE profiles (
  id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role               TEXT NOT NULL DEFAULT 'member'
                       CHECK (role IN ('member','admin')),   -- never self-writable
  display_name       TEXT,
  wallet_xrpl        TEXT,
  stripe_customer_id TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_profiles_role ON profiles(role);

-- -------------------------------------------------------------- membership ---
CREATE TABLE memberships (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  membership_type TEXT,
  nft_token_id    TEXT,
  tx_hash         TEXT,
  approved_by     TEXT REFERENCES users(id),
  approved_at     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX idx_memberships_status ON memberships(status);

CREATE TABLE membership_applications (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  application_json TEXT NOT NULL,                   -- JSON
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected')),
  reviewed_by      TEXT REFERENCES users(id),
  reviewed_at      TEXT,
  review_notes     TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_mapp_user   ON membership_applications(user_id);
CREATE INDEX idx_mapp_status ON membership_applications(status);

-- -------------------------------------------------------------- ordination ---
CREATE TABLE ordinations (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

CREATE TABLE ordination_applications (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ordination_id    TEXT REFERENCES ordinations(id) ON DELETE SET NULL,
  application_json TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected')),
  reviewed_by      TEXT REFERENCES users(id),
  reviewed_at      TEXT,
  review_notes     TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);
CREATE INDEX idx_oapp_user   ON ordination_applications(user_id);
CREATE INDEX idx_oapp_status ON ordination_applications(status);

-- ------------------------------------------------------------- content/docs ---
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

-- ----------------------------------------------------------------- finance ---
CREATE TABLE donations (
  id           TEXT PRIMARY KEY,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,   -- NULL = anonymous
  provider     TEXT CHECK (provider IN ('stripe','coinbase','paypal')),
  provider_id  TEXT,
  amount_cents INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'usd',
  status       TEXT NOT NULL,
  receipt_url  TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_donations_user    ON donations(user_id);
CREATE INDEX idx_donations_created ON donations(created_at);
-- webhook idempotency: never record the same provider event twice
CREATE UNIQUE INDEX idx_donations_provider_ref ON donations(provider, provider_id)
  WHERE provider_id IS NOT NULL;

-- ------------------------------------------------------------------ inbound ---
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

-- --------------------------------------------------------------- directory ---
-- Populated later from Firebase Firestore. Firestore document ids MUST be kept:
-- /minister/:ministerId is a live public URL.
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

-- ------------------------------------------------------------------- audit ---
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
