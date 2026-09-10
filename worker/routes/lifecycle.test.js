/**
 * M11 Phase 6 — admin revoke / reissue routes, audit and member notification.
 *
 * Email is exercised through the REAL @reellink/email Resend path with
 * globalThis.fetch stubbed, so template content, the private-reason boundary
 * and failure semantics are all tested against production code rather than a
 * mock of it. No real email is ever sent.
 *
 * Run: node --test worker/routes/lifecycle.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '@reellink/api/router.js';
import { freshDb, seedUser, seedOrdination, readOrdination } from '../../test/helpers/d1.mjs';
import { PROD_FLAGS, asMember, asAdmin, auditRows } from '../../test/helpers/route.mjs';
import { mount as mountAdmin } from './admin.js';
import { mount as mountPublic } from './public.js';
import { ordinations } from '../db/repositories.js';

const T1 = '2026-03-01T10:00:00.000Z';
const REASON = 'Internal conduct review 2026-04';

let adminRouter = null;
function router() {
  if (!adminRouter) {
    adminRouter = new Router();
    mountAdmin(adminRouter);
    mountPublic(adminRouter); // for the credential-delivery cross-checks
  }
  return adminRouter;
}

/** Captured outbound email, with globalThis.fetch stubbed. */
function stubEmail({ mode = 'ok' } = {}) {
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    if (mode === 'throw') throw new Error('network down');
    if (mode === 'error') return new Response('nope', { status: 500 });
    return new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 });
  };
  return { sent, restore: () => { globalThis.fetch = original; } };
}

