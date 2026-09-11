/**
 * Public + member routes: profile, contact, membership, ordination, scrolls,
 * donations, consultations, ministers.
 *
 * Authorization rule applied throughout: every ownership filter is bound to
 * ctx.session.user_id. A client-supplied user id is never trusted.
 */
import { json, readJson, clientIp, notFound, conflict, badRequest, HttpError } from '@reellink/core/http.js';
import { requireDb } from '@reellink/database/d1.js';
import { repos, fromJsonText, credentialAvailable } from '../db/repositories.js';
import { renderCredential } from '../credential/render.js';
import * as v from '@reellink/core/validate.js';
import { enforce } from '@reellink/security/ratelimit.js';
import { audit } from '@reellink/security/audit.js';
import { ACTIONS } from '../config/actions.js';
import { send, templates, notifyAdmins } from '../email/templates.js';
import { requireAuth, requireVerifiedEmail } from '@reellink/auth/middleware.js';
import { requireTurnstile } from '@reellink/security/turnstile-middleware.js';
import * as stripe from '@reellink/payments/stripe.js';
import * as xrpl from '@reellink/xrpl/client.js';

/**
 * Response headers for the credential document (M11 Phase 5).
 *
 * The CSP is derived from what the Phase 4 renderer actually emits, not copied
 * from a template:
 *
 *   default-src 'none'      Nothing may be fetched. `script-src` inherits this,
 *                           so NO JavaScript can execute — inline or external —
 *                           even if escaping were ever to fail.
 *   style-src 'unsafe-inline'
 *                           The one allowance the document needs: a single
 *                           inline <style> block. A hash would be marginally
 *                           tighter, but it silently unstyles the page on any
 *                           whitespace change to the stylesheet, and the
 *                           residual risk is negligible here — script execution
 *                           is already fully blocked, and with no img-src,
 *                           font-src or connect-src there is no CSS channel to
 *                           exfiltrate through either.
 *   base-uri / form-action / frame-ancestors 'none'
 *                           No base-tag hijack, no form posts, no framing.
 *
 * There is deliberately NO img-src: the QR is an inline <svg> element, part of
 * the document's own markup rather than a fetched image, so it renders under
 * `default-src 'none'`. The renderer emits no <img>, no <link>, no <script>,
 * no @import and no url() — asserted by both the Phase 4 and Phase 5 suites —
 * so nothing further needs allowing.
 */
const CREDENTIAL_CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const CREDENTIAL_HEADERS = Object.freeze({
  'Content-Type': 'text/html; charset=utf-8',
  // Authenticated, per-member document: never store it, never let a shared
  // cache hold it.
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': CREDENTIAL_CSP,
  // The credential URL contains the ordination id; don't leak it onward.
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
});

/* ==========================================================================
 * M13 — notification safety.
 *
 * THE INVARIANT: email is a side effect, never transactional authority.
 *
 * Once a business row is committed to D1, nothing about delivering a message
 * may make that operation look like it failed. Before M13, both the applicant
 * confirmation and the admin notification were bare `await`s: a thrown
 * provider/config error (send() raises HttpError when EMAIL_API_KEY is
 * missing, or on an unknown EMAIL_PROVIDER) surfaced as a 500 *after* the
 * insert — the visitor saw a failed submission for a record that exists, and
 * the business audit never got written either.
 *
 * Everything below is fail-soft by construction and cannot throw.
 * ========================================================================== */

/** Trim a failure reason to something safe and loggable. Never a message body. */
function shortReason(value, fallback) {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, 120) : fallback;
}

/**
 * Run one delivery attempt and absorb every way it can fail.
 *
 * @returns {Promise<{sent:boolean, reason?:string}>} never rejects
 */
