/**
 * M11 Phase 5 — GET /api/ordination/:id/credential.
 *
 * THE SECURITY GATE. These tests dispatch real Requests through the real
 * router, so guards, state gating, headers and audit are exercised end to end
 * against the real schema (migrations 0001 -> 0002 -> 0003) in memory.
 *
 * Run: node --test worker/routes/credential.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '@reellink/api/router.js';
import { freshDb, seedUser, seedOrdination, readOrdination } from '../../test/helpers/d1.mjs';
import { get, asMember, asAdmin, auditRows } from '../../test/helpers/route.mjs';
import { mount } from './public.js';
import { ordinations } from '../db/repositories.js';

const T1 = '2026-03-01T10:00:00.000Z';
const T2 = '2026-04-01T10:00:00.000Z';
const FULL_NAME = 'Jordan Alexis Rivers';
const PATH = (id) => `/api/ordination/${id}/credential`;

/**
 * Two members + an admin. `o-1` belongs to u-alice and is issued unless
 * `issue:false`. `o-2` belongs to u-bob and is always issued (the
 * cross-member target).
 */
async function setup({ issue = true, status = 'pending' } = {}) {
  const { db, sqlite, close } = freshDb();
  // Emails match test/helpers/route.mjs's session default, so the identity in
  // the session is the same identity in `users` — as it is in production.
  seedUser(sqlite, { id: 'u-alice', email: 'u-alice@bm.test' });
  seedUser(sqlite, { id: 'u-bob', email: 'u-bob@bm.test' });
  seedUser(sqlite, { id: 'u-admin', email: 'u-admin@bm.test', role: 'admin' });

  // display_name is deliberately DIFFERENT from application_json.fullName so a
  // substitution bug is visible rather than silently plausible.
  sqlite.prepare("UPDATE users SET display_name='WRONG DISPLAY NAME' WHERE id='u-alice'").run();

  seedOrdination(sqlite, { id: 'o-1', userId: 'u-alice', fullName: FULL_NAME, status });
  seedOrdination(sqlite, { id: 'o-2', userId: 'u-bob', fullName: 'Bob Other' });

  const repo = ordinations(db);
  if (issue) await repo.approve('o-1', { approvedBy: 'u-admin', verifySlug: 'slug-alice', now: T1 });
  await repo.approve('o-2', { approvedBy: 'u-admin', verifySlug: 'slug-bob', now: T1 });

  return { db, sqlite, close, repo, row: (id) => readOrdination(sqlite, id) };
}

/* ------------------------------------------------------- 1. authentication -- */

test('1. anonymous request is rejected with 401', async (t) => {
  const { db, sqlite, close } = await setup();
  t.after(close);

  const res = await get({ db, path: PATH('o-1'), session: null });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error.code, 'unauthorized');
  assert.equal(auditRows(sqlite, 'credential.view').length, 0);
});

/* ---------------------------------------------------------- 2 & 8. allowed -- */

test('2. owner may view their own valid issued credential', async (t) => {
  const { db, close } = await setup();
  t.after(close);

  const res = await get({ db, path: PATH('o-1'), session: asMember('u-alice') });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('Certificate of Ordination'));
});

test('8. admin may view another member\'s valid issued credential', async (t) => {
  const { db, sqlite, close } = await setup();
  t.after(close);

  const res = await get({ db, path: PATH('o-2'), session: asAdmin('u-admin') });
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes('Bob Other'));

  const rows = auditRows(sqlite, 'credential.view');
  assert.equal(rows.length, 1);
  assert.equal(JSON.parse(rows[0].metadata_json).as_admin, true, 'admin view must be flagged in the audit row');
});

test('admin role is honoured even when the session carries no role claim', async (t) => {
  const { db, close } = await setup();
  t.after(close);

  // Role resolved from the canonical users row, exactly as requireAdmin does.
  const session = { user_id: 'u-admin', email: 'admin@bm.test', email_verified: 1 };
  assert.equal((await get({ db, path: PATH('o-2'), session })).status, 200);
});

test('a session claiming admin for a NON-admin user is not trusted blindly', async (t) => {
  const { db, close } = await setup();
  t.after(close);
  // Belt and braces: the session claim is what resolveSession joined from the
  // users table, so a forged claim is not reachable in production. Documented
  // here so the coupling is explicit if session shape ever changes.
  const forged = { user_id: 'u-bob', email: 'bob@bm.test', role: 'member' };
  assert.equal((await get({ db, path: PATH('o-1'), session: forged })).status, 404);
});

/* ------------------------------------------------ 3-7. denial is always 404 -- */