async function call({ db, method, path, session, body, env = {} }) {
  const url = new URL(`https://blockchainministries.io${path}`);
  const request = new Request(url, {
    method,
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const ctx = {
    request,
    url,
    env: {
      DB: db,
      SITE_URL: 'https://blockchainministries.io',
      EMAIL_PROVIDER: 'resend',
      EMAIL_API_KEY: 'test-key',
      EMAIL_FROM: 'contact@blockchainministries.io',
      ...env,
    },
    flags: { ...PROD_FLAGS },
    session,
    sessionLoaded: true,
  };
  return router().handle(ctx);
}

async function setup({ issue = true } = {}) {
  const { db, sqlite, close } = freshDb();
  seedUser(sqlite, { id: 'u-alice', email: 'u-alice@bm.test' });
  seedUser(sqlite, { id: 'u-admin', email: 'u-admin@bm.test', role: 'admin' });
  seedOrdination(sqlite, { id: 'o-1', userId: 'u-alice', fullName: 'Jordan Alexis Rivers' });

  const repo = ordinations(db);
  if (issue) await repo.approve('o-1', { approvedBy: 'u-admin', verifySlug: 'slug-alice', now: T1 });
  return { db, sqlite, close, repo, row: () => readOrdination(sqlite, 'o-1') };
}

const revoke = (o, reason = REASON) =>
  call({ ...o, method: 'POST', path: '/api/admin/ordinations/o-1/revoke', body: { reason } });
const reissue = (o) =>
  call({ ...o, method: 'POST', path: '/api/admin/ordinations/o-1/reissue', body: {} });

/* ================================================================ REVOKE == */

test('1 & 2. anonymous and ordinary members cannot revoke', async (t) => {
  const { db, sqlite, close, row } = await setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  assert.equal((await revoke({ db, session: null })).status, 401);
  assert.equal((await revoke({ db, session: asMember('u-alice') })).status, 403);

  assert.equal(row().revoked_at, null, 'credential must remain valid');
  assert.equal(auditRows(sqlite, 'credential.revoke').length, 0);
  assert.equal(email.sent.length, 0, 'no notification for a rejected attempt');
});

test('3. admin can revoke a valid credential', async (t) => {
  const { db, close, row } = await setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  const res = await revoke({ db, session: asAdmin('u-admin') });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.credential_number, row().credential_number);
  assert.equal(body.notification, 'sent');
  assert.ok(body.revoked_at);
  // the private reason must not come back through the admin response either
  assert.ok(!JSON.stringify(body).includes(REASON));

  const r = row();
  assert.equal(r.revoked_by, 'u-admin', 'revoked_by comes from the session');
  assert.equal(r.revocation_reason, REASON);
  assert.equal(r.status, 'approved', 'revocation is orthogonal to status');
});

test('4 & 5. blank and oversized reasons are rejected', async (t) => {
  const { db, sqlite, close, row } = await setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  // Bodies are built explicitly here — a default parameter would mask the
  // "reason entirely absent" case by substituting a valid one.
  const bodies = [
    {},                              // absent
    { reason: '' },                  // empty
    { reason: '   ' },               // whitespace only
    { reason: null },                // null
    { reason: 42 },                  // wrong type
    { reason: 'x'.repeat(1001) },    // oversized
  ];
  for (const body of bodies) {
    const res = await call({
      db, session: asAdmin('u-admin'), method: 'POST',
      path: '/api/admin/ordinations/o-1/revoke', body,
    });
    assert.equal(res.status, 400, `body ${JSON.stringify(body)} should be rejected`);
  }

  assert.equal(row().revoked_at, null);
  assert.equal(auditRows(sqlite, 'credential.revoke').length, 0);
  assert.equal(email.sent.length, 0);

  // ...and a reason at the limit is accepted.
  assert.equal((await revoke({ db, session: asAdmin('u-admin') }, 'x'.repeat(1000))).status, 200);
});

test('client-supplied revoked_by / revoked_at / identity fields are ignored', async (t) => {
  const { db, close, row } = await setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  const res = await call({
    db, session: asAdmin('u-admin'), method: 'POST',
    path: '/api/admin/ordinations/o-1/revoke',
    body: {
      reason: REASON,
      revoked_by: 'u-alice', revoked_at: '1999-01-01T00:00:00.000Z',
      user_id: 'u-alice', credential_number: 'BM-FORGED1', verify_slug: 'forged',
    },
  });
  assert.equal(res.status, 200);

  const r = row();
  assert.equal(r.revoked_by, 'u-admin', 'revoked_by must come from the session');
  assert.notEqual(r.revoked_at, '1999-01-01T00:00:00.000Z');
  assert.notEqual(r.credential_number, 'BM-FORGED1');
  assert.equal(r.verify_slug, 'slug-alice');
  assert.equal(r.user_id, 'u-alice');
});

test('6. an unissued credential cannot be revoked', async (t) => {
  const { db, sqlite, close } = await setup({ issue: false });
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  const res = await revoke({ db, session: asAdmin('u-admin') });
  assert.equal(res.status, 409);
  assert.match((await res.json()).error.message, /no issued credential/);
  assert.equal(auditRows(sqlite, 'credential.revoke').length, 0);
  assert.equal(email.sent.length, 0);
});

test('non-existent ordination -> 404', async (t) => {
  const { db, close } = await setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  const res = await call({
    db, session: asAdmin('u-admin'), method: 'POST',
    path: '/api/admin/ordinations/nope/revoke', body: { reason: REASON },
  });
  assert.equal(res.status, 404);
});

test('7. a duplicate revoke is a conflict and does not overwrite the original', async (t) => {
  const { db, sqlite, close, row } = await setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  assert.equal((await revoke({ db, session: asAdmin('u-admin') })).status, 200);
  const first = row();

  seedUser(sqlite, { id: 'u-admin2', email: 'u-admin2@bm.test', role: 'admin' });
  const second = await revoke({ db, session: asAdmin('u-admin2') }, 'A DIFFERENT REASON');
  assert.equal(second.status, 409);
  assert.match((await second.json()).error.message, /already revoked/);

  const after = row();
  assert.equal(after.revoked_at, first.revoked_at);
  assert.equal(after.revoked_by, 'u-admin');
  assert.equal(after.revocation_reason, REASON, 'original reason preserved');
  assert.equal(auditRows(sqlite, 'credential.revoke').length, 1);
  assert.equal(email.sent.length, 1, 'no additional notification for a duplicate revoke');
});

test('8. credential delivery returns 404 immediately after revoke', async (t) => {
  const { db, close } = await setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  const path = '/api/ordination/o-1/credential';
  assert.equal((await call({ db, method: 'GET', path, session: asMember('u-alice') })).status, 200);
  await revoke({ db, session: asAdmin('u-admin') });
  assert.equal((await call({ db, method: 'GET', path, session: asMember('u-alice') })).status, 404);
});

test('9 & 10. audit is written on success only, and carries the private reason', async (t) => {
  const { db, sqlite, close, row } = await setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  await revoke({ db, session: asAdmin('u-admin') });

  const rows = auditRows(sqlite, 'credential.revoke');
  assert.equal(rows.length, 1);
  const [a] = rows;
  assert.equal(a.actor_user_id, 'u-admin');
  assert.equal(a.entity_type, 'ordination');
  assert.equal(a.entity_id, 'o-1');
  const meta = JSON.parse(a.metadata_json);
  assert.equal(meta.credential_number, row().credential_number);
  assert.equal(meta.credential_version, 1);
  assert.equal(meta.reason, REASON, 'the private reason belongs in the admin-only audit log');
  assert.ok(meta.revoked_at);
});

/* =============================================================== REISSUE == */

test('11 & 14-17. admin reissue restores the credential and preserves identity', async (t) => {
  const { db, close, row } = await setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  const issued = row();
  await revoke({ db, session: asAdmin('u-admin') });

  const res = await reissue({ db, session: asAdmin('u-admin') });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.credential_version, 2);
  assert.equal(body.notification, 'sent');

  const r = row();
  assert.equal(r.credential_number, issued.credential_number, '14. number preserved');
  assert.equal(r.verify_slug, 'slug-alice', '15. slug preserved');
  assert.equal(r.approved_at, T1, '16. original ordination date preserved');
  assert.equal(r.approved_by, 'u-admin');
  assert.equal(r.status, 'approved');
  assert.equal(r.credential_version, 2, '17. version incremented');
  assert.equal(r.revoked_at, null);
  assert.equal(r.revoked_by, null);
  assert.equal(r.revocation_reason, null);
  assert.notEqual(r.issued_at, T1, 'issued_at moves to the reissue time');
});

