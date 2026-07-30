/**
 * Repositories — the single place SQL is written.
 *
 * Route handlers never contain SQL; they call these functions. This keeps
 * queries parameterized, avoids duplication, and makes the authorization
 * story reviewable: ownership filters live in the WHERE clause, bound to the
 * session's user id, never to a client-supplied value.
 */
import { q, nowIso, uuid, page, fromJsonText } from '../lib/db.js';

/* ------------------------------------------------------------------ users -- */
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

/* --------------------------------------------------------------- sessions -- */
export const sessions = (db) => ({
  /** Joins the profile so auth middleware resolves role in one round trip. */
  byTokenHash: (tokenHash) =>
    q(db).first(
      `SELECT s.id AS session_id, s.user_id, s.expires_at, s.revoked_at,
              u.email, u.status, u.email_verified,
              p.role, p.display_name
         FROM sessions s
         JOIN users u    ON u.id = s.user_id
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

  touch: (id) => q(db).run('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [nowIso(), id]),
  revoke: (id) => q(db).run('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', [nowIso(), id]),
  revokeAllForUser: (userId) =>
    q(db).run('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [nowIso(), userId]),
  deleteExpired: () => q(db).run('DELETE FROM sessions WHERE expires_at < ?', [nowIso()]),
});

/* ----------------------------------------------------------------- tokens -- */
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

/* --------------------------------------------------------------- profiles -- */
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

/* ------------------------------------------------------------ memberships -- */
export const memberships = (db) => ({
  byUser: (userId) => q(db).first('SELECT * FROM memberships WHERE user_id = ?', [userId]),
  byId: (id) => q(db).first('SELECT * FROM memberships WHERE id = ?', [id]),

  async create({ userId, membershipType = null }) {
    const id = uuid();
    const ts = nowIso();
    await q(db).run(
      `INSERT INTO memberships (id, user_id, status, membership_type, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?)`,
      [id, userId, membershipType, ts, ts],
    );
    return id;
  },

  /**
   * Idempotent approval: only transitions pending → approved. A retry changes
   * 0 rows, so the caller must not re-run side effects (e.g. XRPL minting).
   * @returns {Promise<boolean>} true if this call performed the transition
   */
  async approve(id, { approvedBy, nftTokenId = null, txHash = null }) {
    const meta = await q(db).run(
      `UPDATE memberships
          SET status='approved', approved_by=?, approved_at=?, nft_token_id=?, tx_hash=?, updated_at=?
        WHERE id = ? AND status = 'pending'`,
      [approvedBy, nowIso(), nftTokenId, txHash, nowIso(), id],
    );
    return (meta.changes ?? 0) === 1;
  },

  async reject(id, { approvedBy }) {
    const meta = await q(db).run(
      `UPDATE memberships SET status='rejected', approved_by=?, updated_at=? WHERE id = ? AND status = 'pending'`,
      [approvedBy, nowIso(), id],
    );
    return (meta.changes ?? 0) === 1;
  },

  listByStatus(status, opts) {
    const p = page(opts);
    return q(db).all(
      `SELECT m.*, p.display_name, u.email
         FROM memberships m
         LEFT JOIN profiles p ON p.id = m.user_id
         LEFT JOIN users u    ON u.id = m.user_id
        WHERE m.status = ?
        ORDER BY m.created_at DESC${p.clause}`,
      [status, ...p.params],
    );
  },
});

export const membershipApplications = (db) => ({
  async create({ userId, applicationJson }) {
    const id = uuid();
    const ts = nowIso();
    await q(db).run(
      `INSERT INTO membership_applications (id, user_id, application_json, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
      [id, userId, applicationJson, ts, ts],
    );
    return id;
  },
  listByUser: (userId) =>
    q(db).all('SELECT * FROM membership_applications WHERE user_id = ? ORDER BY created_at DESC', [userId]),
  listByStatus(status, opts) {
    const p = page(opts);
    return q(db).all(
      `SELECT * FROM membership_applications WHERE status = ? ORDER BY created_at DESC${p.clause}`,
      [status, ...p.params],
    );
  },
});