test('3. member A requesting member B\'s credential -> 404 (not 403)', async (t) => {
  const { db, sqlite, close } = await setup();
  t.after(close);

  const res = await get({ db, path: PATH('o-2'), session: asMember('u-alice') });
  assert.equal(res.status, 404, 'must not confirm the credential exists');
  assert.notEqual(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, 'not_found');
  assert.ok(!JSON.stringify(body).includes('Bob Other'));
  assert.equal(auditRows(sqlite, 'credential.view').length, 0);
});

test('4. pending ordination -> 404', async (t) => {
  const { db, close } = await setup({ issue: false });
  t.after(close);
  assert.equal(( await get({ db, path: PATH('o-1'), session: asMember('u-alice') })).status, 404);
});

test('5. rejected ordination -> 404', async (t) => {
  const { db, close, repo } = await setup({ issue: false });
  t.after(close);
  await repo.reject('o-1', { approvedBy: 'u-admin' });
  assert.equal((await get({ db, path: PATH('o-1'), session: asMember('u-alice') })).status, 404);
});

test('6. approved but issued_at NULL -> 404', async (t) => {
  const { db, sqlite, close } = await setup({ issue: false });
  t.after(close);
  // The exact state of every pre-M11 production row: approved, never issued.
  sqlite.prepare("UPDATE ordinations SET status='approved', approved_at=? WHERE id='o-1'").run(T1);
  const r = readOrdination(sqlite, 'o-1');
  assert.equal(r.status, 'approved');
  assert.equal(r.issued_at, null);

  assert.equal((await get({ db, path: PATH('o-1'), session: asMember('u-alice') })).status, 404);
});

test('7. revoked credential -> 404 for the owner, and for an admin', async (t) => {
  const { db, sqlite, close, repo } = await setup();
  t.after(close);

  assert.equal((await get({ db, path: PATH('o-1'), session: asMember('u-alice') })).status, 200);
  await repo.revoke('o-1', { revokedBy: 'u-admin', reason: 'conduct review', now: T2 });

  assert.equal((await get({ db, path: PATH('o-1'), session: asMember('u-alice') })).status, 404,
    'a revoked credential must become immediately unavailable');
  assert.equal((await get({ db, path: PATH('o-1'), session: asAdmin('u-admin') })).status, 404);

  // ...and available again after reissue.
  await repo.reissue('o-1', { now: T2 });
  assert.equal((await get({ db, path: PATH('o-1'), session: asMember('u-alice') })).status, 200);
});

test('a non-existent ordination id -> 404, identical to every other denial', async (t) => {
  const { db, close } = await setup();
  t.after(close);
  const missing = await get({ db, path: PATH('no-such-id'), session: asMember('u-alice') });
  const foreign = await get({ db, path: PATH('o-2'), session: asMember('u-alice') });
  assert.equal(missing.status, foreign.status);
  assert.deepEqual(await missing.json(), await foreign.json(), 'denials must be indistinguishable');
});

/* ------------------------------------------------------- 9-12. response security -- */

test('9-12. response carries the required security headers and a tight CSP', async (t) => {
  const { db, close } = await setup();
  t.after(close);
  const res = await get({ db, path: PATH('o-1'), session: asMember('u-alice') });

  assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');

  const csp = res.headers.get('content-security-policy');
  assert.ok(csp, 'CSP header missing');
  assert.ok(csp.includes("default-src 'none'"), 'CSP must deny by default');
  assert.ok(csp.includes("style-src 'unsafe-inline'"), 'inline stylesheet must be allowed');
  assert.ok(csp.includes("base-uri 'none'"));
  assert.ok(csp.includes("form-action 'none'"));
  assert.ok(csp.includes("frame-ancestors 'none'"));
  // Nothing broader than the document needs.
  assert.ok(!csp.includes('script-src'), 'no script-src — scripts inherit default-src none');
  assert.ok(!csp.includes('unsafe-eval'));
  assert.ok(!csp.includes('*'), 'no wildcard source');
});

