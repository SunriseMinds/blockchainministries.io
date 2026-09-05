/**
 * Born Loyal Records — domain repositories. The single place this app's SQL is written.
 * Platform identity/audit repositories are composed in from @reellink.
 */
import { q, page } from '@reellink/database/d1.js';
import { authRepos } from '@reellink/auth/repositories.js';
import { auditLogs } from '@reellink/security/audit-repo.js';

const items = (db) => ({
  list(opts) {
    const p = page(opts);
    return q(db).all(`SELECT * FROM items ORDER BY created_at DESC${p.clause}`, p.params);
  },
  // Ownership is bound to the session user id, never a client-supplied value.
  listByUser: (userId) => q(db).all('SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC', [userId]),
});

export function repos(db) {
  return { ...authRepos(db), auditLogs: auditLogs(db), items: items(db) };
}
