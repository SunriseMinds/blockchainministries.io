/**
 * Story Writer Hub — domain routes.
 *
 * Collaborative writing: stories, chapters, revisions. Uses platform auth for authors and R2 for manuscript exports. An existing Supabase project (storywriterhub) and D1 (storywriterhub-db) already exist in the account.
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
  // TODO: replace with real stories endpoints.
  r.get('/api/stories', [], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).items.list(v.pagination(ctx.url)) }, { private: false });
  });

  r.get('/api/stories/mine', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).items.listByUser(ctx.session.user_id) });
  });

  return r;
}
