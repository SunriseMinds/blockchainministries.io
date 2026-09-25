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
import { TIER_KEYS, ONE_TIME, resolveTier, resolvePayPalTier, givingConfig } from '../config/tiers.js';
import { OPERATIONS, validateRequestId, keyFor } from '../payments/idempotency.js';
import {
  donationConfig, explorerTxUrl, isValidTxHash,
  XRP_MIN_DROPS, XRP_MAX_DROPS, INTENT_TTL_MS,
} from '../config/xrpl.js';
import {
  xrpToDrops, dropsToXrp, reserveIntent, paymentUri,
  inspectTransaction, recordLedgerReceipt, VERIFY,
} from '../payments/xrplDonations.js';
import { lookupTransaction } from '@reellink/xrpl/client.js';
import { paypalConfig, paypalAvailable, requireWebhookId } from '../config/paypal.js';
import { stripePublicConfig } from '../config/stripe.js';
import * as paypal from '../payments/paypal.js';

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

/**
 * M14.1 — money for a human, from webhook-derived minor units only.
 * Never from anything a client sent.
 */
function formatMoney(amountCents, currency) {
  const major = (Number(amountCents) / 100).toFixed(2);
  return `${major} ${String(currency || 'usd').toUpperCase()}`;
}

/** Plain-language label for the Stripe event that produced a donation row. */
function donationKind(eventType) {
  if (eventType === 'invoice.paid') return 'monthly support payment';
  return 'one-time gift';
}

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
   * M14.1 — what the public Donate page is allowed to know about giving.
   *
   * The page renders from THIS, not from a mirrored copy of the catalogue, so
   * it cannot advertise a tier the server would refuse. No Stripe Price id is
   * exposed: the browser has no use for one and must never send one.
   */
  r.get('/api/donations/config', [], async (ctx) => {
    const cfg = givingConfig(ctx.env);
    // M14.4 — XRP is offered only when the rail is genuinely configured, and
    // the page is told plainly which network it is on so it can say so.
    let xrp = { available: false };
    try {
      const x = donationConfig(ctx.env);
      xrp = {
        available: true,
        network: x.network,
        live: x.live,
        address: x.address,
        min_drops: String(XRP_MIN_DROPS),
        max_drops: String(XRP_MAX_DROPS),
        suggested_xrp: ['5', '25', '100', '500'],
      };
    } catch { /* not configured: the page simply does not offer XRP */ }

    // M14.5 — only the PUBLIC client id is ever exposed. The secret, the
    // webhook id and every access token stay server-side.
    let paypalCfg = { available: false };
    if (paypalAvailable(ctx.env)) {
      const p = paypalConfig(ctx.env);
      paypalCfg = {
        available: true,
        environment: p.environment,
        live: p.live,
        client_id: p.clientId,
        // M14.5B — recurring is now IMPLEMENTED, so this is no longer a
        // hard-coded false. It is derived from the same catalogue the server
        // charges against: true only once at least one tier has a real PayPal
        // Plan id. The UI therefore cannot offer a tier the server refuses.
        recurring_available: TIER_KEYS.some((key) => resolvePayPalTier(key, ctx.env) !== null),
      };
    }
    // Post-M14 — Stripe gets the same authoritative, server-derived flag the
    // other two rails already had. `one_time.available` describes the
    // CATALOGUE (one-off giving needs no pre-created Price); `stripe.available`
    // describes the PROVIDER. The browser must consult the second before
    // offering checkout — see worker/config/stripe.js.
    return json({ ...cfg, stripe: stripePublicConfig(ctx.env), xrp, paypal: paypalCfg });
  });

  /**
   * M14.5 — create a PayPal order for a one-time gift.
   *
   * The browser asks for an amount; the SERVER decides it, validates it
   * against the same fiat policy Stripe uses, and is the only party that ever
   * states an amount to PayPal. Identity comes from the session and is
   * carried in `custom_id`, never accepted from the client.
   */
  r.post('/api/donations/paypal/orders', [requireTurnstile], async (ctx) => {
    await enforce(ctx, 'payment', clientIp(ctx.request));
    const cfg = paypalConfig(ctx.env);
    const body = ctx.body;
    const requestId = validateRequestId(body);
    const amountCents = v.int(body, 'amount_cents', { min: ONE_TIME.minCents, max: ONE_TIME.maxCents });
    // Currency is not negotiable from the browser.
    const origin = ctx.env.SITE_URL || ctx.url.origin;

    const order = await paypal.createOrder(cfg, {
      amountCents,
      currency: 'USD',
      userId: ctx.session?.user_id ?? '',
      requestId: keyFor(OPERATIONS.ONE_TIME, ctx.session?.user_id ?? null, requestId),
      returnUrl: `${origin}/donate?checkout=success`,
      cancelUrl: `${origin}/donate?checkout=cancelled`,
    });

    // Only what the browser needs to drive the approval UX.
    return json({ id: order.id, status: order.status }, { status: 201 });
  });

  /**
   * M14.5 — capture an approved order, server-side.
   *
   * The browser supplies only the order id it was given. It does NOT decide
   * the amount, the currency, the user, the status, or whether a donation row
   * exists: the WEBHOOK is authoritative for persistence. This endpoint moves
   * money and reports what PayPal said; it deliberately writes no donation.
   */
  r.post('/api/donations/paypal/orders/:id/capture', [requireTurnstile], async (ctx) => {
    await enforce(ctx, 'payment', clientIp(ctx.request));
    const cfg = paypalConfig(ctx.env);
    const orderId = String(ctx.params.id || '');
    if (!/^[A-Za-z0-9-]{5,64}$/.test(orderId)) throw badRequest('Invalid order');

    const captured = await paypal.captureOrder(cfg, orderId);
    const capture = captured?.purchase_units?.[0]?.payments?.captures?.[0] ?? null;

    // Reported, never persisted here. `onApprove` in a browser is not proof
    // that money arrived; the signed webhook is.
    return json({
      status: captured?.status ?? 'UNKNOWN',
      capture_status: capture?.status ?? null,
    });
  });

  /**
   * M14.5B — start a monthly PayPal subscription.
   *
   * REQUIRES AUTHENTICATION, consistent with Stripe: recurring support is
   * linked to an account so it can be managed later, and an anonymous
   * recurring commitment has nobody to manage it.
   *
   * The browser sends a semantic TIER and nothing else that matters. The Plan
   * id, the price, the currency and the subscriber identity are all resolved
   * server-side; none of them can be supplied from outside.
   *
   * NOTHING IS PERSISTED HERE. PayPal returns APPROVAL_PENDING, which is not
   * a subscription — only a verified BILLING.SUBSCRIPTION.ACTIVATED webhook
   * creates the row.
   */
  r.post('/api/donations/paypal/subscriptions', [requireAuth, requireTurnstile], async (ctx) => {
    await enforce(ctx, 'payment', clientIp(ctx.request));
    const cfg = paypalConfig(ctx.env);
    const requestId = validateRequestId(ctx.body);
    // Fails closed on an unknown tier AND on a tier whose Plan id is still a
    // placeholder. A PayPal Plan id cannot travel inbound at all.
    const tier = resolvePayPalTier(v.str(ctx.body, 'tier', { max: 40 }), ctx.env);
    if (!tier) throw badRequest('That monthly level is not open yet');

    const origin = ctx.env.SITE_URL || ctx.url.origin;
    const subscription = await paypal.createSubscription(cfg, {
      planId: tier.paypalPlanId,
      userId: ctx.session.user_id,
      requestId: keyFor(OPERATIONS.TIER, ctx.session.user_id, requestId),
      returnUrl: `${origin}/donate?checkout=success`,
      cancelUrl: `${origin}/donate?checkout=cancelled`,
    });

    // Only what the approval UX needs. The status is PayPal's own word for
    // it — deliberately not translated into anything that sounds active.
    return json({
      id: subscription.id,
      status: subscription.status ?? 'APPROVAL_PENDING',
      approval_url: paypal.approvalUrlFrom(subscription),
    }, { status: 201 });
  });

  /**
   * M14.4 — reserve a destination tag for an intended XRP gift.
   *
   * Returns only public payment-request data. The tag is how an incoming
   * ledger payment is later attributed to this donor; identity comes from the
   * session here and is never accepted from the client.
   */
  r.post('/api/donations/xrpl/intents', [requireTurnstile], async (ctx) => {
    await enforce(ctx, 'payment', clientIp(ctx.request));
    const db = requireDb(ctx);
    const cfg = donationConfig(ctx.env);
    const drops = xrpToDrops(v.str(ctx.body, 'amount_xrp', { max: 32 }));

    const expiresAt = new Date(Date.now() + INTENT_TTL_MS).toISOString();
    const { id, destinationTag } = await reserveIntent(repos(db), {
      userId: ctx.session?.user_id ?? null,
      expectedAmountDrops: Number(drops),
      expiresAt,
    });

    return json({
      intent_id: id,
      network: cfg.network,
      live: cfg.live,
      address: cfg.address,
      destination_tag: destinationTag,
      amount_xrp: dropsToXrp(drops),
      amount_drops: String(drops),
      payment_uri: paymentUri({ address: cfg.address, destinationTag, amountDrops: String(drops) }),
      expires_at: expiresAt,
    }, { status: 201 });
  });

  /**
   * M14.4 — the donor-submitted transaction hash fast path.
   *
   * This does NOT confirm anything by itself: it asks the ledger, and the
   * ledger answers. Identical verification and persistence to the scheduled
   * sweep, so the two converge on one donation row.
   */
  r.post('/api/donations/xrpl/verify', [requireTurnstile], async (ctx) => {
    await enforce(ctx, 'payment', clientIp(ctx.request));
    const db = requireDb(ctx);
    const cfg = donationConfig(ctx.env);

    const hash = String(v.str(ctx.body, 'tx_hash', { max: 64 })).trim().toUpperCase();
    if (!isValidTxHash(hash)) throw badRequest('That does not look like an XRP Ledger transaction hash');

    let tx;
    try {
      tx = await lookupTransaction(cfg.rpcUrl, hash);
    } catch {
      // A node problem is not a payment problem. The sweep will find it.
      return json({ outcome: VERIFY.TEMPORARILY_UNAVAILABLE });
    }

    const verified = inspectTransaction(tx, cfg);
    if (!verified.ok) return json({ outcome: verified.outcome });

    const repo = repos(db);
    const existing = await repo.donations.byProviderEventId(verified.hash);
    const result = await recordLedgerReceipt(repo, cfg, verified);

    if (result.recorded) {
      await audit(ctx, ACTIONS.DONATION_RECORDED, {
        entityType: 'donation', entityId: result.donationId, metadata: { type: 'xrpl.payment' },
      });
      await notifyOps(ctx, templates.adminDonationRecorded({
        kind: 'XRP gift',
        amount: `${dropsToXrp(verified.drops)} XRP`,
        donor: result.attributedTo ? 'a signed-in member' : 'an anonymous donor',
        recordedOn: submittedOn(),
        reviewUrl: reviewUrl(ctx),
      }), { kind: 'donation_recorded', entityType: 'donation', entityId: result.donationId });
    }

    return json({
      outcome: existing || !result.recorded ? VERIFY.ALREADY_RECORDED : VERIFY.CONFIRMED,
      amount_xrp: dropsToXrp(verified.drops),
      reference_url: explorerTxUrl(cfg, verified.hash),
    });
  });

  /**
   * Hosted Stripe Checkout — one-off gifts and monthly support tiers.
   *
   * M14.1 closed two holes here:
   *
   *   HIGH-1  The route used to forward ANY caller-supplied `price_id` that
   *           merely wasn't a known placeholder, so once a live key existed a
   *           crafted request could subscribe against any Price in the Stripe
   *           account. The wire contract is now a TIER KEY resolved against
   *           the server's own closed catalogue; a Stripe Price id cannot be
   *           named from outside at all.
   *
   *   HIGH-2  `crypto.randomUUID()` per call meant a retry created a SECOND
   *           Session. The key is now derived from the caller's per-action
   *           `request_id` plus server-known identity — see
   *           ../payments/idempotency.js.
   */
  r.post('/api/donations/stripe/checkout', [requireTurnstile], async (ctx) => {
    await enforce(ctx, 'payment', clientIp(ctx.request));
    const body = ctx.body;
    const mode = v.oneOf(body, 'mode', ['payment', 'subscription'], { required: false }) || 'payment';
    const origin = ctx.env.SITE_URL || ctx.url.origin;
    const requestId = validateRequestId(body);

    let items;
    let operation;
    if (mode === 'subscription') {
      // M14.5B ratified that recurring monthly support requires
      // authentication, consistently across rails — the PayPal route enforces
      // it with [requireAuth]. This is the Stripe half, which was missing.
      //
      // It is not cosmetic symmetry: an anonymous subscription Checkout
      // carries no `metadata.user_id`, so `checkout.session.completed`
      // resolves no user, the webhook persists nothing, and a paying
      // subscriber is orphaned — real money with no membership link and no
      // subscription row. The guard cannot live in route middleware because
      // one-time giving on this same route is deliberately anonymous.
      if (!ctx.session?.user_id) {
        throw new HttpError(401, 'unauthorized', 'Please sign in to set up monthly support');
      }
      // Closed vocabulary, not a string that resembles a Stripe id.
      const tier = resolveTier(v.oneOf(body, 'tier', TIER_KEYS));
      if (!tier) {
        throw badRequest('This support tier is not available yet.');
      }
      operation = OPERATIONS.TIER;
      items = [{ price: tier.priceId, quantity: 1 }];
    } else {
      operation = OPERATIONS.ONE_TIME;
      items = [{
        amountCents: v.int(body, 'amount_cents', { min: ONE_TIME.minCents, max: ONE_TIME.maxCents }),
        currency: ONE_TIME.currency,
        name: 'Donation',
      }];
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
      idempotencyKey: keyFor(operation, ctx.session?.user_id ?? null, requestId),
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
        // M14.3 — `donationFromEvent` is the STRIPE adapter and keeps Stripe's
        // own vocabulary; the store is provider-neutral. Mapping here, rather
        // than renaming inside the shared package, keeps each honest: Stripe
        // calls it an event id, the ledger will call it a transaction hash,
        // and the column that holds both is `provider_event_id`.
        const id = await repo.donations.recordIfNew({
          provider: donation.provider,
          providerEventId: donation.stripeEventId,
          providerTxnId: donation.providerChargeId,
          amountCents: donation.amountCents,
          currency: donation.currency,
          status: donation.status,
          referenceUrl: donation.receiptUrl,
          userId: donation.userId,
        });
        if (id) {
          await audit(ctx, ACTIONS.DONATION_RECORDED, { entityType: 'donation', entityId: id, metadata: { type: event.type } });
          // M14.1 — announce ONLY a genuinely new row, and only after it is
          // committed and audited. safeNotify absorbs every failure mode, so
          // a dead mail provider can never make Stripe retry a webhook that
          // already persisted: the business result above is final either way.
          await notifyOps(ctx, templates.adminDonationRecorded({
            kind: donationKind(event.type),
            amount: formatMoney(donation.amountCents, donation.currency),
            donor: donation.userId ? 'a signed-in member' : 'an anonymous donor',
            recordedOn: submittedOn(),
            reviewUrl: reviewUrl(ctx),
          }), { kind: 'donation_recorded', entityType: 'donation', entityId: id });
        }
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
        const existingSub = await repo.subscriptions.byProviderSubscriptionId('stripe', stripeSubscriptionId);
        userId = existingSub?.user_id ?? null;
      }

      if (userId) {
        // M14.1/M14.2 — the store applies the ordering contract (see
        // upsertFromWebhook) and refuses anything that would regress real
        // state: a resurrected `cancelled`, an exact redelivery, an event
        // older than the last accepted one, an unresolvable timestamp tie, or
        // a period that predates the stored one.
        //
        // Stripe's own event id and created time are passed through so
        // ordering never depends on arrival order. Only these two identifiers
        // and a timestamp are persisted — no raw body, no billing details.
        // M14.5B — this adapter still speaks Stripe; it maps explicitly into
        // the provider-neutral store rather than making the store learn
        // Stripe's vocabulary.
        const outcome = await repo.subscriptions.upsertFromWebhook({
          provider: 'stripe',
          userId,
          providerSubscriptionId: stripeSubscriptionId,
          providerCustomerId: stripeCustomerId,
          status,
          currentPeriodEnd: subscriptionEvent.currentPeriodEnd ?? null,
          eventId: subscriptionEvent.stripeEventId ?? null,
          eventCreated: subscriptionEvent.eventCreated ?? null,
        });

        // Anything other than an accepted write means NOTHING happened —
        // membership payment_status included. That is the path by which a
        // stale event could otherwise downgrade a member who had paid.
        if (outcome !== 'inserted' && outcome !== 'updated') {
          console.warn('[stripe webhook] ignoring out-of-order subscription event', event.id, event.type, outcome);
          result.subscription = outcome;
        } else {
          // Keep the user's stripe_customer_id current for future checkout reuse.
          const user = await repo.users.byId(userId);
          if (user && user.stripe_customer_id !== stripeCustomerId) {
            await repo.users.setStripeCustomerId(userId, stripeCustomerId);
          }
          // Only a 'paid' membership's payment_status is ever touched, and only
          // from here — never by admin approval, never by a client request.
          await repo.memberships.setPaymentStatus(userId, status);
          result.subscription = 'synced';
        }
      } else {
        console.error('[stripe webhook] subscription event with no resolvable user', event.id, stripeSubscriptionId);
        result.subscription = 'unresolved_user';
      }
    }

    if (!donation && !subscriptionEvent) result.ignored = event.type;
    return json(result);
  });

  /**
   * M14.5 — the PayPal webhook. AUTHORITATIVE for durable persistence.
   *
   * Verified by postback to PayPal over the RAW body, and FAILS CLOSED: a
   * missing signature header, a missing webhook id, an unreachable verifier
   * or any answer other than SUCCESS all end here with 400 and no state
   * change whatsoever.
   *
   * Must never sit behind Turnstile or session auth.
   */
  r.post('/api/webhooks/paypal', [], async (ctx) => {
    const db = requireDb(ctx);
    const cfg = paypalConfig(ctx.env);
    requireWebhookId(cfg);

    const raw = await ctx.request.text();
    const ok = await paypal.verifyWebhook(cfg, raw, ctx.request.headers);
    if (!ok) throw badRequest('Webhook verification failed');

    let event;
    try { event = JSON.parse(raw); } catch { throw badRequest('Malformed webhook'); }
    // Valid JSON is not yet a PayPal event. An array, a scalar or an object
    // with no `id`/`event_type` cannot be one, and must be REJECTED rather
    // than acknowledged as "an event we ignore" — the two are different
    // answers and only one of them is true. An unrecognised but well-formed
    // event type is still acknowledged below, so PayPal stops retrying it.
    if (!event || typeof event !== 'object' || Array.isArray(event)
        || typeof event.id !== 'string' || typeof event.event_type !== 'string') {
      throw badRequest('Malformed webhook');
    }

    const repo = repos(db);

    /* ---- M14.5B: subscription lifecycle ------------------------------- */
    const lifecycle = paypal.subscriptionEventFromEvent(event);
    if (lifecycle) {
      // Identity comes from the STORED subscription whenever one exists — it
      // was written from an authenticated session. `custom_id` is only a
      // fallback for the very first event (ACTIVATED), where the server set
      // it itself at creation time and no row exists yet.
      const stored = await repo.subscriptions.byProviderSubscriptionId('paypal', lifecycle.providerSubscriptionId);
      const userId = stored?.user_id ?? lifecycle.userIdHint;
      if (!userId) {
        console.error('[paypal webhook] lifecycle event with no resolvable user', event.id, event.event_type);
        return json({ received: true, subscription: 'unresolved_user' });
      }

      const outcome = await repo.subscriptions.upsertFromWebhook({
        provider: 'paypal',
        userId,
        providerSubscriptionId: lifecycle.providerSubscriptionId,
        status: lifecycle.status,
        eventId: lifecycle.eventId,
        eventCreated: lifecycle.eventCreated,
      });

      // Anything other than an accepted write means NOTHING happened —
      // membership payment_status included. Identical to the Stripe path,
      // and it is the path by which a stale PayPal event could otherwise
      // downgrade a member who is current.
      if (outcome !== 'inserted' && outcome !== 'updated') {
        console.warn('[paypal webhook] ignoring out-of-order subscription event', event.id, event.event_type, outcome);
        return json({ received: true, subscription: outcome });
      }

      // Mapped into the EXISTING membership vocabulary; suspended/expired
      // have no column of their own and are not invented into one.
      const membershipStatus = paypal.membershipStatusFor(lifecycle.status);
      if (membershipStatus) await repo.memberships.setPaymentStatus(userId, membershipStatus);
      return json({ received: true, subscription: 'synced' });
    }

    /* ---- M14.5B: recurring payments ----------------------------------- */
    const recurring = paypal.recurringPaymentFromEvent(event);
    if (recurring) {
      if (recurring.kind === 'transition') {
        const moved = await repo.donations.transitionByProviderTxnId(recurring.targetTxnId, recurring.status, 'paypal');
        return json({ received: true, transition: moved ? recurring.status : 'no_matching_donation' });
      }

      // The subscription's OWN stored user is authoritative. A sale arriving
      // before its subscription row exists (PayPal documents that events may
      // arrive out of order) is still real money the ministry received, so it
      // is recorded UNATTRIBUTED rather than dropped — the same choice made
      // for an untagged XRPL payment.
      const sub = recurring.subscriptionId
        ? await repo.subscriptions.byProviderSubscriptionId('paypal', recurring.subscriptionId)
        : null;

      const recurringId = await repo.donations.recordIfNew({
        userId: sub?.user_id ?? null,
        provider: 'paypal',
        providerEventId: recurring.providerEventId,
        providerTxnId: recurring.providerTxnId,
        amountCents: recurring.amountCents,
        currency: recurring.currency,
        status: recurring.status,
      });

      if (recurringId) {
        await audit(ctx, ACTIONS.DONATION_RECORDED, {
          entityType: 'donation', entityId: recurringId, metadata: { type: event.event_type },
        });
        // Announced only for money genuinely received and genuinely new —
        // never for a subscription merely being created, approved or
        // activated, none of which is a payment.
        await notifyOps(ctx, templates.adminDonationRecorded({
          kind: 'PayPal monthly support',
          amount: formatMoney(recurring.amountCents, recurring.currency),
          donor: sub?.user_id ? 'a signed-in member' : 'an anonymous donor',
          recordedOn: submittedOn(),
          reviewUrl: reviewUrl(ctx),
        }), { kind: 'donation_recorded', entityType: 'donation', entityId: recurringId });
      }
      return json({ received: true, donation: recurringId ? 'recorded' : 'duplicate' });
    }

    const mapped = paypal.donationFromEvent(event);
    if (!mapped) return json({ received: true, ignored: event.event_type ?? 'unknown' });

    // A refund or reversal is NEWS ABOUT an existing gift, not a new one.
    // Inserting on its own event id would manufacture a phantom donation.
    if (mapped.kind === 'transition') {
      const moved = await repo.donations.transitionByProviderTxnId(mapped.targetTxnId, mapped.status, 'paypal');
      return json({ received: true, transition: moved ? mapped.status : 'no_matching_donation' });
    }

    const id = await repo.donations.recordIfNew({
      userId: mapped.userId,
      provider: 'paypal',
      providerEventId: mapped.providerEventId,
      providerTxnId: mapped.providerTxnId,
      amountCents: mapped.amountCents,
      currency: mapped.currency,
      status: mapped.status,
    });

    if (id) {
      await audit(ctx, ACTIONS.DONATION_RECORDED, {
        entityType: 'donation', entityId: id, metadata: { type: event.event_type },
      });
      // Only a genuinely COMPLETED gift is announced. A pending or declined
      // capture is recorded for the ledger but is not good news to send.
      if (mapped.status === 'completed') {
        await notifyOps(ctx, templates.adminDonationRecorded({
          kind: 'PayPal gift',
          amount: formatMoney(mapped.amountCents, mapped.currency),
          donor: mapped.userId ? 'a signed-in member' : 'an anonymous donor',
          recordedOn: submittedOn(),
          reviewUrl: reviewUrl(ctx),
        }), { kind: 'donation_recorded', entityType: 'donation', entityId: id });
      }
    }
    return json({ received: true, donation: id ? 'recorded' : 'duplicate' });
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
  // Served from D1. The directory starts empty; entries are added by admins
  // directly in D1 — there is no Firestore import or migration.
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
