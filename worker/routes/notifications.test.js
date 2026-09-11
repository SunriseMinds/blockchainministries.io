/**
 * M13 Phase 2 — operational notifications and failure safety.
 *
 * THE INVARIANT UNDER TEST: email is a side effect, never transactional
 * authority. Once a business row is committed, no delivery failure — provider
 * rejection, thrown config error, or missing ADMIN_NOTIFY_EMAIL — may make the
 * submission look like it failed.
 *
 * Exercised through the REAL Resend path with globalThis.fetch stubbed, so
 * template content and the privacy boundary are tested against production
 * code. No real email is ever sent.
 *
 * Run: node --test worker/routes/notifications.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '@reellink/api/router.js';
import { freshDb, seedUser, seedOrdination } from '../../test/helpers/d1.mjs';
import { PROD_FLAGS, asMember, auditRows } from '../../test/helpers/route.mjs';
import { mount } from './public.js';

let cached = null;
function router() {
  if (!cached) { cached = new Router(); mount(cached); }
  return cached;
}

/** mode: ok | error (provider 5xx) | throw (transport/config failure). */
function stubEmail({ mode = 'ok' } = {}) {
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    sent.push({ url: String(url), body: JSON.parse(init.body) });
    if (mode === 'throw') throw new Error('resend unreachable');
    if (mode === 'error') return new Response('nope', { status: 500 });
    return new Response(JSON.stringify({ id: 'msg_1' }), { status: 200 });
  };
  return {
    sent,
    to(addr) { return sent.filter(m => m.body.to?.includes(addr)); },
    restore() { globalThis.fetch = original; },
  };
}

const ADMIN_INBOX = 'ops@bm.test';

function env(extra = {}) {
  return {
    SITE_URL: 'https://blockchainministries.io',
    EMAIL_PROVIDER: 'resend',
    EMAIL_API_KEY: 'test-key',
    EMAIL_FROM: 'contact@blockchainministries.io',
    ADMIN_NOTIFY_EMAIL: ADMIN_INBOX,
    ...extra,
  };
}

async function call({ db, path, session = null, body, extraEnv = {}, turnstile = false }) {
  const url = new URL(`https://blockchainministries.io${path}`);
  const request = new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://blockchainministries.io', 'CF-Connecting-IP': '203.0.113.20' },
    body: JSON.stringify(body ?? {}),
  });
  return router().handle({
    request, url,
    env: { DB: db, ...env(extraEnv) },
    flags: { ...PROD_FLAGS, USE_TURNSTILE: turnstile },
    session, sessionLoaded: true,
  });
}

function setup() {
  const { db, sqlite, close } = freshDb();
  seedUser(sqlite, { id: 'u-alice', email: 'u-alice@bm.test' });
  return { db, sqlite, close };
}

const ORD_BODY = { fullName: 'Jordan Alexis Rivers', reason: 'PRIVATE CALLING NARRATIVE', experience: 'PRIVATE EXPERIENCE NARRATIVE' };
const MEM_BODY = { displayName: 'Jordan Rivers' };
const SCROLL_BODY = { name: 'Pat Requester', email: 'pat@example.invalid', request_type: 'Diplomatic Credentials', message: 'PRIVATE SCROLL MESSAGE' };
const CONTACT_BODY = { name: 'Sam Visitor', email: 'sam@example.invalid', message: 'PRIVATE CONTACT MESSAGE', inquiry_type: 'General' };
const CONSULT_BODY = { name: 'Lee Seeker', email: 'lee@example.invalid', topic: 'Guidance' };

const adminMail = (e) => e.to(ADMIN_INBOX);
const count = (sqlite, table) => sqlite.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c;

/* ============================================================ ORDINATION == */

test('1-3. ordination: one admin notification with name, date and review URL', async (t) => {
  const { db, sqlite, close } = setup();
  const e = stubEmail(); t.after(() => { e.restore(); close(); });

  const res = await call({ db, path: '/api/ordination/apply', session: asMember('u-alice'), body: ORD_BODY });
  assert.equal(res.status, 201);

  const admin = adminMail(e);
  assert.equal(admin.length, 1, 'exactly one admin notification');
  const m = admin[0].body;
  assert.equal(m.subject, 'New ordination application — Blockchain Ministries');
  assert.ok(m.text.includes('Jordan Alexis Rivers'), 'applicant name');
  assert.match(m.text, /Submitted: \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/, 'submission time');
  assert.ok(m.text.includes('https://blockchainministries.io/admin/management'), 'review URL');

  // 2. applicant confirmation still sent, separately
  const applicant = e.to('u-alice@bm.test');
  assert.equal(applicant.length, 1, 'applicant confirmation preserved');
  assert.match(applicant[0].body.subject, /received/i);
});