async function safeNotify(ctx, attempt, { audience, kind, entityType, entityId }) {
  let sent = false;
  let reason;

  try {
    const result = await attempt();
    sent = Boolean(result?.sent);
    if (!sent) reason = shortReason(result?.reason, 'not_sent');
  } catch (err) {
    sent = false;
    reason = shortReason(err?.message, 'threw');
  }

  if (!sent) {
    // Recorded so an administrator can see what never landed. Identifiers and
    // a short reason only — never the message body, never applicant narrative,
    // never tokens or keys.
    //
    // audit() already swallows its own errors, but it is wrapped anyway: a
    // secondary failure while reporting a failure must not become the thing
    // that breaks an already-committed request.
    try {
      await audit(ctx, ACTIONS.NOTIFY_FAILED, {
        entityType,
        entityId,
        metadata: { audience, kind, reason },
      });
    } catch {
      // Deliberately swallowed — see above.
    }
  }

  return sent ? { sent: true } : { sent: false, reason };
}

/** Notify the ministry's operations inbox. Fail-soft. */
function notifyOps(ctx, message, meta) {
  return safeNotify(ctx, () => notifyAdmins(ctx, message), { audience: 'admin', ...meta });
}

/** Notify the person who submitted. Fail-soft, same guarantees. */
function notifySubmitter(ctx, to, message, meta) {
  return safeNotify(ctx, () => send(ctx, { to, ...message }), { audience: 'submitter', ...meta });
}