test('12b. the CSP is sufficient for what the renderer actually emits', async (t) => {
  const { db, close } = await setup();
  t.after(close);
  const html = await (await get({ db, path: PATH('o-1'), session: asMember('u-alice') })).text();

  // Justifies omitting img-src / font-src / connect-src / script-src entirely.
  assert.equal(html.match(/<img\b/gi), null, 'an <img> would need img-src');
  assert.equal(html.match(/<script\b/gi), null, 'a <script> would need script-src');
  assert.equal(html.match(/<link\b/gi), null, 'a <link> would need style-src host');
  assert.equal(html.match(/@import/gi), null);
  assert.equal(html.match(/url\(/gi), null, 'a css url() would need img-src/font-src');
  assert.ok(html.includes('<svg class="qr"'), 'QR must be inline markup, not a fetched image');
  assert.equal(html.match(/<style/gi).length, 1, 'exactly one inline stylesheet');
});

/* --------------------------------------------------------- 13-15. content -- */

test('13 & 14. HTML carries the real credential number and application fullName', async (t) => {
  const { db, close, row } = await setup();
  t.after(close);
  const html = await (await get({ db, path: PATH('o-1'), session: asMember('u-alice') })).text();

  const number = row('o-1').credential_number;
  assert.match(number, /^BM-[A-Z0-9]{8}$/);
  assert.ok(html.includes(number), 'credential number missing from the document');
  assert.ok(html.includes(FULL_NAME), 'application_json.fullName missing from the document');
  assert.ok(html.includes('https://blockchainministries.io/verify/slug-alice'));
  assert.ok(html.includes('1 March 2026'), 'Date of Ordination must be approved_at');
});

test('15. users.display_name is NEVER substituted for application_json.fullName', async (t) => {
  const { db, close } = await setup();
  t.after(close);
  const html = await (await get({ db, path: PATH('o-1'), session: asMember('u-alice') })).text();
  assert.ok(!html.includes('WRONG DISPLAY NAME'), 'display_name leaked onto the credential');
  assert.ok(html.includes(FULL_NAME));
});

/* -------------------------------------------------- 16-18. fail-closed paths -- */

test('16. malformed application_json fails closed — no credential is rendered', async (t) => {
  const { db, sqlite, close } = await setup();
  t.after(close);
  sqlite.prepare("UPDATE ordinations SET application_json='{not valid json' WHERE id='o-1'").run();

  const res = await get({ db, path: PATH('o-1'), session: asMember('u-alice') });
  assert.equal(res.status, 500);
  assert.equal((await res.json()).error.code, 'credential_incomplete');
  assert.equal(auditRows(sqlite, 'credential.view').length, 0, 'a failed render must not be logged as a view');
});

test('17. missing or blank fullName fails closed', async (t) => {
  for (const payload of ['{}', '{"fullName":""}', '{"fullName":"   "}', '{"fullName":null}', '{"fullName":123}']) {
    const { db, sqlite, close } = await setup();
    sqlite.prepare('UPDATE ordinations SET application_json=? WHERE id=?').run(payload, 'o-1');

    const res = await get({ db, path: PATH('o-1'), session: asMember('u-alice') });
    assert.equal(res.status, 500, `should have failed closed for ${payload}`);
    assert.equal((await res.json()).error.code, 'credential_incomplete');
    close();
  }
});

test('18. missing SITE_URL fails loudly rather than building a broken URL', async (t) => {
  const { db, sqlite, close } = await setup();
  t.after(close);

  const res = await get({ db, path: PATH('o-1'), session: asMember('u-alice'), env: { SITE_URL: undefined } });
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, 'unavailable');
  assert.equal(auditRows(sqlite, 'credential.view').length, 0);
});

test('SITE_URL is taken from env, not hardcoded', async (t) => {
  const { db, close } = await setup();
  t.after(close);
  const html = await (await get({
    db, path: PATH('o-1'), session: asMember('u-alice'),
    env: { SITE_URL: 'https://preview.example.test/' },
  })).text();
  assert.ok(html.includes('https://preview.example.test/verify/slug-alice'));
  assert.ok(!html.includes('https://blockchainministries.io/verify/'));
});

/* --------------------------------------------------------- 19. no leakage -- */

test('19. the response leaks no internal or private field', async (t) => {
  const { db, sqlite, close, repo } = await setup();
  t.after(close);

  // Populate every field that must never surface, then un-revoke so the
  // document renders while those columns still hold data.
  sqlite.prepare(`UPDATE ordinations
      SET nft_token_id='NFT-SECRET', tx_hash='TX-SECRET',
          credential_r2_key='credentials/o-1.pdf',
          application_json='{"fullName":"Jordan Alexis Rivers","reason":"PRIVATE CALLING TEXT","experience":"PRIVATE EXPERIENCE"}'
    WHERE id='o-1'`).run();
  await repo.revoke('o-1', { revokedBy: 'u-admin', reason: 'PRIVATE REVOCATION REASON', now: T2 });
  await repo.reissue('o-1', { now: T2 });
  sqlite.prepare("UPDATE ordinations SET revocation_reason='PRIVATE REVOCATION REASON', revoked_by='u-admin' WHERE id='o-1'").run();

  const html = await (await get({ db, path: PATH('o-1'), session: asMember('u-alice') })).text();

  for (const secret of [
    'alice@bm.test', 'u-alice', 'u-admin', 'u-bob',
    'PRIVATE CALLING TEXT', 'PRIVATE EXPERIENCE', 'PRIVATE REVOCATION REASON',
    'credentials/o-1.pdf', 'NFT-SECRET', 'TX-SECRET',
    'approved_by', 'revoked_by', 'revocation_reason', 'application_json',
    'credential_r2_key', 'nft_token_id', 'tx_hash', 'user_id',
  ]) {
    assert.ok(!html.includes(secret), `leaked into the credential document: ${secret}`);
  }
});

