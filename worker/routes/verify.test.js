/**
 * M11 Phase 6 — public verification lifecycle (VALID / REVOKED / NOT FOUND).
 *
 * The security-critical property: a revoked credential must resolve publicly
 * and say REVOKED, never appear valid and never 404 into ambiguity.
 *
 * Run: node --test worker/routes/verify.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedUser, seedOrdination, readOrdination } from '../../test/helpers/d1.mjs';
import { get } from '../../test/helpers/route.mjs';
import { ordinations } from '../db/repositories.js';

const T1 = '2026-03-01T10:00:00.000Z';
const T2 = '2026-04-15T09:00:00.000Z';
const FULL_NAME = 'Jordan Alexis Rivers';
const REASON = 'PRIVATE INTERNAL REASON';

async function setup({ issue = true, status = 'pending' } = {}) {
  const { db, sqlite, close } = freshDb();
  seedUser(sqlite, { id: 'u-alice', email: 'u-alice@bm.test' });
  seedUser(sqlite, { id: 'u-admin', email: 'u-admin@bm.test', role: 'admin' });
  sqlite.prepare("UPDATE users SET display_name='WRONG DISPLAY NAME' WHERE id='u-alice'").run();
  seedOrdination(sqlite, { id: 'o-1', userId: 'u-alice', fullName: FULL_NAME, status });

  const repo = ordinations(db);
  if (issue) await repo.approve('o-1', { approvedBy: 'u-admin', verifySlug: 'slug-alice', now: T1 });
  return { db, sqlite, close, repo, row: () => readOrdination(sqlite, 'o-1') };
}

/** Public verification is anonymous by definition. */
const verify = (db, slug = 'slug-alice') => get({ db, path: `/api/verify/${slug}`, session: null });

/* --------------------------------------------------------------- 20. VALID -- */

test('20 & 32. a valid issued credential verifies as VALID with the original ordination date', async (t) => {
  const { db, close, row } = await setup();
  t.after(close);

  const res = await verify(db);
  assert.equal(res.status, 200);
  const { type, data } = await res.json();

  assert.equal(type, 'ordination');
  assert.equal(data.verified, true);
  assert.equal(data.credential_status, 'valid');
  assert.equal(data.full_name, FULL_NAME);
  assert.equal(data.credential_number, row().credential_number);
  assert.equal(data.designation, 'Ordained Minister');
  assert.equal(data.date_of_ordination, T1, '32. must be approved_at');
  assert.equal(data.verify_slug, 'slug-alice');
  assert.ok(!('revoked_at' in data), 'a valid credential carries no revocation date');
});

/* ------------------------------------------------------------- 21-22. REVOKED -- */

test('21 & 22. a revoked credential resolves 200 and says REVOKED — it must NOT 404', async (t) => {
  const { db, close, repo, row } = await setup();
  t.after(close);

  await repo.revoke('o-1', { revokedBy: 'u-admin', reason: REASON, now: T2 });

  const res = await verify(db);
  assert.equal(res.status, 200, '22. an old printed QR must still resolve');
  const { data } = await res.json();

  assert.equal(data.verified, false);
  assert.equal(data.credential_status, 'revoked');
  assert.equal(data.revoked_at, T2, 'the public may know WHEN');
  // still identifiable, so the scanner knows which credential was revoked
  assert.equal(data.full_name, FULL_NAME);
  assert.equal(data.credential_number, row().credential_number);
  assert.equal(data.designation, 'Ordained Minister');
  assert.equal(data.date_of_ordination, T1);
});

test('30 & 31. the revoked response never carries revocation_reason or revoked_by', async (t) => {
  const { db, close, repo } = await setup();
  t.after(close);

  await repo.revoke('o-1', { revokedBy: 'u-admin', reason: REASON, now: T2 });
  const raw = await (await verify(db)).text();

  assert.ok(!raw.includes(REASON), 'private revocation reason leaked publicly');
  assert.ok(!raw.includes('revocation_reason'));
  assert.ok(!raw.includes('revoked_by'));
  assert.ok(!raw.includes('u-admin'), 'admin identity leaked publicly');
});

test('33. reissue flips public state REVOKED -> VALID without changing identity', async (t) => {
  const { db, close, repo } = await setup();
  t.after(close);

  const before = (await (await verify(db)).json()).data;
  await repo.revoke('o-1', { revokedBy: 'u-admin', reason: REASON, now: T2 });
  const revoked = (await (await verify(db)).json()).data;
  await repo.reissue('o-1', { now: '2026-06-01T00:00:00.000Z' });
  const after = (await (await verify(db)).json()).data;

  assert.equal(revoked.credential_status, 'revoked');
  assert.equal(after.credential_status, 'valid');
  assert.equal(after.verified, true);
  assert.ok(!('revoked_at' in after), 'revocation date must clear on reissue');

  assert.equal(after.credential_number, before.credential_number, 'number unchanged');
  assert.equal(after.verify_slug, before.verify_slug, 'slug unchanged');
  assert.equal(after.date_of_ordination, T1, 'ordination date unchanged by reissue');
});