/* ------------------------------------------------------------ ordinations -- */
export const ordinations = (db) => ({
  byId: (id) => q(db).first('SELECT * FROM ordinations WHERE id = ?', [id]),
  listByUser: (userId) =>
    q(db).all('SELECT * FROM ordinations WHERE user_id = ? ORDER BY created_at DESC', [userId]),

  /** Public verification: approved only. */
  byVerifySlug: (slug) =>
    q(db).first(
      `SELECT o.id, o.verify_slug, o.status, o.approved_at, o.created_at, p.display_name
         FROM ordinations o
         LEFT JOIN profiles p ON p.id = o.user_id
        WHERE o.verify_slug = ? AND o.status = 'approved'`,
      [slug],
    ),

  async create({ userId }) {
    const id = uuid();
    const ts = nowIso();
    await q(db).run(
      `INSERT INTO ordinations (id, user_id, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)`,
      [id, userId, ts, ts],
    );
    return id;
  },

  /** Idempotent — see memberships.approve. */
  async approve(id, { approvedBy, verifySlug, credentialR2Key = null, nftTokenId = null, txHash = null }) {
    const meta = await q(db).run(
      `UPDATE ordinations
          SET status='approved', approved_by=?, approved_at=?, verify_slug=COALESCE(verify_slug, ?),
              credential_r2_key=?, nft_token_id=?, tx_hash=?, updated_at=?
        WHERE id = ? AND status = 'pending'`,
      [approvedBy, nowIso(), verifySlug, credentialR2Key, nftTokenId, txHash, nowIso(), id],
    );
    return (meta.changes ?? 0) === 1;
  },

  async reject(id, { approvedBy }) {
    const meta = await q(db).run(
      `UPDATE ordinations SET status='rejected', approved_by=?, updated_at=? WHERE id = ? AND status='pending'`,
      [approvedBy, nowIso(), id],
    );
    return (meta.changes ?? 0) === 1;
  },

  listByStatus(status, opts) {
    const p = page(opts);
    return q(db).all(
      `SELECT o.*, p.display_name, u.email
         FROM ordinations o
         LEFT JOIN profiles p ON p.id = o.user_id
         LEFT JOIN users u    ON u.id = o.user_id
        WHERE o.status = ?
        ORDER BY o.created_at DESC${p.clause}`,
      [status, ...p.params],
    );
  },
});

export const ordinationApplications = (db) => ({
  async create({ userId, ordinationId = null, applicationJson }) {
    const id = uuid();
    const ts = nowIso();
    await q(db).run(
      `INSERT INTO ordination_applications
         (id, user_id, ordination_id, application_json, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', ?, ?)`,
      [id, userId, ordinationId, applicationJson, ts, ts],
    );
    return id;
  },
  listByUser: (userId) =>
    q(db).all('SELECT * FROM ordination_applications WHERE user_id = ? ORDER BY created_at DESC', [userId]),
});