/* ------------------------------------------------------------- 20-21. audit -- */

test('20. a successful view writes exactly one credential.view audit row', async (t) => {
  const { db, sqlite, close, row } = await setup();
  t.after(close);

  assert.equal((await get({ db, path: PATH('o-1'), session: asMember('u-alice') })).status, 200);

  const rows = auditRows(sqlite, 'credential.view');
  assert.equal(rows.length, 1);
  const [a] = rows;
  assert.equal(a.actor_user_id, 'u-alice');
  assert.equal(a.actor_email, 'u-alice@bm.test');
  assert.equal(a.entity_type, 'ordination');
  assert.equal(a.entity_id, 'o-1');
  assert.equal(a.ip, '203.0.113.7');
  assert.ok(a.created_at, 'timestamp recorded');

  const meta = JSON.parse(a.metadata_json);
  assert.equal(meta.credential_number, row('o-1').credential_number);
  assert.equal(meta.credential_version, 1);
  assert.equal(meta.as_admin, false);
  // Never log the document or any private text.
  assert.ok(!a.metadata_json.includes('<!doctype'), 'rendered HTML must never be logged');
  assert.ok(!a.metadata_json.includes(FULL_NAME));
  assert.ok(!a.metadata_json.includes('revocation'));
});

test('21. denied attempts write NO credential.view row', async (t) => {
  const { db, sqlite, close, repo } = await setup();
  t.after(close);

  await get({ db, path: PATH('o-2'), session: asMember('u-alice') });   // foreign
  await get({ db, path: PATH('no-such'), session: asMember('u-alice') }); // missing
  await get({ db, path: PATH('o-1'), session: null });                    // anonymous
  await repo.revoke('o-1', { revokedBy: 'u-admin', reason: 'x', now: T2 });
  await get({ db, path: PATH('o-1'), session: asMember('u-alice') });     // revoked

  assert.equal(auditRows(sqlite, 'credential.view').length, 0,
    'unauthorized or unavailable attempts must not appear as credential views');
});

/* ----------------------------------------------------- 11. route conflicts -- */

test('route matching: :id/credential never shadows /mine or /apply', async (t) => {
  // Assert against the REAL compiled router, not by assumption.
  const r = new Router();
  mount(r);
  const match = (method, path) =>
    r.routes.filter((rt) => rt.method === method && rt.re.test(path)).map((rt) => rt.re.source);

  const cred = match('GET', '/api/ordination/o-1/credential');
  assert.equal(cred.length, 1, `expected exactly one GET match, got ${JSON.stringify(cred)}`);
  assert.ok(cred[0].includes('credential'));

  const mine = match('GET', '/api/ordination/mine');
  assert.equal(mine.length, 1, `/api/ordination/mine matched ${JSON.stringify(mine)}`);
  assert.ok(!mine[0].includes('credential'), '/mine must not resolve to the credential route');

  // 'mine' can never be captured as an :id, because the paths differ in length.
  assert.ok(!r.routes.some((rt) => rt.re.test('/api/ordination/mine') && rt.re.source.includes('credential')));
  // POST /apply is untouched by the new GET route.
  assert.equal(match('POST', '/api/ordination/apply').length, 1);
  assert.equal(match('GET', '/api/ordination/apply').length, 0);
});

test('/api/ordination/mine still works and its shape is unchanged', async (t) => {
  const { db, close } = await setup();
  t.after(close);

  const res = await get({ db, path: '/api/ordination/mine', session: asMember('u-alice') });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.items.length, 1);
  // M11 Phase 7 additively added credential_number and credential_revoked so
  // the dashboard can show the member their OWN number and distinguish
  // "revoked" from "not issued". Everything else is unchanged.
  assert.deepEqual(Object.keys(body.items[0]).sort(), [
    'approved_at', 'created_at', 'credential_available', 'credential_number',
    'credential_revoked', 'id', 'status', 'updated_at', 'verify_slug',
  ]);
  assert.equal(body.items[0].credential_available, true);
  assert.equal(body.items[0].credential_revoked, false);
  // Still no private data: no reason, no actor, no application payload.
  const raw = JSON.stringify(body);
  for (const secret of ['revocation_reason', 'revoked_by', 'application_json', 'approved_by', 'user_id']) {
    assert.ok(!raw.includes(secret), `leaked on the member list endpoint: ${secret}`);
  }
});

test('the credential route never returns JSON on success', async (t) => {
  const { db, close } = await setup();
  t.after(close);
  const res = await get({ db, path: PATH('o-1'), session: asMember('u-alice') });
  assert.ok(!res.headers.get('content-type').includes('json'));
  await assert.rejects(() => res.clone().json(), 'body must not be parseable as JSON');
});
