/**
 * <APP_NAME> — domain routes. THIS is where an application's work happens.
 *
 * Guards come from the platform; never hand-roll authorization:
 *   []                  public
 *   [requireTurnstile]  public write (captcha verified server-side)
 *   [requireAuth]       signed-in
 *   [requireAdmin]      administrator (also re-checks role in D1)
 */
import { json, readJson, clientIp } from '@reellink/core/http.js';
import * as v from '@reellink/core/validate.js';
import { requireDb } from '@reellink/database/d1.js';
import { requireAuth, requireAdmin } from '@reellink/auth/middleware.js';
import { requireTurnstile } from '@reellink/security/turnstile-middleware.js';
import { enforce } from '@reellink/security/ratelimit.js';
import { audit } from '@reellink/security/audit.js';
import { repos } from './repositories.js';
import { ACTIONS } from './config.js';

export function mountRoutes(r) {
  // Public read.
  r.get('/api/examples', [], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).examples.list(v.pagination(ctx.url)) }, { private: false });
  });

  // Public write: captcha + rate limit + validation, in that order.
  r.post('/api/examples', [requireTurnstile], async (ctx) => {
    const db = requireDb(ctx);
    await enforce(ctx, 'publicForm', clientIp(ctx.request));
    const id = await repos(db).examples.create({
      title: v.str(ctx.body, 'title', { max: 200 }),
      ip: clientIp(ctx.request),
    });
    await audit(ctx, ACTIONS.FILE_UPLOAD, { entityType: 'example', entityId: id });
    return json({ ok: true, id }, { status: 201 });
  });

  // Signed-in: ownership is bound to the session, never to client input.
  r.get('/api/examples/mine', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).examples.listByUser(ctx.session.user_id) });
  });

  // Administrator.
  r.get('/api/admin/examples', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).examples.list(v.pagination(ctx.url)) });
  });

  return r;
}
