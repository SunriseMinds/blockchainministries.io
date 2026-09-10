/**
 * /api/admin — administrator routes.
 *
 * Two layers of protection:
 *   1. Cloudflare Access in front of /api/admin/* (dashboard configuration).
 *   2. requireAdmin here, which re-checks users.role in D1 regardless.
 */
import { json, readJson, notFound, conflict, badRequest } from '@reellink/core/http.js';
import { requireDb } from '@reellink/database/d1.js';
import { repos } from '../db/repositories.js';
import * as val from '@reellink/core/validate.js';
import { audit } from '@reellink/security/audit.js';
import { ACTIONS } from '../config/actions.js';
import { send, templates } from '../email/templates.js';
import { requireAdmin } from '@reellink/auth/middleware.js';
import { generateVerifySlug } from '../credential/slug.js';
import * as xrpl from '@reellink/xrpl/client.js';

// Both memberships.application_status and ordinations.status share this set.
const APPLICATION_STATUSES = ['pending', 'approved', 'rejected'];

export function mount(r) {
  /* -------------------------------------------------------------- lists -- */
  /**
   * Kept at the old path so the (not-yet-cut-over) frontend doesn't need a
   * simultaneous change — internally this now queries `users` directly,
   * there is no `profiles` table. Compatibility alias, not a new feature;
   * safe to rename to /api/admin/users whenever the frontend cutover happens.
   */
  r.get('/api/admin/profiles', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).users.list(val.pagination(ctx.url)) });
  });

  r.get('/api/admin/donations', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).donations.list(val.pagination(ctx.url)) });
  });

  r.get('/api/admin/scrolls', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).scrolls.listAll(val.pagination(ctx.url)) });
  });

  r.get('/api/admin/contact-inquiries', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).contactInquiries.list(val.pagination(ctx.url)) });
  });

  r.get('/api/admin/scroll-requests', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).scrollRequests.list(val.pagination(ctx.url)) });
  });

  r.get('/api/admin/consultations', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).consultations.list(val.pagination(ctx.url)) });
  });

  r.get('/api/admin/audit-logs', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).auditLogs.list(val.pagination(ctx.url)) });
  });

  /**
   * Filters memberships by application_status; `status=all` (the M10.1 admin
   * overview) skips the filter entirely instead of picking one status.
   * payment_status has no filter yet — no route sets or reads it.
   */
  r.get('/api/admin/memberships', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const status = ctx.url.searchParams.get('status') || 'pending';
    if (status === 'all') return json({ items: await repos(db).memberships.listAll(val.pagination(ctx.url)) });
    if (!APPLICATION_STATUSES.includes(status)) throw badRequest('Invalid status filter');
    return json({ items: await repos(db).memberships.listByStatus(status, val.pagination(ctx.url)) });
  });

  r.get('/api/admin/ordinations', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const status = ctx.url.searchParams.get('status') || 'pending';
    if (status === 'all') return json({ items: await repos(db).ordinations.listAll(val.pagination(ctx.url)) });
    if (!APPLICATION_STATUSES.includes(status)) throw badRequest('Invalid status filter');
    return json({ items: await repos(db).ordinations.listByStatus(status, val.pagination(ctx.url)) });
  });

  /**
   * XRPL signer diagnostics. Reports the derived signing address and gate
   * state so an operator can confirm the correct wallet is configured.
   * NEVER returns the seed, and performs no transaction.
   */
  r.get('/api/admin/xrpl/status', [requireAdmin], async (ctx) => {
    const signer = await import('@reellink/xrpl/signer.js');
    const enabled = signer.signingEnabled(ctx.env);
    const out = {
      signing_enabled: enabled,
      network: signer.network(ctx.env),
      rpc: signer.rpcUrl(ctx.env),
      mainnet_allowed: ctx.env.XRPL_ALLOW_MAINNET === 'true',
      issuer_configured: Boolean(ctx.env.XRPL_ISSUER_ADDRESS),
    };
    if (enabled) {
      // Derivation is pure computation — proves the keypair libraries run
      // here without contacting the network.
      try {
        out.signer_address = signer.signerAddress(ctx.env);
      } catch (e) {
        out.signer_error = e?.message?.slice(0, 200);
      }
    }
    return json(out);
  });

  /* ------------------------------------------------ membership decisions -- */
  r.post('/api/admin/memberships/:id/approve', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const repo = repos(db);
    const membership = await repo.memberships.byId(ctx.params.id);
    if (!membership) throw notFound('Membership not found');

    // Idempotency gate: the status transition happens FIRST and only once.
    // A retry changes 0 rows, so no side effect (minting, email) repeats.
    const transitioned = await repo.memberships.approve(ctx.params.id, {
      approvedBy: ctx.session.user_id,
    });
    if (!transitioned) throw conflict(`Membership is already ${membership.application_status}`);

    // XRPL minting is intentionally NOT performed: signing has not been
    // migrated (see @reellink/xrpl). Recorded for follow-up.
    const minting = xrpl.signingAvailable(ctx) ? 'available_but_disabled' : 'not_configured';

    const user = await repo.users.byId(membership.user_id);
    if (user) await send(ctx, { to: user.email, ...templates.applicationApproved('membership') });

    await audit(ctx, ACTIONS.MEMBERSHIP_APPROVE, {
      entityType: 'membership', entityId: ctx.params.id, metadata: { minting },
    });
    return json({ ok: true, membership_id: ctx.params.id, xrpl_minting: minting });
  });

  r.post('/api/admin/memberships/:id/reject', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const repo = repos(db);
    const membership = await repo.memberships.byId(ctx.params.id);
    const ok = await repo.memberships.reject(ctx.params.id, { approvedBy: ctx.session.user_id });
    if (!ok) throw conflict('Membership is not pending');
    if (membership) {
      const user = await repo.users.byId(membership.user_id);
      if (user) await send(ctx, { to: user.email, ...templates.applicationRejected('membership') });
    }
    await audit(ctx, ACTIONS.MEMBERSHIP_REJECT, { entityType: 'membership', entityId: ctx.params.id });
    return json({ ok: true });
  });

  /* ------------------------------------------------ ordination decisions -- */
  r.post('/api/admin/ordinations/:id/approve', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const repo = repos(db);
    const ordination = await repo.ordinations.byId(ctx.params.id);
    if (!ordination) throw notFound('Ordination not found');

    // Slug is generated once and preserved thereafter (public URL contract).
    //
    // M11: generated as lowercase alphanumerics only. The previous
    // `randomToken(12).toLowerCase()` produced base64url, which could begin
    // with `-` or `_` - and a real phone scan showed a leading hyphen being
    // stripped by URL auto-detection, truncating /verify/<slug> to /verify/.
    // See worker/credential/slug.js. Existing slugs are never regenerated.
    const verifySlug = ordination.verify_slug || generateVerifySlug();

    const transitioned = await repo.ordinations.approve(ctx.params.id, {
      approvedBy: ctx.session.user_id,
      verifySlug,
      credentialR2Key: ordination.credential_r2_key ?? null,
    });
    if (!transitioned) throw conflict(`Ordination is already ${ordination.status}`);

    // Mint only AFTER the transition succeeded. Because the transition changes
    // 0 rows on a retry, this can never run twice for the same ordination.
    let minting = { status: 'not_configured' };
    if (xrpl.signingAvailable(ctx)) {
      try {
        const uri = `${ctx.env.SITE_URL || ctx.url.origin}/verify/${verifySlug}`;
        const res = await xrpl.mintNft(ctx, { uri });
        minting = { status: res.accepted ? 'submitted' : 'rejected', hash: res.hash, engine_result: res.engine_result, network: res.network };
        if (res.hash) await repo.ordinations.approve(ctx.params.id, { approvedBy: ctx.session.user_id, verifySlug, txHash: res.hash });
      } catch (e) {
        // A minting failure must not roll back the approval; it is recorded
        // for follow-up so an operator can retry the mint deliberately.
        minting = { status: 'error', message: e?.message?.slice(0, 200) };
        console.error('[xrpl] mint failed', e?.message);
      }
    }

    // Re-read so the email and audit carry the credential this approval just
    // issued (approve() returns only whether it transitioned).
    const issued = await repo.ordinations.byId(ctx.params.id);

    await audit(ctx, ACTIONS.ORDINATION_APPROVE, {
      entityType: 'ordination',
      entityId: ctx.params.id,
      metadata: {
        verify_slug: verifySlug,
        minting,
        credential_number: issued?.credential_number ?? null,
        credential_version: issued?.credential_version ?? null,
      },
    });

    // Notification comes AFTER the authoritative state change and its audit,
    // and can never undo them — same semantics as revoke/reissue. An approval
    // stands whether or not Resend is reachable.
    const user = await repo.users.byId(ordination.user_id);
    const origin = ctx.env.SITE_URL || ctx.url.origin;
    const notification = await notifyMember(
      ctx,
      user,
      templates.credentialIssued({
        credentialNumber: issued?.credential_number,
        // approved_at — the ordination date. Never issued_at.
        dateOfOrdination: emailDate(issued?.approved_at),
        dashboardUrl: `${origin}/dashboard`,
        verifyUrl: `${origin}/verify/${verifySlug}`,
      }),
      { ordinationId: ctx.params.id },
    );

    return json({
      ok: true,
      ordination_id: ctx.params.id,
      verify_slug: verifySlug,
      credential_number: issued?.credential_number ?? null,
      xrpl_minting: minting,
      notification,
    });
  });

  /* ------------------------------------------------ credential lifecycle -- */
  /**
   * Best-effort member notification after an AUTHORITATIVE state change.
   *
   * The state transition has already committed by the time this runs. Email is
   * never allowed to undo it: a Resend outage must not leave a revoked
   * credential valid. Every failure mode — a provider error response, a thrown
   * transport/config error — is caught, audited, and reported in the response
   * so an operator can follow up, while the credential state stands.
   *
   * @returns {Promise<'sent'|'failed'>}
   */
  async function notifyMember(ctx, user, message, { ordinationId }) {
    if (!user) return 'failed';
    let sent = false;
    try {
      const result = await send(ctx, { to: user.email, ...message });
      sent = Boolean(result?.sent);
    } catch (e) {
      console.error('[credential] notification threw', e?.message);
      sent = false;
    }
    if (!sent) {
      await audit(ctx, ACTIONS.CREDENTIAL_NOTIFY_FAILED, {
        entityType: 'ordination', entityId: ordinationId,
      });
    }
    return sent ? 'sent' : 'failed';
  }

  /** Human-readable date for email copy. UTC, locale-independent. */
  function emailDate(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? String(iso) : d.toISOString().slice(0, 10);
  }

  /**
   * Revoke an issued credential (M11 Q6). Admin-only via requireAdmin, which
   * re-checks users.role in D1 and enforces the Cloudflare Access assertion
   * wherever REQUIRE_CF_ACCESS is configured.
   *
   * The client supplies ONLY a reason. `revoked_by` comes from the admin's own
   * session and `revoked_at` from server time — neither is ever read from the
   * request body, and nor are credential_number, verify_slug or user_id.
   */
  r.post('/api/admin/ordinations/:id/revoke', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const repo = repos(db);
    const body = await readJson(ctx.request);
    // Required, trimmed, blank rejected, bounded. readJson caps the payload at
    // 64KB before this, so an enormous body never reaches validation.
    const reason = val.str(body, 'reason', { max: 1000 });

    const now = new Date().toISOString();
    const result = await repo.ordinations.revoke(ctx.params.id, {
      revokedBy: ctx.session.user_id,
      reason,
      now,
    });

    if (!result.ok) {
      if (result.outcome === 'not_found') throw notFound('Ordination not found');
      if (result.outcome === 'already_revoked') throw conflict('This credential is already revoked');
      throw conflict('This ordination has no issued credential to revoke');
    }

    const ordination = await repo.ordinations.byId(ctx.params.id);

    // Audit the transition FIRST, so it is recorded even if notification dies.
    // The private reason lives here and only here: audit_logs is read solely by
    // GET /api/admin/audit-logs behind requireAdmin.
    await audit(ctx, ACTIONS.CREDENTIAL_REVOKE, {
      entityType: 'ordination',
      entityId: ctx.params.id,
      metadata: {
        credential_number: ordination.credential_number,
        credential_version: ordination.credential_version,
        revoked_at: now,
        reason,
      },
    });

    const user = await repo.users.byId(ordination.user_id);
    const notification = await notifyMember(
      ctx,
      user,
      // NOTE: the reason is NOT passed to the template. Policy authorizes
      // telling the member THAT and WHEN, never WHY.
      templates.credentialRevoked({
        credentialNumber: ordination.credential_number,
        revokedOn: emailDate(now),
      }),
      { ordinationId: ctx.params.id },
    );

    return json({
      ok: true,
      ordination_id: ctx.params.id,
      credential_number: ordination.credential_number,
      revoked_at: now,
      notification,
    });
  });

  /**
   * Reissue a revoked credential (M11 Q8). The client supplies nothing: no new
   * credential number, no new slug. The repository preserves credential_number,
   * verify_slug, approved_at, approved_by and status, clears the revocation
   * fields, increments credential_version, and moves issued_at to now.
   */
  r.post('/api/admin/ordinations/:id/reissue', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const repo = repos(db);

    const now = new Date().toISOString();
    const result = await repo.ordinations.reissue(ctx.params.id, { now });

    if (!result.ok) {
      if (result.outcome === 'not_found') throw notFound('Ordination not found');
      if (result.outcome === 'not_revoked') throw conflict('This credential is not revoked');
      throw conflict('This ordination has no issued credential to reissue');
    }

    const ordination = await repo.ordinations.byId(ctx.params.id);

    // No revocation reason here — it has been cleared and is now obsolete.
    await audit(ctx, ACTIONS.CREDENTIAL_REISSUE, {
      entityType: 'ordination',
      entityId: ctx.params.id,
      metadata: {
        credential_number: ordination.credential_number,
        credential_version: ordination.credential_version,
        issued_at: now,
      },
    });

    const user = await repo.users.byId(ordination.user_id);
    const notification = await notifyMember(
      ctx,
      user,
      templates.credentialReissued({
        credentialNumber: ordination.credential_number,
        // approved_at, NOT issued_at — a reissue is not a new ordination.
        dateOfOrdination: emailDate(ordination.approved_at),
      }),
      { ordinationId: ctx.params.id },
    );

    return json({
      ok: true,
      ordination_id: ctx.params.id,
      credential_number: ordination.credential_number,
      credential_version: ordination.credential_version,
      issued_at: now,
      notification,
    });
  });

  r.post('/api/admin/ordinations/:id/reject', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const repo = repos(db);
    const ordination = await repo.ordinations.byId(ctx.params.id);
    const ok = await repo.ordinations.reject(ctx.params.id, { approvedBy: ctx.session.user_id });
    if (!ok) throw conflict('Ordination is not pending');
    if (ordination) {
      const user = await repo.users.byId(ordination.user_id);
      if (user) await send(ctx, { to: user.email, ...templates.applicationRejected('ordination') });
    }
    await audit(ctx, ACTIONS.ORDINATION_REJECT, { entityType: 'ordination', entityId: ctx.params.id });
    return json({ ok: true });
  });

  return r;
}
