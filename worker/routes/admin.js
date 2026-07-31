/**
 * /api/admin — administrator routes.
 *
 * Two layers of protection:
 *   1. Cloudflare Access in front of /api/admin/* (dashboard configuration).
 *   2. requireAdmin here, which re-checks profiles.role in D1 regardless.
 *
 * This replaces the current arrangement, where the only real control is a
 * client-side role check plus Supabase RLS policies (risks R-03/R-04).
 */
import { json, notFound, conflict, badRequest } from '@reellink/core/http.js';
import { requireDb } from '@reellink/database/d1.js';
import { repos } from '../db/repositories.js';
import * as val from '@reellink/core/validate.js';
import { audit } from '@reellink/security/audit.js';
import { ACTIONS } from '../config/actions.js';
import { send, templates } from '../email/templates.js';
import { requireAdmin } from '@reellink/auth/middleware.js';
import { randomToken } from '@reellink/security/crypto.js';
import * as xrpl from '@reellink/xrpl/client.js';

const STATUSES = ['pending', 'approved', 'rejected'];

export function mount(r) {
  /* -------------------------------------------------------------- lists -- */
  r.get('/api/admin/profiles', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).profiles.list(val.pagination(ctx.url)) });
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

  r.get('/api/admin/memberships', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const status = ctx.url.searchParams.get('status') || 'pending';
    if (!STATUSES.includes(status)) throw badRequest('Invalid status filter');
    return json({ items: await repos(db).memberships.listByStatus(status, val.pagination(ctx.url)) });
  });

  r.get('/api/admin/ordinations', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const status = ctx.url.searchParams.get('status') || 'pending';
    if (!STATUSES.includes(status)) throw badRequest('Invalid status filter');
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
    if (!transitioned) throw conflict(`Membership is already ${membership.status}`);

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
    const verifySlug = ordination.verify_slug || randomToken(12).toLowerCase();

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
        const res = await xrpl.mintCredentialNft(ctx, { uri });
        minting = { status: res.accepted ? 'submitted' : 'rejected', hash: res.hash, engine_result: res.engine_result, network: res.network };
        if (res.hash) await repo.ordinations.approve(ctx.params.id, { approvedBy: ctx.session.user_id, verifySlug, txHash: res.hash });
      } catch (e) {
        // A minting failure must not roll back the approval; it is recorded
        // for follow-up so an operator can retry the mint deliberately.
        minting = { status: 'error', message: e?.message?.slice(0, 200) };
        console.error('[xrpl] mint failed', e?.message);
      }
    }

    const user = await repo.users.byId(ordination.user_id);
    if (user) await send(ctx, { to: user.email, ...templates.applicationApproved('ordination') });

    await audit(ctx, ACTIONS.ORDINATION_APPROVE, {
      entityType: 'ordination', entityId: ctx.params.id, metadata: { verify_slug: verifySlug, minting },
    });
    return json({ ok: true, ordination_id: ctx.params.id, verify_slug: verifySlug, xrpl_minting: minting });
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
