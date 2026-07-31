/**
 * /api/files — R2 object access.
 *
 * Public objects are streamed with long-cache headers. Protected objects are
 * NEVER public: the Worker checks the session and the caller's entitlement in
 * D1 before streaming, and returns 404 (not 403) on failure so existence is
 * not confirmed to unauthorized callers.
 */
import { json, notFound, forbidden } from '../lib/http.js';
import { requireDb } from '../lib/db.js';
import { repos } from '../db/repositories.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import * as r2 from '../lib/r2.js';
import { audit, ACTIONS } from '../lib/audit.js';

/**
 * Does this session own, or otherwise have rights to, this protected key?
 * Keys follow the convention in docs/R2_FILE_MIGRATION_PLAN.md.
 */
async function canReadProtected(ctx, db, key) {
  if (ctx.session?.role === 'admin') return true;
  const repo = repos(db);

  // credentials/<ordination_id>.pdf -> owner of an approved ordination
  let m = /^credentials\/([A-Za-z0-9-]+)\.pdf$/.exec(key);
  if (m) {
    const ord = await repo.ordinations.byId(m[1]);
    return Boolean(ord && ord.user_id === ctx.session.user_id && ord.status === 'approved');
  }

  // scrolls-member/<scroll_id>.pdf -> any approved member
  m = /^scrolls-member\/([A-Za-z0-9-]+)\.pdf$/.exec(key);
  if (m) {
    const scroll = await repo.scrolls.byId(m[1]);
    if (!scroll || scroll.visibility === 'admin') return false;
    const membership = await repo.memberships.byUser(ctx.session.user_id);
    return Boolean(membership && membership.status === 'approved');
  }

  return false; // deny by default
}

export function mount(r) {
  /* ------------------------------------------------------------- public -- */
  r.get('/api/files/public/:key+', [], async (ctx) => {
    const key = ctx.params.key;
    const obj = await r2.download(ctx, r2.BUCKETS.PUBLIC, key);
    return r2.toResponse(obj, { isPublic: true });
  });

  /* ---------------------------------------------------------- protected -- */
  r.get('/api/files/protected/:key+', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    const key = r2.assertSafeKey(ctx.params.key);

    if (!(await canReadProtected(ctx, db, key))) {
      // 404, not 403 — do not confirm the object exists.
      throw notFound('File not found');
    }
    const obj = await r2.download(ctx, r2.BUCKETS.PROTECTED, key);
    await audit(ctx, ACTIONS.FILE_DOWNLOAD, { entityType: 'r2_object', entityId: key });
    return r2.toResponse(obj, { isPublic: false });
  });

  /**
   * Mint a short-lived signed grant for a protected object. The grant is
   * redeemed at the Worker below, so it never becomes a public bucket URL.
   */
  r.post('/api/files/protected/sign', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    const body = await ctx.request.json().catch(() => ({}));
    const key = r2.assertSafeKey(String(body.key || ''));
    if (!(await canReadProtected(ctx, db, key))) throw notFound('File not found');
    const grant = await r2.signKey(ctx, key, 300);
    return json({ ...grant, url: `/api/files/signed?key=${encodeURIComponent(grant.key)}&exp=${grant.exp}&sig=${grant.sig}` });
  });

  /** Redeem a signed grant. Verifies HMAC + expiry; no session required. */
  r.get('/api/files/signed', [], async (ctx) => {
    const key = r2.assertSafeKey(ctx.url.searchParams.get('key') || '');
    await r2.verifySignedKey(ctx, key, ctx.url.searchParams.get('exp'), ctx.url.searchParams.get('sig'));
    const obj = await r2.download(ctx, r2.BUCKETS.PROTECTED, key);
    return r2.toResponse(obj, { isPublic: false });
  });

  /* --------------------------------------------------------- admin ops -- */
  r.get('/api/admin/files/:bucket', [requireAdmin], async (ctx) => {
    const bucket = ctx.params.bucket === 'public' ? r2.BUCKETS.PUBLIC : r2.BUCKETS.PROTECTED;
    const listing = await r2.list(ctx, bucket, {
      prefix: ctx.url.searchParams.get('prefix') || undefined,
      cursor: ctx.url.searchParams.get('cursor') || undefined,
    });
    return json(listing);
  });

  r.delete('/api/admin/files/:bucket/:key+', [requireAdmin], async (ctx) => {
    const bucket = ctx.params.bucket === 'public' ? r2.BUCKETS.PUBLIC : r2.BUCKETS.PROTECTED;
    const res = await r2.remove(ctx, bucket, ctx.params.key);
    await audit(ctx, 'file.delete', { entityType: 'r2_object', entityId: res.key });
    return json(res);
  });

  return r;
}
