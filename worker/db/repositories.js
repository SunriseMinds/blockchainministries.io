/**
 * Blockchain Ministries DOMAIN repositories — the single place app SQL lives.
 *
 * Platform tables (users, sessions, tokens, audit_logs) are owned by
 * @reellink/auth and @reellink/security and are composed in by repos() below,
 * so this file contains business tables only. There is no `profiles` table —
 * identity, role, and profile fields all live on the single `users` table.
 *
 * Route handlers never contain SQL; they call these functions. This keeps
 * queries parameterized, avoids duplication, and makes the authorization
 * story reviewable: ownership filters live in the WHERE clause, bound to the
 * session's user id, never to a client-supplied value.
 */
import { q, nowIso, uuid, page, fromJsonText, defineRepos } from '@reellink/database/d1.js';
import { authRepos } from '@reellink/auth/repositories.js';
import { auditLogs } from '@reellink/security/audit-repo.js';
import { generateCredentialNumber } from '../credential/number.js';

/**
 * Is this error specifically a collision on `ordinations.credential_number`?
 *
 * Deliberately narrow (M11 Phase 3). `ordinations` also has a UNIQUE
 * `verify_slug`, and the approval UPDATE writes both — retrying a fresh
 * credential number would not fix a slug collision, and silently retrying any
 * UNIQUE failure would mask real bugs. Both substrings must be present, so a
 * different constraint, a foreign-key failure, or any other database error
 * propagates untouched.
 */
function isCredentialNumberCollision(err) {
  const msg = String(err?.message ?? '');
  return msg.includes('UNIQUE constraint failed') && msg.includes('ordinations.credential_number');
}

/**
 * Does this ordination row currently have a usable credential?
 *
 * The ONE definition, per docs/M11_CREDENTIAL_POLICY.md: issued and not
 * revoked. Never derived from `credential_version` (0 = never issued, but 2
 * is just as valid as 1) and never from `credential_r2_key`, which M11 leaves
 * permanently NULL.
 */
export const credentialAvailable = (o) => Boolean(o?.issued_at && !o?.revoked_at);

/* ------------------------------------------------------------ memberships -- */
// `application_status` (admin-decided) and `payment_status` (webhook-decided
// only) are independent dimensions — see migrations/0001_initial_schema.sql.
// Nothing in this file ever writes payment_status; it is reserved for the
// Stripe webhook path (a later milestone).
export const memberships = (db) => ({
  byUser: (userId) => q(db).first('SELECT * FROM memberships WHERE user_id = ?', [userId]),
  byId: (id) => q(db).first('SELECT * FROM memberships WHERE id = ?', [id]),

  async create({ userId, membershipType = null, applicationJson = null }) {
    const id = uuid();
    const ts = nowIso();
    await q(db).run(
      `INSERT INTO memberships (id, user_id, application_status, membership_type, application_json, created_at, updated_at)
       VALUES (?, ?, 'pending', ?, ?, ?, ?)`,
      [id, userId, membershipType, applicationJson, ts, ts],
    );
    return id;
  },

  /**
   * Idempotent approval: only transitions pending → approved. A retry changes
   * 0 rows, so the caller must not re-run side effects (e.g. XRPL minting).
   * Never touches payment_status.
   * @returns {Promise<boolean>} true if this call performed the transition
   */
  async approve(id, { approvedBy, nftTokenId = null, txHash = null }) {
    const meta = await q(db).run(
      `UPDATE memberships
          SET application_status='approved', approved_by=?, approved_at=?, nft_token_id=?, tx_hash=?, updated_at=?
        WHERE id = ? AND application_status = 'pending'`,
      [approvedBy, nowIso(), nftTokenId, txHash, nowIso(), id],
    );
    return (meta.changes ?? 0) === 1;
  },

  async reject(id, { approvedBy }) {
    const meta = await q(db).run(
      `UPDATE memberships SET application_status='rejected', approved_by=?, updated_at=? WHERE id = ? AND application_status = 'pending'`,
      [approvedBy, nowIso(), id],
    );
    return (meta.changes ?? 0) === 1;
  },

  /**
   * A previously-rejected applicant may resubmit — the only allowed
   * rejected → pending transition, and only on the applicant's own row
   * (callers must scope this to the session's user id).
   */
  async resubmit(id, { applicationJson }) {
    const meta = await q(db).run(
      `UPDATE memberships SET application_status='pending', application_json=?, approved_by=NULL, approved_at=NULL, updated_at=?
        WHERE id = ? AND application_status = 'rejected'`,
      [applicationJson, nowIso(), id],
    );
    return (meta.changes ?? 0) === 1;
  },

  /**
   * Called ONLY from the verified Stripe webhook path — never from a client
   * request or from admin approval. Scoped to `membership_type = 'paid'` so a
   * free membership can never be put into a paid subscription state even if
   * a stale/mismatched webhook somehow resolved to that user.
   * @returns {Promise<boolean>} true if a paid membership row was updated
   */
  async setPaymentStatus(userId, paymentStatus) {
    const meta = await q(db).run(
      `UPDATE memberships SET payment_status = ?, updated_at = ? WHERE user_id = ? AND membership_type = 'paid'`,
      [paymentStatus, nowIso(), userId],
    );
    return (meta.changes ?? 0) === 1;
  },

  listByStatus(applicationStatus, opts) {
    const p = page(opts);
    return q(db).all(
      `SELECT m.*, u.display_name, u.email
         FROM memberships m
         JOIN users u ON u.id = m.user_id
        WHERE m.application_status = ?
        ORDER BY m.created_at DESC${p.clause}`,
      [applicationStatus, ...p.params],
    );
  },

  /** Admin overview only — every status, not just one. Mirrors scrolls.listAll(). */
  listAll(opts) {
    const p = page(opts);
    return q(db).all(
      `SELECT m.*, u.display_name, u.email
         FROM memberships m
         JOIN users u ON u.id = m.user_id
        ORDER BY m.created_at DESC${p.clause}`,
      p.params,
    );
  },
});

