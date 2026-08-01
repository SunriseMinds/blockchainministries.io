-- <APP_NAME> domain schema.
-- Applied AFTER the platform migrations:
--   packages/auth/migrations/0001_identity.sql
--   packages/security/migrations/0001_audit.sql
-- Domain tables reference users(id); never re-model identity.
CREATE TABLE examples (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  title      TEXT NOT NULL,
  ip         TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_examples_user    ON examples(user_id);
CREATE INDEX idx_examples_created ON examples(created_at);