/* ---------------------------------------------------------------- scrolls -- */
export const scrolls = (db) => ({
  byId: (id) => q(db).first('SELECT * FROM scrolls WHERE id = ?', [id]),
  byVerifySlug: (slug) => q(db).first('SELECT * FROM scrolls WHERE verify_slug = ?', [slug]),

  /** Public listing never exposes r2_key or non-public scrolls. */
  listPublic(opts) {
    const p = page(opts);
    return q(db).all(
      `SELECT id, title, slug, verify_slug, chain_tx_hash, published_at
         FROM scrolls
        WHERE visibility = 'public' AND published_at IS NOT NULL
        ORDER BY published_at DESC${p.clause}`,
      p.params,
    );
  },

  listAll(opts) {
    const p = page(opts);
    return q(db).all(`SELECT * FROM scrolls ORDER BY created_at DESC${p.clause}`, p.params);
  },

  async create({ title, slug = null, verifySlug = null, r2Key, visibility = 'public', publishedAt = null }) {
    const id = uuid();
    const ts = nowIso();
    await q(db).run(
      `INSERT INTO scrolls (id, title, slug, verify_slug, r2_key, visibility, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, slug, verifySlug, r2Key, visibility, publishedAt, ts, ts],
    );
    return id;
  },
});

/* ------------------------------------------------------- public form data -- */
export const scrollRequests = (db) => ({
  async create({ name, email, requestType, message, ip }) {
    const id = uuid();
    await q(db).run(
      `INSERT INTO scroll_requests (id, name, email, request_type, message, status, ip, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [id, name, email, requestType, message, ip, nowIso()],
    );
    return id;
  },
  list(opts) {
    const p = page(opts);
    return q(db).all(`SELECT * FROM scroll_requests ORDER BY created_at DESC${p.clause}`, p.params);
  },
});

export const contactInquiries = (db) => ({
  async create({ name, email, message, inquiryType, ip }) {
    const id = uuid();
    await q(db).run(
      `INSERT INTO contact_inquiries (id, name, email, message, inquiry_type, status, ip, created_at)
       VALUES (?, ?, ?, ?, ?, 'new', ?, ?)`,
      [id, name, email, message, inquiryType, ip, nowIso()],
    );
    return id;
  },
  list(opts) {
    const p = page(opts);
    return q(db).all(`SELECT * FROM contact_inquiries ORDER BY created_at DESC${p.clause}`, p.params);
  },
});

export const consultations = (db) => ({
  async create({ userId = null, name, email, topic, requestedAt = null }) {
    const id = uuid();
    const ts = nowIso();
    await q(db).run(
      `INSERT INTO consultations (id, user_id, name, email, topic, requested_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, ?)`,
      [id, userId, name, email, topic, requestedAt, ts, ts],
    );
    return id;
  },
  listByUser: (userId) =>
    q(db).all('SELECT * FROM consultations WHERE user_id = ? ORDER BY created_at DESC', [userId]),
  list(opts) {
    const p = page(opts);
    return q(db).all(`SELECT * FROM consultations ORDER BY created_at DESC${p.clause}`, p.params);
  },
});

/* -------------------------------------------------------------- donations -- */
export const donations = (db) => ({
  listByUser: (userId, opts) => {
    const p = page(opts);
    return q(db).all(
      `SELECT id, provider, amount_cents, currency, status, receipt_url, created_at
         FROM donations WHERE user_id = ? ORDER BY created_at DESC${p.clause}`,
      [userId, ...p.params],
    );
  },
  list(opts) {
    const p = page(opts);
    return q(db).all(`SELECT * FROM donations ORDER BY created_at DESC${p.clause}`, p.params);
  },
  byProviderRef: (provider, providerId) =>
    q(db).first('SELECT * FROM donations WHERE provider = ? AND provider_id = ?', [provider, providerId]),

  /**
   * Webhook-safe insert. The unique index on (provider, provider_id) plus
   * INSERT OR IGNORE makes duplicate provider events a no-op.
   */
  async recordIfNew({ userId = null, provider, providerId, amountCents, currency = 'usd', status, receiptUrl = null }) {
    const id = uuid();
    const meta = await q(db).run(
      `INSERT OR IGNORE INTO donations
         (id, user_id, provider, provider_id, amount_cents, currency, status, receipt_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, provider, providerId, amountCents, currency, status, receiptUrl, nowIso()],
    );
    return (meta.changes ?? 0) === 1 ? id : null;
  },
});

/* -------------------------------------------------------------- ministers -- */
export const ministers = (db) => ({
  listPublished(opts) {
    const p = page(opts);
    return q(db).all(
      `SELECT id, display_name, title, bio, photo_key FROM ministers
        WHERE is_published = 1 ORDER BY display_name${p.clause}`,
      p.params,
    );
  },
  byId: (id) =>
    q(db).first(
      'SELECT id, display_name, title, bio, photo_key FROM ministers WHERE id = ? AND is_published = 1',
      [id],
    ),
});

/* ------------------------------------------------------------- audit logs -- */
export const auditLogs = (db) => ({
  async record({ actorUserId = null, actorEmail = null, action, entityType = null, entityId = null, metadata = null, ip = null, userAgent = null }) {
    const id = uuid();
    await q(db).run(
      `INSERT INTO audit_logs
         (id, actor_user_id, actor_email, action, entity_type, entity_id, metadata_json, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, actorUserId, actorEmail, action, entityType, entityId,
       metadata == null ? null : JSON.stringify(metadata), ip, userAgent, nowIso()],
    );
    return id;
  },
  list(opts) {
    const p = page(opts);
    return q(db).all(`SELECT * FROM audit_logs ORDER BY created_at DESC${p.clause}`, p.params);
  },
});

/** Convenience accessor so handlers write `repos(db).users.byEmail(...)`. */
export function repos(db) {
  return {
    users: users(db),
    sessions: sessions(db),
    emailVerificationTokens: emailVerificationTokens(db),
    passwordResetTokens: passwordResetTokens(db),
    profiles: profiles(db),
    memberships: memberships(db),
    membershipApplications: membershipApplications(db),
    ordinations: ordinations(db),
    ordinationApplications: ordinationApplications(db),
    scrolls: scrolls(db),
    scrollRequests: scrollRequests(db),
    contactInquiries: contactInquiries(db),
    consultations: consultations(db),
    donations: donations(db),
    ministers: ministers(db),
    auditLogs: auditLogs(db),
  };
}

export { fromJsonText };