test('4-6. ordination admin email leaks no narrative, auth or credential data', async (t) => {
  const { db, close } = setup();
  const e = stubEmail(); t.after(() => { e.restore(); close(); });

  await call({ db, path: '/api/ordination/apply', session: asMember('u-alice'), body: ORD_BODY });
  const text = JSON.stringify(adminMail(e)[0].body);

  for (const secret of [
    'PRIVATE CALLING NARRATIVE',   // 4. reason
    'PRIVATE EXPERIENCE NARRATIVE', // 5. experience
    'u-alice',                      // user id
    'bm_session', 'test-key', 'token', 'BM-',
  ]) {
    assert.ok(!text.includes(secret), `leaked into admin email: ${secret}`);
  }
});

for (const mode of ['error', 'throw']) {
  test(`7-8. ordination persists and returns 201 when admin notification ${mode}s`, async (t) => {
    const { db, sqlite, close } = setup();
    const e = stubEmail({ mode }); t.after(() => { e.restore(); close(); });

    const res = await call({ db, path: '/api/ordination/apply', session: asMember('u-alice'), body: ORD_BODY });
    assert.equal(res.status, 201, `must not surface the ${mode} as a failed submission`);
    assert.equal((await res.json()).ok, true);
    assert.equal(count(sqlite, 'ordinations'), 1, 'application must remain persisted');
    assert.equal(auditRows(sqlite, 'ordination.apply').length, 1, 'business audit must remain');
    assert.ok(auditRows(sqlite, 'notify.failed').length >= 1, 'failure must be recorded');
  });
}

test('9-10. missing ADMIN_NOTIFY_EMAIL: submission succeeds, failure is audited', async (t) => {
  const { db, sqlite, close } = setup();
  const e = stubEmail(); t.after(() => { e.restore(); close(); });

  const res = await call({
    db, path: '/api/ordination/apply', session: asMember('u-alice'), body: ORD_BODY,
    extraEnv: { ADMIN_NOTIFY_EMAIL: undefined },
  });
  assert.equal(res.status, 201);
  assert.equal(count(sqlite, 'ordinations'), 1);
  assert.equal(adminMail(e).length, 0, 'nothing sent with no destination configured');
  assert.equal(e.to('u-alice@bm.test').length, 1, 'applicant confirmation still sent');

  const failed = auditRows(sqlite, 'notify.failed');
  assert.equal(failed.length, 1);
  const meta = JSON.parse(failed[0].metadata_json);
  assert.equal(meta.audience, 'admin');
  assert.equal(meta.kind, 'ordination_application');
  assert.match(meta.reason, /ADMIN_NOTIFY_EMAIL/);
});

test('malformed ADMIN_NOTIFY_EMAIL still cannot fail the submission', async (t) => {
  const { db, sqlite, close } = setup();
  const e = stubEmail({ mode: 'error' }); t.after(() => { e.restore(); close(); });

  const res = await call({
    db, path: '/api/ordination/apply', session: asMember('u-alice'), body: ORD_BODY,
    extraEnv: { ADMIN_NOTIFY_EMAIL: 'not-an-address' },
  });
  assert.equal(res.status, 201);
  assert.equal(count(sqlite, 'ordinations'), 1);
});

/* ============================================================ MEMBERSHIP == */

test('11-12. membership: one admin notification plus applicant confirmation', async (t) => {
  const { db, close } = setup();
  const e = stubEmail(); t.after(() => { e.restore(); close(); });

  const res = await call({ db, path: '/api/membership/apply', session: asMember('u-alice'), body: MEM_BODY });
  assert.equal(res.status, 201);

  const admin = adminMail(e);
  assert.equal(admin.length, 1);
  assert.equal(admin[0].body.subject, 'New membership application — Blockchain Ministries');
  assert.ok(admin[0].body.text.includes('Jordan Rivers'));
  assert.ok(admin[0].body.text.includes('/admin/management'));
  assert.equal(e.to('u-alice@bm.test').length, 1, 'applicant confirmation preserved');
});

