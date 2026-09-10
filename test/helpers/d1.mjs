/**
 * Minimal D1-shaped test harness over Node 22's `node:sqlite`.
 *
 * Repositories in worker/db/repositories.js are written against D1's API
 * (`db.prepare(sql).bind(...).first() / .all() / .run()`), so tests need an
 * object with that shape rather than a mock of the repositories themselves —
 * the point is to exercise the REAL SQL against the REAL schema.
 *
 * The schema is built by replaying the actual migration chain
 * (0001 -> 0002 -> 0003) from migrations/, never a hand-copied DDL string. If a
 * migration and the code ever disagree, these tests fail, which is the whole
 * point of testing against the real files.
 *
 * Scope: this is a test-only helper for Blockchain Ministries. It does not
 * touch D1 (production or preview), and nothing in packages/* is modified.
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The applied migration chain, in order. Keep in sync with migrations/. */
export const MIGRATIONS = [
  '0001_initial_schema.sql',
  '0002_login_tokens.sql',
  '0003_ordination_credentials.sql',
];

/**
 * Wrap a node:sqlite handle in D1's interface.
 *
 * Only the surface the repositories actually use is implemented: prepare/bind
 * plus first/all/run. `run()` returns `{ meta: { changes, last_row_id } }`
 * because that is what @reellink/database's q().run() destructures.
 */
function asD1(sqlite) {
  return {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      const bindAnd = (params) => ({
        async first() {
          return stmt.get(...params) ?? null;
        },
        async all() {
          return { results: stmt.all(...params) ?? [] };
        },
        async run() {
          const info = stmt.run(...params);
          return { meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
        },
      });
      return {
        bind: (...params) => bindAnd(params),
        // Unbound convenience, mirroring D1.
        ...bindAnd([]),
      };
    },
    /** Escape hatch for test setup/assertions that don't need the D1 shape. */
    _raw: sqlite,
  };
}

/**
 * Fresh in-memory database with the full migration chain applied and foreign
 * keys enforced (D1 enforces them; an in-memory SQLite does not by default,
 * and silently skipping FK checks would make these tests weaker than reality).
 *
 * @returns {{db:object, sqlite:DatabaseSync, close:() => void}}
 */
export function freshDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of MIGRATIONS) {
    sqlite.exec(readFileSync(join(REPO_ROOT, 'migrations', file), 'utf8'));
  }
  return { db: asD1(sqlite), sqlite, close: () => sqlite.close() };
}

/** Insert a user directly; returns the id. */
export function seedUser(sqlite, { id, email, role = 'member' }) {
  sqlite
    .prepare(
      `INSERT INTO users (id,email,password_hash,email_verified,role,display_name,status,created_at,updated_at)
       VALUES (?,?,'x',1,?,?, 'active','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`,
    )
    .run(id, email, role, `User ${id}`);
  return id;
}

/** Insert a pending ordination directly; returns the id. */
export function seedOrdination(sqlite, { id, userId, fullName = 'Test Applicant', status = 'pending' }) {
  sqlite
    .prepare(
      `INSERT INTO ordinations (id,user_id,application_json,status,created_at,updated_at)
       VALUES (?,?,?,?, '2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`,
    )
    .run(id, userId, JSON.stringify({ fullName, reason: 'called' }), status);
  return id;
}

/** Read a whole ordination row back. */
export function readOrdination(sqlite, id) {
  return sqlite.prepare('SELECT * FROM ordinations WHERE id = ?').get(id) ?? null;
}
