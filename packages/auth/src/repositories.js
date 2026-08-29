/**
 * Platform identity repositories.
 *
 * `users`, `sessions`, `email_verification_tokens` and `password_reset_tokens`
 * are PLATFORM tables — every Reellink application needs them and they are
 * owned here, not by the application. Applications own only their domain
 * tables.
 *
 * There is deliberately ONE identity table (`users`). It carries role,
 * display name, XRPL wallet, and Stripe customer id directly — there is no
 * separate `profiles` table to keep in sync, and no other identity table may
 * be introduced (see the Phase 0 Supabase audit: a second identity table,
 * `public.users`, existed there and was simply dead — 0 rows, no write path).
 *
 * All SQL is parameterized. Ownership filters are bound to the session's user
 * id by the caller; no query ever trusts a client-supplied id.
 */
import { q, nowIso, uuid, page } from '@reellink/database/d1.js';

export const users = (db) => ({
  byId: (id) => q(db).first('SELECT * FROM users WHERE id = ?', [id]),
  byEmail: (email) => q(db).first('SELECT * FROM users WHERE email = ?', [email]),

  /** `role` is deliberately not a parameter here — it is always the column default. */
  async create({ email, passwordHash, emailVerified = false, displayName = null }) {
    const id = uuid();
    const ts = nowIso();
    await q(db).run(
      `INSERT INTO users (id, email, password_hash, email_verified, role, display_name,
                          status, failed_login_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'member', ?, 'active', 0, ?, ?)`,
      [id, email, passwordHash, emailVerified ? 1 : 0, displayName, ts, ts],
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

  /**
   * Self-service profile fields only. `role`, `password_hash`, `email_verified`,
   * `failed_login_count`, `locked_until`, `stripe_customer_id`, `status` are
   * deliberately NOT parameters here — privilege-escalation guard. Only an
   * explicit administrative action (setRole) or internal payment code
   * (setStripeCustomerId) may touch those.
   */
  updateSelf: (id, { displayName, walletXrpl }) =>
    q(db).run(
      `UPDATE users
          SET display_name = COALESCE(?, display_name),
              wallet_xrpl  = COALESCE(?, wallet_xrpl),
              updated_at   = ?
        WHERE id = ?`,
      [displayName ?? null, walletXrpl ?? null, nowIso(), id],
    ),

  /** Role changes are an administrative action; callers must audit them. */
  setRole: (id, role) => q(db).run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [role, nowIso(), id]),

  /** Set by internal Stripe integration code only — never client-facing. */
  setStripeCustomerId: (id, stripeCustomerId) =>
    q(db).run('UPDATE users SET stripe_customer_id = ?, updated_at = ? WHERE id = ?', [stripeCustomerId, nowIso(), id]),

  list(opts) {
    const p = page(opts);
    return q(db).all(
      `SELECT id, role, display_name, email, email_verified, created_at
         FROM users
        ORDER BY created_at DESC${p.clause}`,
      p.params,
    );
  },
});

export const sessions = (db) => ({
  byTokenHash: (tokenHash) =>
    q(db).first(
      `SELECT s.id AS session_id, s.user_id, s.expires_at, s.revoked_at, s.last_seen_at,
              u.email, u.status, u.email_verified, u.role, u.display_name
         FROM sessions s
         JOIN users u ON u.id = s.user_id
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

/** All identity repositories for a database handle. */
export function authRepos(db) {
  return {
    users: users(db),
    sessions: sessions(db),
    emailVerificationTokens: emailVerificationTokens(db),
    passwordResetTokens: passwordResetTokens(db),
  };
}
