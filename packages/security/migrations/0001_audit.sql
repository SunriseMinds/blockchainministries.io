-- @reellink/security — platform audit schema. Append-only.
CREATE TABLE audit_logs (
  id            TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_email   TEXT,
  action        TEXT NOT NULL,
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
