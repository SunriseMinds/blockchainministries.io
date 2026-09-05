/**
 * Language Learning RPG — domain routes.
 *
 * Gamified learning: lessons, progress, streaks. Uses platform auth + KV for session state.
 *
 * Auth routes (/api/auth/*), profile, file access and audit come from the
 * platform; add them by mounting @reellink packages' route helpers. Below are
 * the business endpoints unique to this application.
 */
import { json } from '@reellink/core/http.js';
import { requireDb } from '@reellink/database/d1.js';
import { requireAuth } from '@reellink/auth/middleware.js';
import * as v from '@reellink/core/validate.js';
import { repos } from './repositories.js';

export function mountRoutes(r) {
  // TODO: replace with real lessons endpoints.
  r.get('/api/lessons', [], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).items.list(v.pagination(ctx.url)) }, { private: false });
  });

  r.get('/api/lessons/mine', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).items.listByUser(ctx.session.user_id) });
  });

  return r;
}