test('12 & 13. reissue rejects unissued and non-revoked credentials', async (t) => {
  const unissued = await setup({ issue: false });
  const e1 = stubEmail();
  const r1 = await reissue({ db: unissued.db, session: asAdmin('u-admin') });
  assert.equal(r1.status, 409);
  assert.match((await r1.json()).error.message, /no issued credential/);
  assert.equal(unissued.row().credential_version, 0, 'must not manufacture a credential');
  e1.restore(); unissued.close();

  const valid = await setup();
  const e2 = stubEmail();
  const r2 = await reissue({ db: valid.db, session: asAdmin('u-admin') });
  assert.equal(r2.status, 409);
  assert.match((await r2.json()).error.message, /not revoked/);
  assert.equal(valid.row().credential_version, 1, 'must not bump a live credential');
  assert.equal(e2.sent.length, 0);
  e2.restore(); valid.close();
});

test('reissue is admin-only', async (t) => {
  const { db, close } = await setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });
  await revoke({ db, session: asAdmin('u-admin') });

  assert.equal((await reissue({ db, session: null })).status, 401);
  assert.equal((await reissue({ db, session: asMember('u-alice') })).status, 403);
});

test('18 & 19. delivery becomes available again and reissue is audited', async (t) => {
  const { db, sqlite, close, row } = await setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  const path = '/api/ordination/o-1/credential';
  await revoke({ db, session: asAdmin('u-admin') });
  assert.equal((await call({ db, method: 'GET', path, session: asMember('u-alice') })).status, 404);

  await reissue({ db, session: asAdmin('u-admin') });
  assert.equal((await call({ db, method: 'GET', path, session: asMember('u-alice') })).status, 200);

  const rows = auditRows(sqlite, 'credential.reissue');
  assert.equal(rows.length, 1);
  const meta = JSON.parse(rows[0].metadata_json);
  assert.equal(meta.credential_number, row().credential_number);
  assert.equal(meta.credential_version, 2);
  assert.ok(!('reason' in meta), 'obsolete revocation reason must not appear in reissue metadata');
  assert.ok(!rows[0].metadata_json.includes(REASON));
});

