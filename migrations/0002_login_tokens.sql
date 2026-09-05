-- Migration 0002: login_tokens (M9.8 — Workers-Free-tier magic-link login).
--
-- 0001_initial_schema.sql remains frozen and untouched; this is purely
-- additive. Same proven single-use token pattern already used by
-- email_verification_tokens and password_reset_tokens (see 0001) — one row
-- per issued login link, superseded (never deleted) on each new request via
-- the same invalidateAllForUser() the other two tables already use, and
-- consumed exactly once via the same UPDATE ... WHERE consumed_at IS NULL
-- pattern (see packages/auth/src/repositories.js's shared tokenRepo()).
CREATE TABLE login_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  consumed_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_login_tokens_user ON login_tokens(user_id);