/** `2026-09-11 01:51 UTC` — deterministic, timezone-independent. */
function submittedOn(iso = new Date().toISOString()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)} UTC`;
}

/** Where an administrator goes to act on an incoming submission. */
const reviewUrl = (ctx) => `${ctx.env.SITE_URL || ctx.url.origin}/admin/management`;

export function mount(r) {
  /* ------------------------------------------------------------ profile -- */
  r.get('/api/profile', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    const user = await repos(db).users.byId(ctx.session.user_id);
    if (!user) throw notFound('Profile not found');
    return json({
      id: user.id,
      email: user.email,
      role: user.role,
      display_name: user.display_name,
      wallet_xrpl: user.wallet_xrpl,
      // stripe_customer_id is deliberately not exposed here — internal billing
      // linkage, not a client-facing profile field.
      created_at: user.created_at,
    });
  });

  /**
   * Only `display_name` and `wallet_xrpl` are ever accepted here. `role`,
   * `password_hash`, `email_verified`, `failed_login_count`, `locked_until`,
   * and `stripe_customer_id` are never read from the request body — this is
   * the privilege-escalation guard, enforced by `users.updateSelf()` only
   * having parameters for the two safe fields (see packages/auth/repositories.js).
   */
  r.patch('/api/profile', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    const body = await readJson(ctx.request);
    const displayName = v.str(body, 'display_name', { required: false, max: 120 });
    const walletXrpl = v.str(body, 'wallet_xrpl', { required: false, max: 64 });

    if (walletXrpl && !xrpl.isValidAddress(walletXrpl)) throw badRequest('Invalid XRPL address');

    await repos(db).users.updateSelf(ctx.session.user_id, { displayName, walletXrpl });
    await audit(ctx, ACTIONS.PROFILE_UPDATE, { entityType: 'user', entityId: ctx.session.user_id });
    const updated = await repos(db).users.byId(ctx.session.user_id);
    return json({ ok: true, profile: { display_name: updated.display_name, wallet_xrpl: updated.wallet_xrpl } });
  });

  /* ------------------------------------------------------------ contact -- */
  r.post('/api/contact', [requireTurnstile], async (ctx) => {
    const db = requireDb(ctx);
    const ip = clientIp(ctx.request);
    await enforce(ctx, 'publicForm', ip);

    const body = ctx.body;
    const id = await repos(db).contactInquiries.create({
      name: v.str(body, 'name', { max: 200 }),
      email: v.email(body),
      message: v.str(body, 'message', { max: 5000 }),
      inquiryType: v.str(body, 'inquiry_type', { required: false, max: 100 }),
      ip,
    });
    // Business audit FIRST: the inquiry is committed, so its record of
    // existence must not depend on a later notification attempt.
    await audit(ctx, ACTIONS.CONTACT_SUBMIT, { entityType: 'contact_inquiry', entityId: id });
    // Same notification as before, now fail-soft. The message body is
    // deliberately not included — it is in the inquiry record.
    await notifyOps(ctx, templates.adminSubmissionReceived({
      kind: 'contact inquiry',
      name: v.str(body, 'name', { max: 200 }),
      submittedOn: submittedOn(),
      reviewUrl: reviewUrl(ctx),
    }), { kind: 'contact_inquiry', entityType: 'contact_inquiry', entityId: id });
    return json({ ok: true, id }, { status: 201 });
  });

  /* ------------------------------------------------------ scroll requests -- */
  r.post('/api/scrolls/requests', [requireTurnstile], async (ctx) => {
    const db = requireDb(ctx);
    const ip = clientIp(ctx.request);
    await enforce(ctx, 'publicForm', ip);

    const body = ctx.body;
    const id = await repos(db).scrollRequests.create({
      name: v.str(body, 'name', { max: 200 }),
      email: v.email(body),
      requestType: v.str(body, 'request_type', { max: 100 }),
      message: v.str(body, 'message', { required: false, max: 5000 }),
      ip,
    });
    await audit(ctx, ACTIONS.SCROLL_REQUEST_SUBMIT, { entityType: 'scroll_request', entityId: id });
    // M13: scroll requests previously notified nobody at all. The request
    // TYPE is a short safe label and is useful for triage; the request
    // MESSAGE is not included — it stays in the record.
    await notifyOps(ctx, templates.adminSubmissionReceived({
      kind: 'scroll request',
      name: v.str(body, 'name', { max: 200 }),
      submittedOn: submittedOn(),
      reviewUrl: reviewUrl(ctx),
      detail: `Request type: ${v.str(body, 'request_type', { max: 100 })}`,
    }), { kind: 'scroll_request', entityType: 'scroll_request', entityId: id });
    return json({ ok: true, id }, { status: 201 });
  });

  /* ------------------------------------------------------------ scrolls -- */
  r.get('/api/scrolls', [], async (ctx) => {
    const db = requireDb(ctx);
    const items = await repos(db).scrolls.listPublic(v.pagination(ctx.url));
    return json({ items }, { private: false });
  });

  /** Public verification for both ordinations and scrolls, by slug. */
  r.get('/api/verify/:slug', [], async (ctx) => {
    const db = requireDb(ctx);
    const repo = repos(db);
    const slug = ctx.params.slug;
    // Volume/cost control only — the slug is unguessable, so this is not
    // brute-force protection. 60/min/IP leaves ordinary QR scanning (including
    // a whole room scanning one printed code from a single NAT'd IP) alone.
    await enforce(ctx, 'verifySlug', clientIp(ctx.request));

    const ordination = await repo.ordinations.byVerifySlug(slug);
    if (ordination) {
      /**
       * Q3 — the public name is application_json.fullName, the name the
       * applicant supplied for their credential. `users.display_name` is
       * deliberately NOT a fallback: showing the wrong name on a public
       * verification page is worse than showing none, so this FAILS CLOSED
       * into the same not-found response an unknown slug produces.
       */
      const application = fromJsonText(ordination.application_json);
      const fullName = typeof application?.fullName === 'string' ? application.fullName.trim() : '';
      if (!fullName) throw notFound('No record matches that verification code');

      const revoked = Boolean(ordination.revoked_at);
      return json({
        type: 'ordination',
        data: {
          // `verified` answers "is this credential good right now"; a revoked
          // credential resolves successfully but is NOT verified.
          verified: !revoked,
          credential_status: revoked ? 'revoked' : 'valid',
          full_name: fullName,
          credential_number: ordination.credential_number,
          designation: 'Ordained Minister',
          // The ORIGINAL ordination date. Never issued_at, which moves on
          // reissue (Q8) — a reissue is not a new ordination.
          date_of_ordination: ordination.approved_at,
          verify_slug: ordination.verify_slug,
          // The public may know THAT and WHEN, never WHY. `revocation_reason`
          // and `revoked_by` are not selected by the query and are not here.
          ...(revoked ? { revoked_at: ordination.revoked_at } : {}),
        },
      }, {
        // ORDINATION verification is never cached, VALID or REVOKED.
        // A 60-second edge cache would let a credential revoked moments ago
        // keep answering "valid" — revocation must take effect on the very
        // next scan. Scroll verification below keeps its existing caching;
        // scrolls have no revocation lifecycle.
        private: false,
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const scroll = await repo.scrolls.byVerifySlug(slug);
    if (scroll) {
      return json({
        type: 'scroll',
        // r2_key and visibility are deliberately not exposed publicly.
        data: {
          title: scroll.title,
          verify_slug: scroll.verify_slug,
          chain_tx_hash: scroll.chain_tx_hash,
          published_at: scroll.published_at,
        },
      }, { private: false });
    }
    throw notFound('No record matches that verification code');
  });

  /* --------------------------------------------------------- membership -- */
  /**
   * Only the fields the product actually needs are returned — not the full
   * row. `approved_by` (an internal admin user id), `application_json`, and
   * `user_id` are deliberately withheld as admin-only/internal.
   */
  r.get('/api/membership/mine', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    const m = await repos(db).memberships.byUser(ctx.session.user_id);
    if (!m) return json({ membership: null });
    return json({
      membership: {
        id: m.id,
        membership_type: m.membership_type,
        application_status: m.application_status,
        payment_status: m.payment_status,
        nft_token_id: m.nft_token_id,
        created_at: m.created_at,
        updated_at: m.updated_at,
      },
    });
  });

  /**
   * The membership application form (src/pages/MembershipApply.jsx) collects
   * exactly two fields. Only those two are ever read from the request body —
   * arbitrary client JSON never reaches storage; anything else the client
   * sends is silently dropped, not merged in.
   */
  function buildMembershipApplication(body) {
    const displayName = v.str(body, 'displayName', { max: 120 });
    const walletXrpl = v.str(body, 'walletXrpl', { required: false, max: 64 });
    if (walletXrpl && !xrpl.isValidAddress(walletXrpl)) throw badRequest('Invalid XRPL address');
    return { displayName, walletXrpl };
  }

  r.post('/api/membership/apply', [requireVerifiedEmail], async (ctx) => {
    const db = requireDb(ctx);
    const body = await readJson(ctx.request);
    const application = buildMembershipApplication(body);
    // Optional tier selection, same allow-list as /api/membership/join — not
    // part of application_json (it's its own column, not free-form content).
    const membershipType = v.oneOf(body, 'membership_type', ['free', 'paid'], { required: false });
    const repo = repos(db);

    const existing = await repo.memberships.byUser(ctx.session.user_id);
    if (existing && existing.application_status !== 'rejected') {
      throw conflict('A membership application is already on file');
    }

    // The same validated payload also updates the user's own profile fields
    // (matches the live product's apply-for-membership behavior).
    await repo.users.updateSelf(ctx.session.user_id, {
      displayName: application.displayName,
      walletXrpl: application.walletXrpl,
    });

    const applicationJson = JSON.stringify(application);
    let membershipId;
    if (existing) {
      // existing.application_status === 'rejected' here (checked above).
      // membership_type is intentionally left as originally chosen — resubmission
      // updates the application content, not the tier.
      await repo.memberships.resubmit(existing.id, { applicationJson });
      membershipId = existing.id;
    } else {
      membershipId = await repo.memberships.create({ userId: ctx.session.user_id, membershipType, applicationJson });
    }

    await audit(ctx, ACTIONS.MEMBERSHIP_APPLY, { entityType: 'membership', entityId: membershipId });
    // Applicant confirmation preserved, now fail-soft.
    await notifySubmitter(ctx, ctx.session.email, templates.applicationReceived('membership'),
      { kind: 'membership_confirmation', entityType: 'membership', entityId: membershipId });
    // M13: the ministry is now told an application arrived. Name, time and a
    // review link only — no application payload.
    await notifyOps(ctx, templates.adminSubmissionReceived({
      kind: 'membership application',
      name: application.displayName,
      submittedOn: submittedOn(),
      reviewUrl: reviewUrl(ctx),
    }), { kind: 'membership_application', entityType: 'membership', entityId: membershipId });
    return json({ ok: true, membership_id: membershipId }, { status: 201 });
  });

  /** Alias kept so the existing `join-membership` flow maps 1:1. */
  r.post('/api/membership/join', [requireVerifiedEmail], async (ctx) => {
    const db = requireDb(ctx);
    const body = await readJson(ctx.request);
    const membershipType = v.oneOf(body, 'membership_type', ['free', 'paid'], { required: false });
    const repo = repos(db);

    const existing = await repo.memberships.byUser(ctx.session.user_id);
    if (existing) return json({ ok: true, membership: existing, already_exists: true });

    const id = await repo.memberships.create({ userId: ctx.session.user_id, membershipType });
    await audit(ctx, ACTIONS.MEMBERSHIP_APPLY, { entityType: 'membership', entityId: id });
    return json({ ok: true, membership_id: id }, { status: 201 });
  });

  /* --------------------------------------------------------- ordination -- */
  /**
   * Only the fields the product actually needs are returned — not the full
   * row. `approved_by`, `application_json`, `credential_number`,
   * `revocation_reason` and the raw `credential_r2_key` are deliberately
   * withheld as admin-only/internal; credential availability is exposed only
   * as a boolean.
   *
   * M11 Phase 3: `credential_available` now means "issued and not revoked"
   * (see credentialAvailable), replacing the old `Boolean(credential_r2_key)`
   * — a test that could never be true, because nothing has ever written that
   * column. The field NAME and TYPE are unchanged, so no client contract
   * breaks; the flag simply becomes meaningful. Serving the credential itself
   * is Phase 5 and does not exist yet.
   */
  r.get('/api/ordination/mine', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    const items = await repos(db).ordinations.listByUser(ctx.session.user_id);
    return json({
      items: items.map((o) => ({
        id: o.id,
        status: o.status,
        verify_slug: o.verify_slug,
        credential_available: credentialAvailable(o),
        // M11 Phase 7 — the member's OWN credential number, so the dashboard
        // can show it, and a truthful revoked flag so the UI can distinguish
        // "revoked" from "not issued yet" instead of lumping both into
        // "unavailable". The private revocation REASON is still never exposed.
        credential_number: o.credential_number,
        credential_revoked: Boolean(o.revoked_at),
        created_at: o.created_at,
        updated_at: o.updated_at,
        approved_at: o.approved_at,
      })),
    });
  });

  /**
   * The ordination application form (src/pages/Ordination.jsx) collects
   * exactly three fields. Only those three are ever read from the request
   * body — arbitrary client JSON never reaches storage.
   */
  function buildOrdinationApplication(body) {
    return {
      fullName: v.str(body, 'fullName', { max: 200 }),
      reason: v.str(body, 'reason', { max: 5000 }),
      experience: v.str(body, 'experience', { required: false, max: 5000 }),
    };
  }

  r.post('/api/ordination/apply', [requireVerifiedEmail], async (ctx) => {
    const db = requireDb(ctx);
    const body = await readJson(ctx.request);
    const application = buildOrdinationApplication(body);
    const repo = repos(db);

    // Mirrors /api/membership/apply's dedupe/resubmit pattern: a pending or
    // approved application blocks a new one; a rejected one may be resubmitted.
    const existing = await repo.ordinations.byUser(ctx.session.user_id);
    if (existing && existing.status !== 'rejected') {
      throw conflict('An ordination application is already on file');
    }

    const applicationJson = JSON.stringify(application);
    let ordinationId;
    if (existing) {
      await repo.ordinations.resubmit(existing.id, { applicationJson });
      ordinationId = existing.id;
    } else {
      ordinationId = await repo.ordinations.create({ userId: ctx.session.user_id, applicationJson });
    }

    await audit(ctx, ACTIONS.ORDINATION_APPLY, { entityType: 'ordination', entityId: ordinationId });
    // Applicant confirmation preserved, now fail-soft.
    await notifySubmitter(ctx, ctx.session.email, templates.applicationReceived('ordination'),
      { kind: 'ordination_confirmation', entityType: 'ordination', entityId: ordinationId });
    // M13: THE gap that blocked the first real ordination — nobody was told an
    // application had arrived. Carries the applicant's name, the time, and a
    // link to the review surface. The `reason` and `experience` narrative is
    // deliberately NOT emailed: it is the applicant's private account of their
    // calling and belongs in the admin review screen, not an inbox.
    await notifyOps(ctx, templates.adminSubmissionReceived({
      kind: 'ordination application',
      name: application.fullName,
      submittedOn: submittedOn(),
      reviewUrl: reviewUrl(ctx),
    }), { kind: 'ordination_application', entityType: 'ordination', entityId: ordinationId });
    return json({ ok: true, ordination_id: ordinationId }, { status: 201 });
  });

  /**
   * The credential document itself (M11 Phase 5).
   *
   * Returns HTML — never JSON — and never a file: M11 stores no object, so
   * there is nothing in R2 to stream. The document is generated per request
   * from D1, which is what makes revocation instantaneous: a revoked
   * credential simply cannot be produced.
   *
   * DENIAL IS ALWAYS 404, following the convention already established in
   * worker/routes/files.js: a member must not be able to learn whether another
   * member's credential exists by comparing 403 against 404. Pending,
   * rejected, never-issued, revoked, and someone-else's all return the exact
   * same response.
   *
   * Path note: this cannot shadow /api/ordination/mine or /api/ordination/apply
   * — those are three-segment paths and this is four.
   */
  r.get('/api/ordination/:id/credential', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    const repo = repos(db);
    const ordination = await repo.ordinations.byId(ctx.params.id);

    // Ownership is bound to the server-resolved session, never to anything the
    // client supplied. Role is resolved exactly the way requireAdmin does it
    // (session claim, else the canonical users row) so there is only ever ONE
    // role system. Cloudflare Access fronts /api/admin/* rather than this
    // path, so it is deliberately not asserted here — see the phase report.
    const role = ctx.session.role ?? (await repo.users.byId(ctx.session.user_id))?.role;
    const isAdmin = role === 'admin';
    const isOwner = Boolean(ordination) && ordination.user_id === ctx.session.user_id;

    if (!ordination || (!isOwner && !isAdmin)) throw notFound('Credential not found');
    // issued_at IS NOT NULL AND revoked_at IS NULL — the single definition of
    // availability (docs/M11_CREDENTIAL_POLICY.md). Covers pending, rejected,
    // approved-but-unissued, and revoked in one check.
    if (!credentialAvailable(ordination)) throw notFound('Credential not found');

    // Never silently produce a malformed verification URL.
    const siteUrl = ctx.env.SITE_URL;
    if (!siteUrl) throw new HttpError(503, 'unavailable', 'SITE_URL is not configured');

    /**
     * Q3: the credential name is application_json.fullName and nothing else.
     * FAIL CLOSED — a credential bearing the wrong name is worse than no
     * credential, so `users.display_name` is deliberately NOT a fallback.
     */
    const application = fromJsonText(ordination.application_json);
    const fullName = typeof application?.fullName === 'string' ? application.fullName.trim() : '';
    if (!fullName) {
      throw new HttpError(
        500,
        'credential_incomplete',
        'This credential cannot be rendered because its application record is incomplete. Please contact the ministry.',
      );
    }

    // An explicit allow-list, not the database row: email, user_id,
    // approved_by, revoked_by, revocation_reason, the raw application_json,
    // credential_r2_key, nft_token_id and tx_hash never reach the renderer.
    const html = renderCredential({
      fullName,
      credentialNumber: ordination.credential_number,
      approvedAt: ordination.approved_at,
      issuedAt: ordination.issued_at,
      credentialVersion: ordination.credential_version,
      verifySlug: ordination.verify_slug,
      siteUrl,
    });

    // Only reached after authorization AND state gating succeeded, so the log
    // records real disclosures. Metadata carries identifiers only — never the
    // rendered document, the application JSON, or any revocation reason.
    await audit(ctx, ACTIONS.CREDENTIAL_VIEW, {
      entityType: 'ordination',
      entityId: ordination.id,
      metadata: {
        credential_number: ordination.credential_number,
        credential_version: ordination.credential_version,
        as_admin: isAdmin && !isOwner,
      },
    });

    return new Response(html, { status: 200, headers: CREDENTIAL_HEADERS });
  });

  /* ---------------------------------------------------------- donations -- */
  r.get('/api/donations/mine', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    const items = await repos(db).donations.listByUser(ctx.session.user_id, v.pagination(ctx.url));
    return json({ items });
  });

  /**
   * Create a Stripe PaymentIntent. Framework only — inert until
   * STRIPE_SECRET_KEY is configured (Phase 2D).
   */
  r.post('/api/donations/stripe/create-intent', [requireTurnstile], async (ctx) => {
    await enforce(ctx, 'payment', clientIp(ctx.request));
    const body = ctx.body;
    // $1 minimum, $100k ceiling — bounds the blast radius of a bad request.
    const amountCents = v.int(body, 'amount_cents', { min: 100, max: 10_000_000 });
    const currency = v.oneOf(body, 'currency', ['usd'], { required: false }) || 'usd';

    const intent = await stripe.createPaymentIntent(ctx, {
      amountCents,
      currency,
      metadata: { user_id: ctx.session?.user_id ?? '' },
      idempotencyKey: crypto.randomUUID(),
    });
    return json({ client_secret: intent.client_secret, id: intent.id }, { status: 201 });
  });

  /**
   * Hosted Stripe Checkout for one-off donations and recurring membership.
   * `mode=subscription` requires a real Stripe Price id — the ids currently in
   * the frontend (price_supporter_tier, …) are placeholders that exist in no
   * Stripe account, so they are rejected rather than silently failing later.
   */
  r.post('/api/donations/stripe/checkout', [requireTurnstile], async (ctx) => {
    await enforce(ctx, 'payment', clientIp(ctx.request));
    const body = ctx.body;
    const mode = v.oneOf(body, 'mode', ['payment', 'subscription'], { required: false }) || 'payment';
    const origin = ctx.env.SITE_URL || ctx.url.origin;

    let items;
    if (mode === 'subscription') {
      const price = v.str(body, 'price_id', { max: 120 });
      if (stripe.PLACEHOLDER_PRICE_IDS.includes(price)) {
        throw badRequest('This membership tier is not configured yet. Real Stripe Price ids are required.');
      }
      items = [{ price, quantity: 1 }];
    } else {
      items = [{ amountCents: v.int(body, 'amount_cents', { min: 100, max: 10_000_000 }), name: 'Donation' }];
    }

    // Reuse the caller's existing Stripe customer if they have one, so a
    // returning authenticated member doesn't accumulate a new Stripe customer
    // on every checkout. Never derived from anything the client sends.
    let customerId;
    if (ctx.session?.user_id) {
      const db = requireDb(ctx);
      const user = await repos(db).users.byId(ctx.session.user_id);
      customerId = user?.stripe_customer_id || undefined;
    }

    const session = await stripe.createCheckoutSession(ctx, {
      mode,
      items,
      successUrl: `${origin}/donate?checkout=success`,
      cancelUrl: `${origin}/donate?checkout=cancelled`,
      customerId,
      customerEmail: ctx.session?.email,
      // The only identifier propagated to Stripe: the server-resolved session
      // user id, or '' for an anonymous donor. The client never supplies this.
      metadata: { user_id: ctx.session?.user_id ?? '' },
      idempotencyKey: crypto.randomUUID(),
    });
    return json({ id: session.id, url: session.url }, { status: 201 });
  });

  /**
   * Stripe webhook. Signature-verified over the RAW body; must never be
   * behind Turnstile or session auth.
   *
   * Donation and subscription state are normalized and persisted
   * independently — a pure donation event never touches `subscriptions`, and
   * a pure subscription-lifecycle event never creates a `donations` row.
   * `invoice.paid` is the one event that legitimately does both: it is both a
   * receipt for that billing period AND the signal that the subscription is
   * current — that dual role is intentional, not accidental cross-talk.
   */
  r.post('/api/webhooks/stripe', [], async (ctx) => {
    const db = requireDb(ctx);
    const raw = await ctx.request.text();
    const event = await stripe.verifyWebhookSignature(ctx, raw, ctx.request.headers.get('Stripe-Signature'));
    const repo = repos(db);
    const result = { received: true };

    /* ---- donation side --------------------------------------------- */
    const donation = stripe.donationFromEvent(event);
    if (donation) {
      // Webhook-derived amount is authoritative; guard against a malformed
      // payload writing garbage rather than relying solely on the DB's
      // NOT NULL constraint to fail loudly after the fact.
      if (!Number.isInteger(donation.amountCents) || donation.amountCents < 0) {
        console.error('[stripe webhook] malformed amount, ignoring', event.id, event.type);
        result.donation = 'ignored_malformed';
      } else {
        const id = await repo.donations.recordIfNew(donation);
        if (id) await audit(ctx, ACTIONS.DONATION_RECORDED, { entityType: 'donation', entityId: id, metadata: { type: event.type } });
        result.donation = id ? 'recorded' : 'duplicate';
      }
    }

    /* ---- subscription side ------------------------------------------ */
    const subscriptionEvent = stripe.subscriptionEventFromEvent(event);
    if (subscriptionEvent) {
      const { stripeSubscriptionId, stripeCustomerId, status } = subscriptionEvent;
      let { userId } = subscriptionEvent;
      // invoice.payment_failed / customer.subscription.deleted carry no
      // metadata of their own — resolve the user from the subscription row
      // this same Stripe subscription already created.
      if (!userId) {
        const existingSub = await repo.subscriptions.byStripeSubscriptionId(stripeSubscriptionId);
        userId = existingSub?.user_id ?? null;
      }

      if (userId) {
        await repo.subscriptions.upsertFromWebhook({
          userId, stripeSubscriptionId, stripeCustomerId, status,
          currentPeriodEnd: subscriptionEvent.currentPeriodEnd ?? null,
        });
        // Keep the user's stripe_customer_id current for future checkout reuse.
        const user = await repo.users.byId(userId);
        if (user && user.stripe_customer_id !== stripeCustomerId) {
          await repo.users.setStripeCustomerId(userId, stripeCustomerId);
        }
        // Only a 'paid' membership's payment_status is ever touched, and only
        // from here — never by admin approval, never by a client request.
        await repo.memberships.setPaymentStatus(userId, status);
        result.subscription = 'synced';
      } else {
        console.error('[stripe webhook] subscription event with no resolvable user', event.id, stripeSubscriptionId);
        result.subscription = 'unresolved_user';
      }
    }

    if (!donation && !subscriptionEvent) result.ignored = event.type;
    return json(result);
  });

  /* ------------------------------------------------------- consultations -- */
  r.post('/api/consultations', [requireTurnstile], async (ctx) => {
    const db = requireDb(ctx);
    await enforce(ctx, 'publicForm', clientIp(ctx.request));
    const body = ctx.body;
    const id = await repos(db).consultations.create({
      userId: ctx.session?.user_id ?? null,
      name: v.str(body, 'name', { max: 200 }),
      email: v.email(body),
      topic: v.str(body, 'topic', { required: false, max: 500 }),
      requestedAt: v.str(body, 'requested_at', { required: false, max: 40 }),
    });
    const topic = v.str(body, 'topic', { required: false, max: 500 });
    await audit(ctx, ACTIONS.CONSULTATION_REQUEST, { entityType: 'consultation', entityId: id });
    // Requester confirmation preserved, now fail-soft.
    await notifySubmitter(ctx, v.email(body), templates.consultationRequested(topic),
      { kind: 'consultation_confirmation', entityType: 'consultation', entityId: id });
    await notifyOps(ctx, templates.adminSubmissionReceived({
      kind: 'consultation request',
      name: v.str(body, 'name', { max: 200 }),
      submittedOn: submittedOn(),
      reviewUrl: reviewUrl(ctx),
    }), { kind: 'consultation', entityType: 'consultation', entityId: id });
    return json({ ok: true, id }, { status: 201 });
  });

  r.get('/api/consultations/mine', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).consultations.listByUser(ctx.session.user_id) });
  });

  /* ---------------------------------------------------------- ministers -- */
  // Served from D1 only after the Firebase directory is migrated (later phase).
  r.get('/api/ministers', [], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).ministers.listPublished(v.pagination(ctx.url)) }, { private: false });
  });

  r.get('/api/ministers/:id', [], async (ctx) => {
    const db = requireDb(ctx);
    const minister = await repos(db).ministers.byId(ctx.params.id);
    if (!minister) throw notFound('Minister not found');
    return json(minister, { private: false });
  });

  /* --------------------------------------------------------- xrpl (read) -- */
  r.get('/api/xrpl/config', [], (ctx) =>
    json({ ...xrpl.config(ctx), trustline_url: xrpl.trustlineUrl(ctx) }, { private: false }));

  return r;
}

export { fromJsonText };
