/**
 * Route-level test harness for the Blockchain Ministries Worker.
 *
 * Builds the REAL router (worker/routes/public.js `mount`) and dispatches real
 * Request objects through it, so middleware, guards, error mapping and headers
 * are all exercised rather than mocked. Only the session is injected — every
 * other decision (ownership, role, state gating, audit) is left to the code
 * under test.
 *
 * Test-only. Touches no D1: the database is the in-memory harness from
 * ./d1.mjs, built from the real migration chain.
 */
import { Router } from '@reellink/api/router.js';
import { mount } from '../../worker/routes/public.js';

/** Flags matching production (USE_R2 deliberately false — M11 uses no R2). */
export const PROD_FLAGS = Object.freeze({
  USE_D1: true,
  USE_KV: true,
  USE_WORKER_AUTH: true,
  USE_NEW_API: true,
  USE_R2: false,
  USE_TURNSTILE: false,
});

let cached = null;
function router() {
  if (!cached) {
    cached = new Router();
    mount(cached);
  }
  return cached;
}

/**
 * Dispatch a GET through the real router.
 *
 * @param {object} opts
 * @param {object} opts.db          D1 shim from test/helpers/d1.mjs
 * @param {string} opts.path        e.g. '/api/ordination/o-1/credential'
 * @param {object|null} opts.session null = anonymous
 * @param {object} [opts.env]       extra env (SITE_URL, etc.)
 * @returns {Promise<Response>}
 */
export async function get({ db, path, session = null, env = {} }) {
  const url = new URL(`https://blockchainministries.io${path}`);
  const request = new Request(url, {
    method: 'GET',
    headers: { 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': 'phase5-test' },
  });

  const ctx = {
    request,
    url,
    env: { DB: db, SITE_URL: 'https://blockchainministries.io', ...env },
    flags: { ...PROD_FLAGS },
    // Pre-resolved session: loadSession() short-circuits on `sessionLoaded`,
    // so the guards run for real against exactly this identity.
    session,
    sessionLoaded: true,
    // No waitUntil, so audit writes are awaited inline and are observable.
  };

  return router().handle(ctx);
}

/** Session shapes. `role` mirrors what resolveSession() joins onto the row. */
export const asMember = (userId, email = `${userId}@bm.test`) => ({
  user_id: userId, email, role: 'member', email_verified: 1,
});
export const asAdmin = (userId, email = `${userId}@bm.test`) => ({
  user_id: userId, email, role: 'admin', email_verified: 1,
});

/** Read the audit_logs rows written during a test. */
export function auditRows(sqlite, action) {
  const sql = action
    ? 'SELECT * FROM audit_logs WHERE action = ? ORDER BY created_at'
    : 'SELECT * FROM audit_logs ORDER BY created_at';
  return action ? sqlite.prepare(sql).all(action) : sqlite.prepare(sql).all();
}