/* ------------------------------------------------------------ ordinations -- */
export const ordinations = (db) => ({
  byId: (id) => q(db).first('SELECT * FROM ordinations WHERE id = ?', [id]),
  listByUser: (userId) =>
    q(db).all('SELECT * FROM ordinations WHERE user_id = ? ORDER BY created_at DESC', [userId]),
  /** Most recent ordination for this user — used to dedupe/resubmit, mirrors memberships.byUser. */
  byUser: (userId) =>
    q(db).first('SELECT * FROM ordinations WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', [userId]),

  /**
   * Public verification lookup (M11 Phase 6).
   *
   * Resolves an ISSUED credential whether or not it is revoked — a revoked
   * credential MUST stay publicly resolvable so that someone scanning an old
   * printed QR is told it was revoked, rather than getting "not found" and
   * being unable to tell revocation from a bad code. The caller decides
   * valid vs revoked from `revoked_at`.
   *
   * `issued_at IS NOT NULL` is required in addition to status: an ordination
   * approved before M11 is NOT automatically a credential.
   *
   * `revoked_by` and `revocation_reason` are deliberately NOT selected, and
   * neither is `user_id`, `approved_by`, or any users-table column. The
   * private fields cannot leak through this path because they are never
   * fetched — defence in depth behind the route's own field allow-list.
   * `application_json` is returned only so the route can extract fullName
   * (Q3); the route never passes it onward.
   */
  byVerifySlug: (slug) =>
    q(db).first(
      `SELECT o.id, o.verify_slug, o.status, o.application_json,
              o.credential_number, o.approved_at, o.issued_at, o.revoked_at
         FROM ordinations o
        WHERE o.verify_slug = ? AND o.status = 'approved' AND o.issued_at IS NOT NULL`,
      [slug],
    ),

  async create({ userId, applicationJson }) {
    const id = uuid();
    const ts = nowIso();
    await q(db).run(
      `INSERT INTO ordinations (id, user_id, application_json, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
      [id, userId, applicationJson, ts, ts],
    );
    return id;
  },

  /**
   * Approve AND issue, in one statement. Idempotent — see memberships.approve.
   *
   * M11 Q9 ratifies approval and issuance as the SAME act, so the single
   * UPDATE that moves pending -> approved also assigns `credential_number`,
   * stamps `issued_at`, and sets `credential_version = 1`. There is no second
   * write, so there is no window in which an ordination is approved but
   * un-issued, and no partial state to reconcile if the request dies midway.
   *
   * `credential_version` is set EXPLICITLY to 1 rather than relying on the
   * column default, which is 0 ("never issued") — see migrations/0003.
   *
   * The `WHERE id = ? AND status = 'pending'` gate is the idempotency
   * mechanism and is unchanged: a retry after a successful approval changes 0
   * rows, so it cannot issue a second credential, overwrite the assigned
   * number, move `issued_at`/`approved_at`, reset the version, or regenerate
   * `verify_slug` (which is additionally pinned by COALESCE).
   *
   * COLLISION HANDLING: uniqueness is owned by the D1 partial unique index,
   * NOT by a pre-flight SELECT — a check-then-write would be a race. We simply
   * attempt the write and, if the database rejects that specific number,
   * generate another and try again, bounded. Any other error propagates.
   *
   * `credential_r2_key` is deliberately NO LONGER in the SET list. It was only
   * ever written back as its own prior value, and leaving it out means no
   * approval path can null a credential reference. M11 stores no object, so
   * the column stays NULL and unused (Q7).
   *
   * `nftTokenId`/`txHash` are retained purely to preserve the existing XRPL
   * call signature in worker/routes/admin.js; XRPL behaviour is unchanged in
   * this phase (see the backlog note about the mint hash never persisting).
   *
   * @returns {Promise<boolean>} true if this call performed the transition
   */
  async approve(id, {
    approvedBy,
    verifySlug,
    nftTokenId = null,
    txHash = null,
    now = null,
    generateNumber = generateCredentialNumber,
    maxAttempts = 5,
  }) {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const ts = now ?? nowIso();
      try {
        const meta = await q(db).run(
          `UPDATE ordinations
              SET status='approved', approved_by=?, approved_at=?, verify_slug=COALESCE(verify_slug, ?),
                  credential_number=?, issued_at=?, credential_version=1,
                  nft_token_id=?, tx_hash=?, updated_at=?
            WHERE id = ? AND status = 'pending'`,
          [approvedBy, ts, verifySlug, generateNumber(), ts, nftTokenId, txHash, ts, id],
        );
        return (meta.changes ?? 0) === 1;
      } catch (err) {
        // Only a collision on the credential number is retryable. A UNIQUE
        // failure on verify_slug, an FK failure, or anything else is a real
        // error and must not be retried into a different outcome.
        if (!isCredentialNumberCollision(err)) throw err;
        if (attempt === maxAttempts) {
          // Fail loudly. The UPDATE is atomic, so every failed attempt wrote
          // nothing — the row is still 'pending' and un-issued, never
          // half-approved.
          throw new Error(
            `Could not allocate a unique credential number for ordination ${id} after ${maxAttempts} attempts`,
          );
        }
      }
    }
    // Unreachable: the loop either returns or throws.
    return false;
  },

  async reject(id, { approvedBy }) {
    const meta = await q(db).run(
      `UPDATE ordinations SET status='rejected', approved_by=?, updated_at=? WHERE id = ? AND status='pending'`,
      [approvedBy, nowIso(), id],
    );
    return (meta.changes ?? 0) === 1;
  },

  /**
   * A previously-rejected applicant may resubmit — the only allowed
   * rejected → pending transition, mirrors memberships.resubmit. A rejected
   * row can only ever have reached 'rejected' from 'pending' (never from
   * 'approved'), so every field cleared below is already NULL here; clearing
   * them anyway is defense in depth.
   *
   * M11: the reset is now TOTAL. Before this phase it cleared only
   * approved_by/approved_at/nft_token_id/tx_hash, which was complete at the
   * time because no credential fields existed. Leaving any credential
   * lifecycle state on a row that has gone back to 'pending' would mean a
   * pending application still reporting an issued (or revoked) credential, so
   * all six M11 columns are reset to their never-issued values:
   * credential_version returns to 0, not 1.
   *
   * `credential_r2_key` is cleared here too, even though M11 never writes it
   * (Q7). A stale object reference must never survive back into a pending
   * application — if server-side archival is ever adopted, this reset is
   * already correct rather than a latent bug waiting to be found.
   */
  async resubmit(id, { applicationJson, now = null }) {
    const ts = now ?? nowIso();
    const meta = await q(db).run(
      `UPDATE ordinations
          SET status='pending', application_json=?, approved_by=NULL, approved_at=NULL,
              nft_token_id=NULL, tx_hash=NULL,
              credential_number=NULL, issued_at=NULL, credential_version=0,
              revoked_at=NULL, revoked_by=NULL, revocation_reason=NULL,
              credential_r2_key=NULL, updated_at=?
        WHERE id = ? AND status = 'rejected'`,
      [applicationJson, ts, id],
    );
    return (meta.changes ?? 0) === 1;
  },

  /**
   * Revoke an issued credential (M11 Q6 — admin-only at the route layer,
   * which does not exist yet).
   *
   * Revocation is ORTHOGONAL to `status`: the ordination remains 'approved'
   * because the ministry's decision has not been reversed — only the
   * credential's validity has. `status` therefore keeps its original CHECK
   * from the frozen 0001 and needs no 'revoked' value.
   *
   * Permanent identity is untouched: credential_number, verify_slug,
   * approved_at, approved_by, issued_at and credential_version all survive, so
   * a revoked credential still verifies publicly AS REVOKED rather than
   * vanishing.
   *
   * Guarded on `issued_at IS NOT NULL AND revoked_at IS NULL`, so the write is
   * atomic and idempotent — a double revoke changes 0 rows and cannot
   * overwrite the original reason, actor, or timestamp.
   *
   * @returns {Promise<{ok:boolean, outcome:'revoked'|'not_found'|'not_issued'|'already_revoked'}>}
   */
  async revoke(id, { revokedBy, reason, now = null }) {
    const ts = now ?? nowIso();
    const meta = await q(db).run(
      `UPDATE ordinations
          SET revoked_at=?, revoked_by=?, revocation_reason=?, updated_at=?
        WHERE id = ? AND issued_at IS NOT NULL AND revoked_at IS NULL`,
      [ts, revokedBy, reason, ts, id],
    );
    if ((meta.changes ?? 0) === 1) return { ok: true, outcome: 'revoked' };

    // Only on the failure path do we pay for a read, purely to tell the route
    // layer WHY, so it can answer 404 vs 409 correctly in a later phase.
    const row = await q(db).first('SELECT id, issued_at, revoked_at FROM ordinations WHERE id = ?', [id]);
    if (!row) return { ok: false, outcome: 'not_found' };
    if (row.revoked_at) return { ok: false, outcome: 'already_revoked' };
    return { ok: false, outcome: 'not_issued' };
  },

  /**
   * Reissue a revoked credential (M11 Q8 — admin-only at the route layer,
   * which does not exist yet).
   *
   * Restores validity on the SAME credential: `credential_number` and
   * `verify_slug` are never regenerated (the slug is a public URL that may be
   * printed — risk R-13), and `approved_at`/`approved_by` keep the original
   * ordination date. Only the generation advances.
   *
   * Guarded on `issued_at IS NOT NULL AND revoked_at IS NOT NULL` — reissue is
   * defined only for a credential that exists and is currently revoked, so it
   * can never quietly bump the version of a live credential or manufacture one
   * for a never-issued ordination.
   *
   * @returns {Promise<{ok:boolean, outcome:'reissued'|'not_found'|'not_issued'|'not_revoked'}>}
   */
  async reissue(id, { now = null } = {}) {
    const ts = now ?? nowIso();
    const meta = await q(db).run(
      `UPDATE ordinations
          SET revoked_at=NULL, revoked_by=NULL, revocation_reason=NULL,
              issued_at=?, credential_version = credential_version + 1, updated_at=?
        WHERE id = ? AND issued_at IS NOT NULL AND revoked_at IS NOT NULL`,
      [ts, ts, id],
    );
    if ((meta.changes ?? 0) === 1) return { ok: true, outcome: 'reissued' };

    const row = await q(db).first('SELECT id, issued_at, revoked_at FROM ordinations WHERE id = ?', [id]);
    if (!row) return { ok: false, outcome: 'not_found' };
    if (!row.issued_at) return { ok: false, outcome: 'not_issued' };
    return { ok: false, outcome: 'not_revoked' };
  },

  listByStatus(status, opts) {
    const p = page(opts);
    return q(db).all(
      `SELECT o.*, u.display_name, u.email
         FROM ordinations o
         JOIN users u ON u.id = o.user_id
        WHERE o.status = ?
        ORDER BY o.created_at DESC${p.clause}`,
      [status, ...p.params],
    );
  },

  /** Admin overview only — every status, not just one. Mirrors scrolls.listAll(). */
  listAll(opts) {
    const p = page(opts);
    return q(db).all(
      `SELECT o.*, u.display_name, u.email
         FROM ordinations o
         JOIN users u ON u.id = o.user_id
        ORDER BY o.created_at DESC${p.clause}`,
      p.params,
    );
  },
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
  byStripeEventId: (stripeEventId) =>
    q(db).first('SELECT * FROM donations WHERE stripe_event_id = ?', [stripeEventId]),

  /**
   * Webhook-safe insert. The UNIQUE constraint on stripe_event_id (Stripe's
   * own event id, guaranteed unique per delivery) plus INSERT OR IGNORE makes
   * a redelivered webhook a true no-op — unlike a provider charge/session id,
   * which is not guaranteed unique across event types.
   */
  async recordIfNew({ userId = null, provider, stripeEventId, providerChargeId = null, amountCents, currency = 'usd', status, receiptUrl = null }) {
    const id = uuid();
    const meta = await q(db).run(
      `INSERT OR IGNORE INTO donations
         (id, user_id, provider, stripe_event_id, provider_charge_id, amount_cents, currency, status, receipt_url, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, userId, provider, stripeEventId, providerChargeId, amountCents, currency, status, receiptUrl, nowIso()],
    );
    return (meta.changes ?? 0) === 1 ? id : null;
  },
});