for (const mode of ['error', 'throw']) {
  test(`13-15. membership persists when notification ${mode}s`, async (t) => {
    const { db, sqlite, close } = setup();
    const e = stubEmail({ mode }); t.after(() => { e.restore(); close(); });

    const res = await call({ db, path: '/api/membership/apply', session: asMember('u-alice'), body: MEM_BODY });
    assert.equal(res.status, 201);
    assert.equal(count(sqlite, 'memberships'), 1);
    assert.equal(auditRows(sqlite, 'membership.apply').length, 1);
    assert.ok(auditRows(sqlite, 'notify.failed').length >= 1);
  });
}

/* ========================================================= SCROLL REQUEST == */

test('16-17. scroll request notifies admin, without the message body', async (t) => {
  const { db, close } = setup();
  const e = stubEmail(); t.after(() => { e.restore(); close(); });

  const res = await call({ db, path: '/api/scrolls/requests', body: SCROLL_BODY });
  assert.equal(res.status, 201);

  const admin = adminMail(e);
  assert.equal(admin.length, 1, 'previously notified nobody; now exactly one');
  const m = admin[0].body;
  assert.equal(m.subject, 'New scroll request — Blockchain Ministries');
  assert.ok(m.text.includes('Pat Requester'));
  assert.ok(m.text.includes('Request type: Diplomatic Credentials'), 'safe short label is useful for triage');
  assert.ok(!m.text.includes('PRIVATE SCROLL MESSAGE'), 'request body must stay in the record');
});

for (const mode of ['error', 'throw']) {
  test(`18-19. scroll request persists when notification ${mode}s`, async (t) => {
    const { db, sqlite, close } = setup();
    const e = stubEmail({ mode }); t.after(() => { e.restore(); close(); });

    const res = await call({ db, path: '/api/scrolls/requests', body: SCROLL_BODY });
    assert.equal(res.status, 201);
    assert.equal(count(sqlite, 'scroll_requests'), 1);
    assert.equal(auditRows(sqlite, 'scroll_request.submit').length, 1);
    assert.ok(auditRows(sqlite, 'notify.failed').length >= 1);
  });
}

/* =============================================================== CONTACT == */

test('20. contact still notifies the operations inbox', async (t) => {
  const { db, close } = setup();
  const e = stubEmail(); t.after(() => { e.restore(); close(); });

  const res = await call({ db, path: '/api/contact', body: CONTACT_BODY });
  assert.equal(res.status, 201);
  const admin = adminMail(e);
  assert.equal(admin.length, 1);
  assert.equal(admin[0].body.subject, 'New contact inquiry — Blockchain Ministries',
    'existing subject line preserved');
  assert.ok(!admin[0].body.text.includes('PRIVATE CONTACT MESSAGE'), 'message stays in the record');
});

test('21-24. REGRESSION: a thrown contact notification no longer 500s a persisted inquiry', async (t) => {
  const { db, sqlite, close } = setup();
  const e = stubEmail({ mode: 'throw' }); t.after(() => { e.restore(); close(); });

  const res = await call({ db, path: '/api/contact', body: CONTACT_BODY });

  // 21. the pre-M13 bug: HttpError from send() surfaced as 500 AFTER the insert
  assert.equal(res.status, 201, 'must not report failure for a committed inquiry');
  assert.equal((await res.json()).ok, true);
  assert.equal(count(sqlite, 'contact_inquiries'), 1, '22. inquiry remains persisted');
  assert.equal(auditRows(sqlite, 'contact.submit').length, 1, '23. business audit remains');
  assert.equal(auditRows(sqlite, 'notify.failed').length, 1, '24. failure audit recorded');
});

/* ========================================================== CONSULTATION == */

test('25-26. consultation notifies admin and confirms to the requester', async (t) => {
  const { db, close } = setup();
  const e = stubEmail(); t.after(() => { e.restore(); close(); });

  const res = await call({ db, path: '/api/consultations', body: CONSULT_BODY });
  assert.equal(res.status, 201);
  assert.equal(adminMail(e).length, 1);
  assert.equal(adminMail(e)[0].body.subject, 'New consultation request — Blockchain Ministries');
  assert.equal(e.to('lee@example.invalid').length, 1, 'requester confirmation preserved');
});

