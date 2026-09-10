/**
 * M11 Phase 7 — approval issues a credential AND notifies the member.
 *
 * Email goes through the real Resend path with globalThis.fetch stubbed.
 * No real email is sent.
 *
 * Run: node --test worker/routes/issuance.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '@reellink/api/router.js';
import { freshDb, seedUser, seedOrdination, readOrdination } from '../../test/helpers/d1.mjs';
import { PROD_FLAGS, asAdmin, auditRows } from '../../test/helpers/route.mjs';
import { mount as mountAdmin } from './admin.js';
import { mount as mountPublic } from './public.js';

let cached = null;
function router() {
  if (!cached) { cached = new Router(); mountAdmin(cached); mountPublic(cached); }
  return cached;
}

function stubEmail({ mode = 'ok' } = {}) {
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    if (mode === 'throw') throw new Error('resend unreachable');
    if (mode === 'error') return new Response('nope', { status: 500 });
    return new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 });
  };
  return { sent, restore: () => { globalThis.fetch = original; } };
}

async function call({ db, method, path, session, body }) {
  const url = new URL(`https://blockchainministries.io${path}`);
  return router().handle({
    request: new Request(url, {
      method,
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.5' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    url,
    env: {
      DB: db,
      SITE_URL: 'https://blockchainministries.io',
      EMAIL_PROVIDER: 'resend',
      EMAIL_API_KEY: 'test-key',
      EMAIL_FROM: 'contact@blockchainministries.io',
    },
    flags: { ...PROD_FLAGS },
    session,
    sessionLoaded: true,
  });
}

function setup() {
  const { db, sqlite, close } = freshDb();
  seedUser(sqlite, { id: 'u-alice', email: 'u-alice@bm.test' });
  seedUser(sqlite, { id: 'u-admin', email: 'u-admin@bm.test', role: 'admin' });
  seedOrdination(sqlite, { id: 'o-1', userId: 'u-alice', fullName: 'TEST Minister' });
  return { db, sqlite, close, row: () => readOrdination(sqlite, 'o-1') };
}

const approve = (db) =>
  call({ db, method: 'POST', path: '/api/admin/ordinations/o-1/approve', session: asAdmin('u-admin'), body: {} });

test('approval issues the credential and reports it in the response', async (t) => {
  const { db, close, row } = setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  const res = await approve(db);
  assert.equal(res.status, 200);
  const body = await res.json();

  assert.equal(body.ok, true);
  assert.match(body.credential_number, /^BM-[A-Z0-9]{8}$/);
  assert.equal(body.notification, 'sent');

  const r = row();
  assert.equal(r.credential_number, body.credential_number);
  assert.equal(r.credential_version, 1);
  assert.ok(r.issued_at);
});

test('approval sends exactly one notification, with number and ORIGINAL ordination date', async (t) => {
  const { db, close, row } = setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  await approve(db);

  assert.equal(email.sent.length, 1, 'exactly one notification');
  const msg = email.sent[0].body;
  assert.deepEqual(msg.to, ['u-alice@bm.test']);
  assert.match(msg.subject, /approved/i);

  const text = msg.text;
  assert.ok(text.includes(row().credential_number), 'credential number missing');
  assert.ok(/date of ordination/i.test(text), 'ordination date label missing');
  assert.ok(text.includes(row().approved_at.slice(0, 10)), 'must show approved_at as the ordination date');
  assert.ok(text.includes('/dashboard'), 'must say how to access it');
  assert.ok(text.includes(`/verify/${row().verify_slug}`), 'must say how to verify it');
  assert.ok(/save as pdf/i.test(text), 'should explain browser print-to-PDF');
});

test('the issuance email carries NO attachment and no R2/PDF reference', async (t) => {
  const { db, close } = setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  await approve(db);
  const msg = email.sent[0].body;

  assert.ok(!('attachments' in msg), 'no attachment may be sent');
  assert.ok(!('attachment' in msg));
  // Plain text only — the outbound payload carries nothing else. (`html` is
  // undefined and therefore absent from the serialized body entirely.)
  assert.deepEqual(Object.keys(msg).sort(), ['from', 'subject', 'text', 'to']);
  assert.equal(msg.html, undefined);
  assert.ok(!/\.pdf\b/i.test(msg.text), 'must not reference a PDF file');
  assert.ok(!/\br2\b|bucket/i.test(msg.text), 'must not reference object storage');
});

test('the issuance email never presents issued_at as a new ordination date', async (t) => {
  const { db, sqlite, close } = setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  await approve(db);
  const text = email.sent[0].body.text;
  const r = readOrdination(sqlite, 'o-1');

  // approved_at and issued_at coincide on FIRST issuance, so assert the label
  // semantics instead: exactly one date is presented, as Date of Ordination.
  assert.equal((text.match(/Date of Ordination/g) || []).length, 1);
  assert.ok(!/issued on|issue date|reissued/i.test(text));
  assert.ok(r.approved_at);
});

test('email failure does NOT roll back approval or issuance', async (t) => {
  for (const mode of ['error', 'throw']) {
    const { db, sqlite, close, row } = setup();
    const email = stubEmail({ mode });

    const res = await approve(db);
    assert.equal(res.status, 200, `approval must succeed when email ${mode}s`);
    assert.equal((await res.json()).notification, 'failed');

    const r = row();
    assert.equal(r.status, 'approved', `must stay approved when email ${mode}s`);
    assert.match(r.credential_number, /^BM-[A-Z0-9]{8}$/, 'credential must still be issued');
    assert.equal(r.credential_version, 1);
    assert.ok(r.issued_at);

    assert.equal(auditRows(sqlite, 'ordination.approve').length, 1);
    assert.equal(auditRows(sqlite, 'credential.notify_failed').length, 1);

    email.restore();
    close();
  }
});

test('the credential is immediately viewable after approval, even if email failed', async (t) => {
  const { db, close } = setup();
  const email = stubEmail({ mode: 'throw' });
  t.after(() => { email.restore(); close(); });

  await approve(db);
  const res = await call({
    db, method: 'GET', path: '/api/ordination/o-1/credential',
    session: { user_id: 'u-alice', email: 'u-alice@bm.test', role: 'member', email_verified: 1 },
  });
  assert.equal(res.status, 200);
  assert.ok((await res.text()).includes('TEST Minister'));
});

test('approval audit records the issued credential', async (t) => {
  const { db, sqlite, close, row } = setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  await approve(db);
  const [a] = auditRows(sqlite, 'ordination.approve');
  const meta = JSON.parse(a.metadata_json);
  assert.equal(meta.credential_number, row().credential_number);
  assert.equal(meta.credential_version, 1);
  assert.equal(meta.verify_slug, row().verify_slug);
});

test('a replayed approval issues nothing twice and sends no second email', async (t) => {
  const { db, close, row } = setup();
  const email = stubEmail();
  t.after(() => { email.restore(); close(); });

  await approve(db);
  const first = row();
  const second = await approve(db);

  assert.equal(second.status, 409);
  assert.equal(email.sent.length, 1, 'no duplicate notification');
  assert.equal(row().credential_number, first.credential_number);
  assert.equal(row().credential_version, 1);
});
