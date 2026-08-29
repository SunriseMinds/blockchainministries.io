-- @reellink/auth — platform identity schema.
-- Every Reellink application applies this BEFORE its own domain migrations.
--
-- Revision note: `role`/`display_name`/`wallet_xrpl`/`stripe_customer_id` were
-- moved onto `users` directly (there is no separate `profiles` table) to
-- match @reellink/auth/repositories.js. This is a BREAKING change for any
-- application that already applied the previous version of this file to a
-- real database (Megaship Express is the one known case) — that database's
-- `users` table is missing these columns and still has a `profiles` table
-- the current repository code no longer queries. Reconciling an
-- already-live application onto this revision is a separate, apposite
-- migration for that application; it is NOT done as part of this change.
CREATE TABLE users (
  id                 TEXT PRIMARY KEY,
  email              TEXT NOT NULL UNIQUE,
  password_hash      TEXT NOT NULL,
  email_verified     INTEGER NOT NULL DEFAULT 0,
  role               TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  display_name       TEXT,
  wallet_xrpl        TEXT,
  stripe_customer_id TEXT,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  failed_login_count INTEGER NOT NULL DEFAULT 0,
  locked_until       TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_users_email  ON users(email);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_role   ON users(role);

CREATE TABLE sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,           -- SHA-256 of the cookie token
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
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL, consumed_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_evt_user ON email_verification_tokens(user_id);

CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL, consumed_at TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_prt_user ON password_reset_tokens(user_id);

-- No `profiles` table. `role` lives on `users` and is never self-writable —
-- @reellink/auth/repositories.js's `users.updateSelf()` has no `role`
-- parameter; only `users.setRole()` (an explicit administrative action) can
-- change it.
