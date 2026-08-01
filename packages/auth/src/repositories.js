/**
 * Platform identity repositories.
 *
 * `users`, `sessions`, `email_verification_tokens`, `password_reset_tokens`
 * and `profiles` are PLATFORM tables — every Reellink application needs them
 * and they are owned here, not by the application. Applications own only their
 * domain tables.
 *
 * All SQL is parameterized. Ownership filters are bound to the session's user
 * id by the caller; no query ever trusts a client-supplied id.
 */
import { q, nowIso, uuid, page } from '@reellink/database/d1.js';

export const users = (db) => ({
  byId: (id) => q(db).first('SELECT * FROM users WHERE id = ?', [id]),
  byEmail: (email) => q(db).first('SELECT * FROM users WHERE email = ?', [email]),

  async create({ email, passwordHash, emailVerified = false }) {
    const id = uuid();
    const ts = nowIso();
    await q(db).run(
      `INSERT INTO users (id, email, password_hash, email_verified, status,
                          failed_login_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', 0, ?, ?)`,
      [id, email, passwordHash, emailVerified ? 1 : 0, ts, ts],
    );
    return id;
  },

  setPassword: (id, passwordHash) =>
    q(db).run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [passwordHash, nowIso(), id]),

  markVerified: (id) =>
    q(db).run('UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?', [nowIso(), id]),

  recordFailedLogin: (id, lockedUntil = null) =>
    q(db).run(
      'UPDATE users SET failed_login_count = failed_login_count + 1, locked_until = ?, updated_at = ? WHERE id = ?',
      [lockedUntil, nowIso(), id],
    ),

  resetFailedLogins: (id) =>
    q(db).run('UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?', [nowIso(), id]),
});

export const sessions = (db) => ({
  /** Joins the profile so auth middleware resolves role in one round trip. */
  byTokenHash: (tokenHash) =>
    q(db).first(
      `SELECT s.id AS session_id, s.user_id, s.expires_at, s.revoked_at, s.last_seen_at,
              u.email, u.status, u.email_verified,
              p.role, p.display_name
         FROM sessions s
         JOIN users u         ON u.id = s.user_id
         LEFT JOIN profiles p ON p.id = s.user_id
        WHERE s.token_hash = ?`,
      [tokenHash],
    ),

  async create({ userId, tokenHash, expiresAt, ip, userAgent }) {
    const id = uuid();
    await q(db).run(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at, last_seen_at, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, tokenHash, expiresAt, nowIso(), nowIso(), ip, userAgent],
    );
    return id;
  },

  /**
   * Refresh last_seen_at, but only when it is already stale. Session checks
   * are frequent; writing on every one turns a read path into a write path.
   */
  touch: (id, staleAfterSeconds = 300) =>
    q(db).run(
      `UPDATE sessions SET last_seen_at = ?
        WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at < ?)`,
      [nowIso(), id, new Date(Date.now() - staleAfterSeconds * 1000).toISOString()],
    ),
  revoke: (id) => q(db).run('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [nowIso(), id]),
  revokeAllForUser: (userId) =>
    q(db).run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [nowIso(), userId]),
  deleteExpired: () => q(db).run('DELETE FROM sessions WHERE expires_at < ?', [nowIso()]),
});

/** Shared implementation for the two single-use token tables. */
function tokenRepo(db, table) {
  return {
    async create({ userId, tokenHash, expiresAt }) {
      const id = uuid();
      await q(db).run(
        `INSERT INTO ${table} (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)`,
        [id, userId, tokenHash, expiresAt, nowIso()],
      );
      return id;
    },
    byTokenHash: (tokenHash) => q(db).first(`SELECT * FROM ${table} WHERE token_hash = ?`, [tokenHash]),
    /** Atomic single-use consumption: only succeeds if still unconsumed. */
    async consume(id) {
      const meta = await q(db).run(
        `UPDATE ${table} SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`,
        [nowIso(), id],
      );
      return (meta.changes ?? 0) === 1;
    },
    invalidateAllForUser: (userId) =>
      q(db).run(`UPDATE ${table} SET consumed_at = ? WHERE user_id = ? AND consumed_at IS NULL`, [nowIso(), userId]),
  };
}
// `table` is a fixed internal constant, never user input.
export const emailVerificationTokens = (db) => tokenRepo(db, 'email_verification_tokens');
export const passwordResetTokens = (db) => tokenRepo(db, 'password_reset_tokens');

export const profiles = (db) => ({
  byId: (id) => q(db).first('SELECT * FROM profiles WHERE id = ?', [id]),

  async create({ id, displayName = null, role = 'member' }) {
    const ts = nowIso();
    await q(db).run(
      'INSERT INTO profiles (id, role, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [id, role, displayName, ts, ts],
    );
  },

  /** `role` is deliberately NOT updatable here — privilege escalation guard. */
  updateSelf: (id, { displayName, walletXrpl }) =>
    q(db).run(
      `UPDATE profiles
          SET display_name = COALESCE(?, display_name),
              wallet_xrpl  = COALESCE(?, wallet_xrpl),
              updated_at   = ?
        WHERE id = ?`,
      [displayName ?? null, walletXrpl ?? null, nowIso(), id],
    ),

  /** Role changes are an administrative action; callers must audit them. */
  setRole: (id, role) => q(db).run('UPDATE profiles SET role = ?, updated_at = ? WHERE id = ?', [role, nowIso(), id]),

  list(opts) {
    const p = page(opts);
    return q(db).all(
      `SELECT p.id, p.role, p.display_name, p.created_at, u.email, u.email_verified
         FROM profiles p JOIN users u ON u.id = p.id
        ORDER BY p.created_at DESC${p.clause}`,
      p.params,
    );
  },
});

/** All identity repositories for a database handle. */
export function authRepos(db) {
  return {
    users: users(db),
    sessions: sessions(db),
    emailVerificationTokens: emailVerificationTokens(db),
    passwordResetTokens: passwordResetTokens(db),
    profiles: profiles(db),
  };
}
