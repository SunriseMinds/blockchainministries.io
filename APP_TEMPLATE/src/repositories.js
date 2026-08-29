/**
 * <APP_NAME> — domain repositories. The single place this app's SQL is written.
 *
 * Platform identity/audit repositories are composed in, so route handlers get
 * users/sessions/auditLogs for free alongside domain tables. There is one
 * canonical `users` table (role/display_name/wallet_xrpl/stripe_customer_id
 * live on it directly) — do not add a separate profiles/identity table.
 * Every query is parameterized; ownership filters bind the session user id.
 */
import { q, page, uuid, nowIso } from '@reellink/database/d1.js';
import { authRepos } from '@reellink/auth/repositories.js';
import { auditLogs } from '@reellink/security/audit-repo.js';

const examples = (db) => ({
  list(opts) {
    const p = page(opts);
    return q(db).all(`SELECT * FROM examples ORDER BY created_at DESC${p.clause}`, p.params);
  },
  listByUser: (userId) =>
    q(db).all('SELECT * FROM examples WHERE user_id = ? ORDER BY created_at DESC', [userId]),
  async create({ title, userId = null, ip = null }) {
    const id = uuid();
    await q(db).run(
      'INSERT INTO examples (id, user_id, title, ip, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, userId, title, ip, nowIso(), nowIso()],
    );
    return id;
  },
});

export function repos(db) {
  return { ...authRepos(db), auditLogs: auditLogs(db), examples: examples(db) };
}
