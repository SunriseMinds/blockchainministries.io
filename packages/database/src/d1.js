/**
 * D1 access layer.
 *
 * Rules enforced here:
 *  - Every query is parameterized. No SQL string is ever built from user input.
 *  - D1 availability is gated by USE_D1 so an unconfigured environment fails
 *    loudly with 503 instead of throwing an opaque binding error.
 *  - Timestamps are ISO-8601 UTC TEXT (SQLite has no timestamptz).
 */
import { HttpError, unavailable } from '@reellink/core/http.js';

/** @returns {D1Database} */
export function requireDb(ctx) {
  if (!ctx.flags.USE_D1) throw unavailable('Database access is disabled (USE_D1=false)');
  const db = ctx.env.DB;
  if (!db) throw new HttpError(503, 'unavailable', 'D1 binding "DB" is not configured');
  return db;
}

export const nowIso = () => new Date().toISOString();
export const uuid = () => crypto.randomUUID();

/**
 * Thin query helpers. `sql` must be a constant template containing only `?`
 * placeholders; `params` supplies every value.
 */
export function q(db) {
  return {
    /** First row or null. */
    async first(sql, params = []) {
      return db.prepare(sql).bind(...params).first();
    },
    /** All rows (array, never null). */
    async all(sql, params = []) {
      const { results } = await db.prepare(sql).bind(...params).all();
      return results ?? [];
    },
    /** Write; returns D1 meta ({changes, last_row_id, ...}). */
    async run(sql, params = []) {
      const { meta } = await db.prepare(sql).bind(...params).run();
      return meta ?? {};
    },
    /** Single scalar from the first column of the first row. */
    async value(sql, params = []) {
      const row = await db.prepare(sql).bind(...params).first();
      if (!row) return null;
      return Object.values(row)[0];
    },
    /**
     * Atomic batch. D1 runs these in a single transaction, which is how
     * multi-statement invariants (e.g. consume-token-then-update) stay safe.
     * @param {Array<{sql:string, params?:any[]}>} statements
     */
    async batch(statements) {
      return db.batch(statements.map((s) => db.prepare(s.sql).bind(...(s.params ?? []))));
    },
  };
}

/**
 * Build a bounded `LIMIT ?/OFFSET ?` clause. Values are still bound, never
 * interpolated; this only produces the constant clause text.
 */
export function page({ limit = 50, offset = 0 } = {}) {
  return { clause: ' LIMIT ? OFFSET ?', params: [limit, offset] };
}

/** Serialize/deserialize the JSON-in-TEXT columns consistently. */
export const toJsonText = (obj) => (obj == null ? null : JSON.stringify(obj));
export function fromJsonText(text) {
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null; // never throw on malformed stored JSON; caller decides
  }
}

/** SQLite stores booleans as 0/1. */
export const toBool = (v) => (v ? 1 : 0);
export const fromBool = (v) => v === 1 || v === true;
