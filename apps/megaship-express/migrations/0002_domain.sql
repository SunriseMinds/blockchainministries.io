-- Megaship Express domain schema. Applied AFTER the platform migrations:
--   packages/auth/migrations/0001_identity.sql
--   packages/security/migrations/0001_audit.sql
CREATE TABLE items (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_items_user ON items(user_id);