test('27-28. a thrown consultation notification does not fail the persisted request', async (t) => {
  const { db, sqlite, close } = setup();
  const e = stubEmail({ mode: 'throw' }); t.after(() => { e.restore(); close(); });

  const res = await call({ db, path: '/api/consultations', body: CONSULT_BODY });
  assert.equal(res.status, 201);
  assert.equal(count(sqlite, 'consultations'), 1);
  assert.equal(auditRows(sqlite, 'consultation.request').length, 1);
  // both the requester confirmation and the admin notification failed
  assert.equal(auditRows(sqlite, 'notify.failed').length, 2);
});

/* ================================================================ SAFETY == */

test('29-30. notify.failed metadata carries no body, narrative or secret', async (t) => {
  const { db, sqlite, close } = setup();
  const e = stubEmail({ mode: 'throw' }); t.after(() => { e.restore(); close(); });

  await call({ db, path: '/api/ordination/apply', session: asMember('u-alice'), body: ORD_BODY });

  for (const row of auditRows(sqlite, 'notify.failed')) {
    const raw = row.metadata_json;
    const meta = JSON.parse(raw);
    assert.deepEqual(Object.keys(meta).sort(), ['audience', 'kind', 'reason'],
      'metadata shape must stay minimal');
    for (const secret of [
      'PRIVATE CALLING NARRATIVE', 'PRIVATE EXPERIENCE NARRATIVE',
      'test-key', 'bm_session', 'Bearer', 'u-alice@bm.test',
      'A new ordination application', 'Review it in the admin dashboard',
    ]) {
      assert.ok(!raw.includes(secret), `notify.failed leaked: ${secret}`);
    }
    assert.ok(meta.reason.length <= 120, 'reason must be bounded');
  }
});

test('31. a failing audit while reporting a failure cannot break the request', async (t) => {
  const { db, sqlite, close } = setup();
  const e = stubEmail({ mode: 'throw' });
  t.after(() => { e.restore(); close(); });

  // Make the audit INSERT itself fail for the duration of the call.
  const realPrepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    if (sql.includes('INSERT INTO audit_logs')) throw new Error('audit backend down');
    return realPrepare(sql);
  };

  const res = await call({ db, path: '/api/ordination/apply', session: asMember('u-alice'), body: ORD_BODY });
  db.prepare = realPrepare;

  assert.equal(res.status, 201, 'a secondary audit failure must never surface');
  assert.equal(count(sqlite, 'ordinations'), 1, 'application still persisted');
});

test('32. no duplicate operational notification per submission', async (t) => {
  const { db, sqlite, close } = setup();
  const e = stubEmail(); t.after(() => { e.restore(); close(); });

  await call({ db, path: '/api/ordination/apply', session: asMember('u-alice'), body: ORD_BODY });
  assert.equal(adminMail(e).length, 1);

  // a duplicate application is rejected (409) and must notify nobody again
  const dup = await call({ db, path: '/api/ordination/apply', session: asMember('u-alice'), body: ORD_BODY });
  assert.equal(dup.status, 409);
  assert.equal(adminMail(e).length, 1, 'a rejected duplicate must not notify');
  assert.equal(count(sqlite, 'ordinations'), 1);
});

test('a failed submission (validation) notifies nobody', async (t) => {
  const { db, sqlite, close } = setup();
  const e = stubEmail(); t.after(() => { e.restore(); close(); });

  const res = await call({ db, path: '/api/ordination/apply', session: asMember('u-alice'), body: { reason: 'x' } });
  assert.equal(res.status, 400, 'missing fullName');
  assert.equal(e.sent.length, 0, 'nothing sent for a submission that never persisted');
  assert.equal(count(sqlite, 'ordinations'), 0);
  assert.equal(auditRows(sqlite, 'notify.failed').length, 0);
});

test('every operational email points at the configured site origin', async (t) => {
  const { db, close } = setup();
  const e = stubEmail(); t.after(() => { e.restore(); close(); });

  await call({
    db, path: '/api/ordination/apply', session: asMember('u-alice'), body: ORD_BODY,
    extraEnv: { SITE_URL: 'https://preview.example.test' },
  });
  assert.ok(adminMail(e)[0].body.text.includes('https://preview.example.test/admin/management'));
});
