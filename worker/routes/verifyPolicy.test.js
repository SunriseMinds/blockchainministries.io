/**
 * M11 Phase 7 — public verification rate limit and cache policy.
 *
 * Run: node --test worker/routes/verifyPolicy.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '@reellink/api/router.js';
import { POLICIES } from '@reellink/security/ratelimit.js';
import { freshDb, seedUser, seedOrdination } from '../../test/helpers/d1.mjs';
import { freshKv } from '../../test/helpers/kv.mjs';
import { PROD_FLAGS } from '../../test/helpers/route.mjs';
import { mount } from './public.js';
import { ordinations } from '../db/repositories.js';

const T1 = '2026-03-01T10:00:00.000Z';

let cached = null;
function router() {
  if (!cached) { cached = new Router(); mount(cached); }
  return cached;
}

async function setup() {
  const { db, sqlite, close } = freshDb();
  seedUser(sqlite, { id: 'u-alice', email: 'u-alice@bm.test' });
  seedUser(sqlite, { id: 'u-admin', email: 'u-admin@bm.test', role: 'admin' });
  seedOrdination(sqlite, { id: 'o-1', userId: 'u-alice', fullName: 'TEST Minister' });
  const repo = ordinations(db);
  await repo.approve('o-1', { approvedBy: 'u-admin', verifySlug: 'slug-alice', now: T1 });

  sqlite.prepare(
    `INSERT INTO scrolls (id,title,slug,verify_slug,r2_key,visibility,published_at,created_at,updated_at)
     VALUES ('s-1','Fixture Scroll','fixture','slug-scroll','scrolls/s-1.pdf','public',?,?,?)`,
  ).run(T1, T1, T1);

  return { db, sqlite, close, repo, kv: freshKv() };
}

function verify({ db, kv, slug = 'slug-alice', ip = '203.0.113.7' }) {
  const url = new URL(`https://blockchainministries.io/api/verify/${slug}`);
  const request = new Request(url, { method: 'GET', headers: { 'CF-Connecting-IP': ip } });
  return router().handle({
    request, url,
    env: { DB: db, RATE_LIMIT: kv, SITE_URL: 'https://blockchainministries.io' },
    flags: { ...PROD_FLAGS },
    session: null, sessionLoaded: true,
  });
}

/* ------------------------------------------------------- shared policy add -- */

test('verifySlug policy is 60 requests per 60 seconds', () => {
  assert.deepEqual(POLICIES.verifySlug, [60, 60]);
});

test('existing rate-limit policies are behaviourally unchanged', () => {
  // Byte-for-byte values, asserted so the shared-package edit cannot have
  // altered another application's limits.
  assert.deepEqual(POLICIES.login, [5, 15 * 60]);
  assert.deepEqual(POLICIES.signup, [3, 60 * 60]);
  assert.deepEqual(POLICIES.passwordReset, [3, 60 * 60]);
  assert.deepEqual(POLICIES.publicForm, [5, 60 * 60]);
  assert.deepEqual(POLICIES.payment, [10, 60 * 60]);
  assert.deepEqual(POLICIES.verifyEmail, [10, 60 * 60]);
  assert.deepEqual(POLICIES.loginLink, [5, 15 * 60]);
  assert.equal(Object.keys(POLICIES).length, 8, 'exactly one policy was added');
  assert.ok(Object.isFrozen(POLICIES));
});

/* -------------------------------------------------------------- rate limit -- */

test('60 requests in the window succeed and the 61st is rate limited', async (t) => {
  const { db, kv, close } = await setup();
  t.after(close);

  for (let i = 1; i <= 60; i += 1) {
    const res = await verify({ db, kv });
    assert.equal(res.status, 200, `request ${i} should have been allowed`);
  }
  const blocked = await verify({ db, kv });
  assert.equal(blocked.status, 429);
  assert.equal((await blocked.json()).error.code, 'rate_limited');
});

test('a separate IP has an independent allowance', async (t) => {
  const { db, kv, close } = await setup();
  t.after(close);

  for (let i = 0; i < 60; i += 1) await verify({ db, kv, ip: '198.51.100.1' });
  assert.equal((await verify({ db, kv, ip: '198.51.100.1' })).status, 429);
  // A different scanner is unaffected.
  assert.equal((await verify({ db, kv, ip: '198.51.100.2' })).status, 200);
});

test('normal QR scanning is unaffected — a burst of 20 scans all succeed', async (t) => {
  const { db, kv, close } = await setup();
  t.after(close);
  // A room of people scanning one printed code from a single NAT'd IP.
  for (let i = 0; i < 20; i += 1) {
    assert.equal((await verify({ db, kv })).status, 200);
  }
});

test('rate limiting fails OPEN when KV is unavailable', async (t) => {
  const { db, close } = await setup();
  t.after(close);
  // A misconfigured environment must not make public verification unusable.
  for (let i = 0; i < 70; i += 1) {
    assert.equal((await verify({ db, kv: undefined })).status, 200);
  }
});

/* ------------------------------------------------------------- cache policy -- */

test('ordination verification is never cached — VALID', async (t) => {
  const { db, kv, close } = await setup();
  t.after(close);

  const res = await verify({ db, kv });
  assert.equal(res.status, 200);
  assert.equal((await res.clone().json()).data.credential_status, 'valid');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('ordination verification is never cached — REVOKED', async (t) => {
  const { db, kv, close, repo } = await setup();
  t.after(close);

  await repo.revoke('o-1', { revokedBy: 'u-admin', reason: 'internal', now: '2026-04-01T00:00:00.000Z' });
  const res = await verify({ db, kv });
  assert.equal(res.status, 200);
  assert.equal((await res.clone().json()).data.credential_status, 'revoked');
  assert.equal(res.headers.get('cache-control'), 'no-store',
    'a revoked credential must never be served from a stale VALID cache');
});

test('scroll verification caching is unchanged', async (t) => {
  const { db, kv, close } = await setup();
  t.after(close);

  const res = await verify({ db, kv, slug: 'slug-scroll' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).type, 'scroll');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=60',
    'scrolls have no revocation lifecycle and keep their existing caching');
});
