-- Migration 0003: ordination credential issuance (M11).
--
-- 0001_initial_schema.sql and 0002_login_tokens.sql remain frozen and
-- untouched; this is purely additive. It adds the six columns the M11 policy
-- contract requires (docs/M11_CREDENTIAL_POLICY.md) to the EXISTING
-- `ordinations` table. No new table is created: an ordination has exactly one
-- credential, so a separate `credentials` table would add a join and a
-- consistency risk for nothing. (0001 deliberately dropped the Supabase-era
-- `credentials` table for the same reason — see its closing comment block.)
--
-- Ratified policy this migration encodes:
--   * NO expiration          -> there is deliberately no `expires_at` column.
--                               A credential is valid until revoked, full stop.
--   * Revocation is ORTHOGONAL to `status`, exactly as `memberships`
--     separates application_status from payment_status. `status` keeps its
--     original CHECK ('pending','approved','rejected') and is NOT modified —
--     a fourth 'revoked' value would require rewriting a constraint inside
--     the frozen 0001.
--   * Approval and issuance are the SAME act, so these columns are written
--     inside the existing idempotent `WHERE id = ? AND status = 'pending'`
--     UPDATE in worker/db/repositories.js (M11 Phase 3, not this file).
--   * NO R2. `credential_r2_key` (0001) is intentionally left in place,
--     unchanged and unused — a forward hook if server-side archival PDFs are
--     ever adopted. M11 generates credential HTML on demand from these
--     columns instead. This migration adds no storage dependency of any kind.
--
-- SQLite/D1 ALTER TABLE semantics observed here (why the shape is what it is):
--   * One column per ALTER TABLE statement; SQLite has no multi-column ADD.
--   * A column added with a UNIQUE constraint is NOT permitted inline, so
--     `credential_number`'s uniqueness is a separate CREATE UNIQUE INDEX below.
--   * A column added with a NOT NULL constraint MUST carry a non-null constant
--     default — `credential_version` does (0).
--   * A column added with a REFERENCES clause MUST default to NULL —
--     `revoked_by` has no DEFAULT, so its default is NULL. Legal.
--   * No PRAGMA here: 0002 (the only prior additive migration) sets none, and
--     the foreign_keys pragma is connection state, not schema.

-- ------------------------------------------------------------------ issuance --

-- Permanent public-facing credential identifier, format BM-XXXXXXXX (8
-- uppercase alphanumerics). Opaque and non-sequential — it reveals neither
-- ordination volume nor ordering. Generated and collision-checked in the
-- Worker at approval time, then NEVER regenerated: it survives revocation and
-- is preserved verbatim across reissue. NULL until issued.
ALTER TABLE ordinations ADD COLUMN credential_number TEXT;

-- When the credential was issued, ISO-8601 UTC. Deliberately distinct from
-- `approved_at` (0001): approval is the decision, issuance is the credential.
-- They coincide on first issue and diverge on reissue, where `approved_at` is
-- preserved as the original ordination date and `issued_at` moves forward.
--
-- `issued_at IS NOT NULL` is the authoritative "has a credential been issued"
-- test — not `credential_number`, and not `status`.
ALTER TABLE ordinations ADD COLUMN issued_at TEXT;

-- Issuance generation. The lifecycle is:
--
--   0   never issued        <- the DEFAULT, and the truthful state of every
--                              row that predates this migration
--   1   initial issuance    <- set EXPLICITLY by the approval UPDATE
--   2+  reissues            <- credential_version = credential_version + 1
--
-- The default is 0, not 1, because no existing production ordination has ever
-- had a credential issued: backfilling them with 1 would assert an issuance
-- that never happened. Approval must therefore set `credential_version = 1`
-- explicitly rather than relying on this default.
--
-- NOT NULL is safe on an additive column precisely because of the constant
-- default — SQLite backfills every existing row with 0 itself.
--
-- Availability is NEVER derived from this column. The authoritative test is
-- `issued_at IS NOT NULL AND revoked_at IS NULL`; credential_version answers
-- "which generation", not "is there one".
ALTER TABLE ordinations ADD COLUMN credential_version INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------- revocation --

-- NULL = valid. Set once by an admin; cleared again only by reissue.
-- Public verification MUST surface this (a revoked credential verifies AS
-- REVOKED, never as "not found"), and it gates member view/download.
ALTER TABLE ordinations ADD COLUMN revoked_at TEXT;

-- The admin who revoked. Matches `approved_by` in 0001 exactly — same table,
-- same "user who took an administrative action" role, same REFERENCES users(id)
-- with no ON DELETE clause, so the two behave identically under user deletion.
ALTER TABLE ordinations ADD COLUMN revoked_by TEXT REFERENCES users(id);

-- INTERNAL ONLY. Required by policy when revoking, surfaced to admins and to
-- audit_logs — and never returned by the public /api/verify/:slug response,
-- which may show that a credential is revoked and when, but not why.
ALTER TABLE ordinations ADD COLUMN revocation_reason TEXT;

-- ------------------------------------------------------------------- indexes --

-- Uniqueness for `credential_number`, which could not be declared inline (see
-- the ALTER TABLE notes above). PARTIAL by design:
--
--   * It states the actual requirement — unique WHEN NON-NULL — in the schema
--     itself rather than relying on the reader knowing that SQLite treats NULLs
--     as distinct in a plain UNIQUE index. (A plain UNIQUE index would in fact
--     behave identically; this one is explicit and also smaller, covering only
--     rows that have actually been issued.)
--   * It backs the collision check performed before assigning a number, and
--     lookup by credential number.
--
-- Deliberately NOT indexed: `revoked_at`, `issued_at`, `credential_version`.
-- Every M11 query that touches them does so by primary key (revoke, reissue and
-- credential fetch are all `WHERE id = ?`) or via the already-indexed
-- `user_id` / `verify_slug` / `status` paths from 0001. An index nothing reads
-- is write cost with no read benefit; add one later if a query ever justifies it.
CREATE UNIQUE INDEX idx_ordinations_credential_number
  ON ordinations(credential_number)
  WHERE credential_number IS NOT NULL;