/* --------------------------------------------------- 23-26. not verifiable -- */

test('23. unknown slug -> 404', async (t) => {
  const { db, close } = await setup();
  t.after(close);
  assert.equal((await verify(db, 'no-such-slug')).status, 404);
});

test('24 & 25. pending and rejected ordinations are not publicly verifiable', async (t) => {
  const pending = await setup({ issue: false });
  // A slug is only ever assigned at approval, but assert defensively.
  pending.sqlite.prepare("UPDATE ordinations SET verify_slug='slug-alice' WHERE id='o-1'").run();
  assert.equal((await verify(pending.db)).status, 404, 'pending must not verify');
  pending.close();

  const rejected = await setup({ issue: false });
  await rejected.repo.reject('o-1', { approvedBy: 'u-admin' });
  rejected.sqlite.prepare("UPDATE ordinations SET verify_slug='slug-alice' WHERE id='o-1'").run();
  assert.equal((await verify(rejected.db)).status, 404, 'rejected must not verify');
  rejected.close();
});

test('26. an approved pre-M11 row with issued_at NULL is NOT a credential', async (t) => {
  const { db, sqlite, close } = await setup({ issue: false });
  t.after(close);

  // Exactly the shape of every legacy production row.
  sqlite.prepare(
    "UPDATE ordinations SET status='approved', approved_at=?, verify_slug='slug-alice' WHERE id='o-1'",
  ).run(T1);
  const r = readOrdination(sqlite, 'o-1');
  assert.equal(r.status, 'approved');
  assert.equal(r.issued_at, null);

  assert.equal((await verify(db)).status, 404, 'approval alone must not verify as a credential');
});

/* ----------------------------------------------------- 27-28. name integrity -- */

test('27. malformed or blank application_json fails closed to 404', async (t) => {
  for (const payload of ['{not json', '{}', '{"fullName":""}', '{"fullName":"  "}', '{"fullName":null}']) {
    const { db, sqlite, close } = await setup();
    sqlite.prepare('UPDATE ordinations SET application_json=? WHERE id=?').run(payload, 'o-1');

    const res = await verify(db);
    assert.equal(res.status, 404, `should fail closed for ${payload}`);
    close();
  }
});

test('28. users.display_name is never substituted on the public page', async (t) => {
  const { db, close } = await setup();
  t.after(close);

  const raw = await (await verify(db)).text();
  assert.ok(!raw.includes('WRONG DISPLAY NAME'), 'display_name leaked into public verification');
  assert.ok(raw.includes(FULL_NAME));
});

/* ------------------------------------------------------------- 29. leakage -- */

test('29. the public response exposes no internal field, valid or revoked', async (t) => {
  const { db, sqlite, close, repo } = await setup();
  t.after(close);

  sqlite.prepare(`UPDATE ordinations
      SET nft_token_id='NFT-SECRET', tx_hash='TX-SECRET', credential_r2_key='credentials/o-1.pdf',
          application_json='{"fullName":"Jordan Alexis Rivers","reason":"PRIVATE CALLING","experience":"PRIVATE EXP"}'
    WHERE id='o-1'`).run();

  for (const phase of ['valid', 'revoked']) {
    if (phase === 'revoked') await repo.revoke('o-1', { revokedBy: 'u-admin', reason: REASON, now: T2 });
    const raw = await (await verify(db)).text();

    for (const secret of [
      'u-alice@bm.test', 'u-alice', 'u-admin', 'PRIVATE CALLING', 'PRIVATE EXP', REASON,
      'credentials/o-1.pdf', 'NFT-SECRET', 'TX-SECRET',
      'application_json', 'approved_by', 'user_id', 'credential_r2_key', 'nft_token_id', 'tx_hash',
      'issued_at', 'credential_version',
    ]) {
      assert.ok(!raw.includes(secret), `[${phase}] leaked publicly: ${secret}`);
    }
  }
});

test('the scroll verification branch is unaffected', async (t) => {
  const { db, sqlite, close } = await setup();
  t.after(close);

  sqlite.prepare(
    `INSERT INTO scrolls (id,title,slug,verify_slug,r2_key,visibility,published_at,created_at,updated_at)
     VALUES ('s-1','Fixture Scroll','fixture','slug-scroll','scrolls/s-1.pdf','public',?,?,?)`,
  ).run(T1, T1, T1);

  const res = await get({ db, path: '/api/verify/slug-scroll', session: null });
  assert.equal(res.status, 200);
  const { type, data } = await res.json();
  assert.equal(type, 'scroll');
  assert.equal(data.title, 'Fixture Scroll');
  assert.ok(!('r2_key' in data));
});