/* ----------------------------------------------------------- subscriptions -- */
// Structural support only (M2.5) for the paid membership tier's recurring
// billing state. Populated exclusively by a future Stripe webhook handler —
// nothing here calls Stripe, and no route wires this up yet.
export const subscriptions = (db) => ({
  byUserId: (userId) => q(db).first('SELECT * FROM subscriptions WHERE user_id = ?', [userId]),
  byStripeSubscriptionId: (stripeSubscriptionId) =>
    q(db).first('SELECT * FROM subscriptions WHERE stripe_subscription_id = ?', [stripeSubscriptionId]),

  /**
   * Idempotent upsert keyed on stripe_subscription_id — safe to call for
   * every subscription-lifecycle webhook event without a prior read.
   */
  async upsertFromWebhook({ userId, stripeSubscriptionId, stripeCustomerId, status, currentPeriodEnd = null }) {
    const ts = nowIso();
    await q(db).run(
      `INSERT INTO subscriptions (id, user_id, stripe_subscription_id, stripe_customer_id, status, current_period_end, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(stripe_subscription_id) DO UPDATE SET
         status = excluded.status,
         current_period_end = COALESCE(excluded.current_period_end, subscriptions.current_period_end),
         updated_at = excluded.updated_at`,
      [uuid(), userId, stripeSubscriptionId, stripeCustomerId, status, currentPeriodEnd, ts, ts],
    );
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


/** Convenience accessor so handlers write `repos(db).users.byEmail(...)`. */
export const repos = defineRepos((db) => ({
    // Platform identity + audit, owned by @reellink/auth and @reellink/security.
    ...authRepos(db),
    auditLogs: auditLogs(db),
    // Blockchain Ministries domain tables.
    memberships: memberships(db),
    ordinations: ordinations(db),
    scrolls: scrolls(db),
    scrollRequests: scrollRequests(db),
    contactInquiries: contactInquiries(db),
    consultations: consultations(db),
    donations: donations(db),
    subscriptions: subscriptions(db),
    ministers: ministers(db),
  }));

export { fromJsonText };