/* ================================================================= EMAIL == */

test('39 & 40. revoke sends exactly one notification, WITHOUT the private reason', async (t) => {
  const { db, close, row } = await setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  await revoke({ db, session: asAdmin('u-admin') });

  assert.equal(email.sent.length, 1);
  const [msg] = email.sent;
  assert.equal(msg.url, 'https://api.resend.com/emails');
  assert.deepEqual(msg.body.to, ['u-alice@bm.test']);
  assert.match(msg.body.subject, /revoked/i);

  const text = msg.body.text;
  assert.ok(text.includes(row().credential_number), 'credential number should be present');
  assert.ok(/revoked/i.test(text));
  assert.ok(text.includes('contact@blockchainministries.io'));
  // THE boundary: reason never leaves the ministry.
  assert.ok(!text.includes(REASON), 'private revocation reason leaked into member email');
  assert.ok(!/conduct/i.test(text));
  assert.ok(!text.includes('u-admin'), 'admin identity must not be disclosed');
});

test('41. an email failure does NOT roll back the revocation', async (t) => {
  for (const mode of ['error', 'throw']) {
    const { db, sqlite, close, row } = await setup();
    const email = stubEmail({ mode });

    const res = await revoke({ db, session: asAdmin('u-admin') });
    assert.equal(res.status, 200, `revoke should still succeed when email ${mode}s`);
    assert.equal((await res.json()).notification, 'failed');

    const r = row();
    assert.ok(r.revoked_at, `credential must stay revoked when email ${mode}s`);
    assert.equal(r.revocation_reason, REASON);
    // the transition is audited, and the delivery failure is recorded too
    assert.equal(auditRows(sqlite, 'credential.revoke').length, 1);
    assert.equal(auditRows(sqlite, 'credential.notify_failed').length, 1);

    email.restore();
    close();
  }
});

test('42 & 43. reissue sends one notification that does NOT claim a new ordination date', async (t) => {
  const { db, close, row } = await setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  await revoke({ db, session: asAdmin('u-admin') });
  email.sent.length = 0; // ignore the revocation email

  await reissue({ db, session: asAdmin('u-admin') });

  assert.equal(email.sent.length, 1);
  const text = email.sent[0].text ?? email.sent[0].body.text;
  assert.match(email.sent[0].body.subject, /reissued/i);
  assert.ok(text.includes(row().credential_number));
  // approved_at (2026-03-01), never the new issued_at.
  assert.ok(text.includes('2026-03-01'), 'must show the ORIGINAL date of ordination');
  assert.ok(/unchanged/i.test(text), 'must state the ordination date is unchanged');
  assert.ok(!/newly ordained|new ordination|re-ordain/i.test(text));
  assert.ok(!text.includes(REASON));
});

test('a revoked member whose email fails is still blocked from their credential', async (t) => {
  const { db, close } = await setup();
  const email = stubEmail({ mode: 'throw' });
  t.after(() => { email.restore(); close(); });

  await revoke({ db, session: asAdmin('u-admin') });
  const res = await call({
    db, method: 'GET', path: '/api/ordination/o-1/credential', session: asMember('u-alice'),
  });
  assert.equal(res.status, 404, 'availability must never depend on email delivery');
});
