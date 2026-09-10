/**
 * M11 Phase 3 — ordination credential issuance, repository layer.
 *
 * Exercises the REAL SQL in repositories.js against the REAL schema built from
 * migrations/0001 -> 0002 -> 0003. Nothing here touches D1 (production or
 * preview); every test gets a private in-memory database.
 *
 * Run: node --test worker/db/ordinations.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedUser, seedOrdination, readOrdination } from '../../test/helpers/d1.mjs';
import { ordinations, credentialAvailable } from './repositories.js';

const T1 = '2026-03-01T10:00:00.000Z';
const T2 = '2026-04-01T10:00:00.000Z';
const T3 = '2026-05-01T10:00:00.000Z';

/** Fresh db + an admin, a member, and one pending ordination. */
function setup({ status = 'pending' } = {}) {
  const { db, sqlite, close } = freshDb();
  seedUser(sqlite, { id: 'u-admin', email: 'admin@bm.test', role: 'admin' });
  seedUser(sqlite, { id: 'u-member', email: 'member@bm.test' });
  seedOrdination(sqlite, { id: 'o-1', userId: 'u-member', fullName: 'Jordan Rivers', status });
  return { repo: ordinations(db), sqlite, close, row: () => readOrdination(sqlite, 'o-1') };
}

/* ------------------------------------------------------- initial issuance -- */

test('approve: pending -> approved issues a credential atomically', async (t) => {
  const { repo, close, row } = setup();
  t.after(close);

  const before = row();
  assert.equal(before.credential_version, 0, 'un-issued rows start at version 0');
  assert.equal(before.credential_number, null);
  assert.equal(before.issued_at, null);

  const ok = await repo.approve('o-1', { approvedBy: 'u-admin', verifySlug: 'slug-abc', now: T1 });
  assert.equal(ok, true);

  const after = row();
  assert.equal(after.status, 'approved');
  assert.match(after.credential_number, /^BM-[A-Z0-9]{8}$/);
  assert.equal(after.issued_at, T1);
  assert.equal(after.credential_version, 1, 'must be set explicitly to 1, not left at the default 0');
  assert.equal(after.approved_at, T1);
  assert.equal(after.approved_by, 'u-admin');
  assert.equal(after.verify_slug, 'slug-abc');
  assert.equal(after.revoked_at, null);
  assert.equal(after.credential_r2_key, null, 'M11 stores no object (Q7)');
});

test('approve: preserves an existing verify_slug instead of regenerating it', async (t) => {
  const { repo, sqlite, close, row } = setup();
  t.after(close);
  sqlite.prepare("UPDATE ordinations SET verify_slug='original-slug' WHERE id='o-1'").run();

  await repo.approve('o-1', { approvedBy: 'u-admin', verifySlug: 'a-different-slug', now: T1 });
  assert.equal(row().verify_slug, 'original-slug', 'COALESCE must pin the public URL');
});

/* ------------------------------------------------------------ idempotency -- */

test('approve replay: second call changes 0 rows and mutates nothing', async (t) => {
  const { repo, close, row } = setup();
  t.after(close);

  assert.equal(await repo.approve('o-1', { approvedBy: 'u-admin', verifySlug: 'slug-abc', now: T1 }), true);
  const first = row();

  const second = await repo.approve('o-1', {
    approvedBy: 'u-other-admin', verifySlug: 'slug-xyz', now: T2,
  });
  assert.equal(second, false, 'replay must report that it did not transition');

  const after = row();
  assert.equal(after.credential_number, first.credential_number, 'number must not be reissued');
  assert.equal(after.issued_at, T1, 'issued_at must not move');
  assert.equal(after.approved_at, T1, 'approved_at must not move');
  assert.equal(after.credential_version, 1, 'version must not be reset or bumped');
  assert.equal(after.verify_slug, 'slug-abc', 'slug must not be regenerated');
  assert.equal(after.approved_by, 'u-admin');
});

test('reject: a rejected ordination receives no credential', async (t) => {
  const { repo, close, row } = setup();
  t.after(close);

  assert.equal(await repo.reject('o-1', { approvedBy: 'u-admin' }), true);
  const r = row();
  assert.equal(r.status, 'rejected');
  assert.equal(r.credential_number, null);
  assert.equal(r.issued_at, null);
  assert.equal(r.credential_version, 0);
  assert.equal(credentialAvailable(r), false);

  // And approve() can no longer act on it — the pending gate holds.
  assert.equal(await repo.approve('o-1', { approvedBy: 'u-admin', verifySlug: 's', now: T2 }), false);
  assert.equal(row().credential_number, null);
});

/* ---------------------------------------------------------------- collision -- */

test('approve: retries on a credential_number collision and succeeds exactly once', async (t) => {
  const { repo, sqlite, close, row } = setup();
  t.after(close);

  // Park the colliding number on another ordination so the index rejects it.
  seedOrdination(sqlite, { id: 'o-taken', userId: 'u-member' });
  sqlite
    .prepare("UPDATE ordinations SET credential_number='BM-COLLIDE', issued_at=?, credential_version=1 WHERE id='o-taken'")
    .run(T1);

  const candidates = ['BM-COLLIDE', 'BM-FRESH01'];
  let calls = 0;
  const generateNumber = () => candidates[Math.min(calls++, candidates.length - 1)];

  const ok = await repo.approve('o-1', {
    approvedBy: 'u-admin', verifySlug: 'slug-abc', now: T1, generateNumber,
  });

  assert.equal(ok, true);
  assert.equal(calls, 2, 'must have generated a second candidate after the collision');
  const after = row();
  assert.equal(after.credential_number, 'BM-FRESH01');
  assert.equal(after.credential_version, 1);
  assert.equal(after.status, 'approved');

  // The parked row is untouched, and only one row holds the colliding number.
  const taken = readOrdination(sqlite, 'o-taken');
  assert.equal(taken.credential_number, 'BM-COLLIDE');
});

test('approve: a failed collision attempt leaves NO partial approval', async (t) => {
  const { repo, sqlite, close, row } = setup();
  t.after(close);

  seedOrdination(sqlite, { id: 'o-taken', userId: 'u-member' });
  sqlite
    .prepare("UPDATE ordinations SET credential_number='BM-ALWAYS1', issued_at=?, credential_version=1 WHERE id='o-taken'")
    .run(T1);

  // A generator that ALWAYS collides: every attempt must fail, and loudly.
  await assert.rejects(
    () => repo.approve('o-1', {
      approvedBy: 'u-admin', verifySlug: 'slug-abc', now: T1,
      generateNumber: () => 'BM-ALWAYS1',
      maxAttempts: 3,
    }),
    /Could not allocate a unique credential number/,
  );

  const after = row();
  assert.equal(after.status, 'pending', 'must NOT be half-approved');
  assert.equal(after.credential_number, null);
  assert.equal(after.issued_at, null);
  assert.equal(after.approved_at, null);
  assert.equal(after.approved_by, null);
  assert.equal(after.credential_version, 0);
});

test('approve: an UNRELATED unique failure is NOT retried as a collision', async (t) => {
  const { repo, sqlite, close, row } = setup();
  t.after(close);

  // verify_slug is also UNIQUE. Park the slug we are about to request.
  seedOrdination(sqlite, { id: 'o-slug', userId: 'u-member' });
  sqlite.prepare("UPDATE ordinations SET verify_slug='taken-slug' WHERE id='o-slug'").run();

  let calls = 0;
  await assert.rejects(
    () => repo.approve('o-1', {
      approvedBy: 'u-admin', verifySlug: 'taken-slug', now: T1,
      generateNumber: () => { calls += 1; return `BM-UNIQUE${calls}`; },
    }),
    (err) => {
      // The real slug error must surface untouched — never rewritten into the
      // credential-number exhaustion message.
      assert.match(err.message, /UNIQUE constraint failed: ordinations\.verify_slug/);
      assert.doesNotMatch(err.message, /Could not allocate a unique credential number/);
      return true;
    },
  );

  assert.equal(calls, 1, 'must fail fast, not burn retries on an unrelated error');
  assert.equal(row().status, 'pending');
});

/* ----------------------------------------------------------------- resubmit -- */

test('resubmit: rejected -> pending clears ALL credential lifecycle state', async (t) => {
  const { repo, sqlite, close, row } = setup();
  t.after(close);

  // Drive a full lifecycle, then force the row to 'rejected' with every
  // credential field populated — the worst case a reset must handle.
  await repo.approve('o-1', { approvedBy: 'u-admin', verifySlug: 'slug-abc', now: T1 });
  await repo.revoke('o-1', { revokedBy: 'u-admin', reason: 'internal reason', now: T2 });
  sqlite
    .prepare("UPDATE ordinations SET status='rejected', nft_token_id='nft1', tx_hash='tx1', credential_r2_key='credentials/o-1.pdf' WHERE id='o-1'")
    .run();

  assert.equal(await repo.resubmit('o-1', { applicationJson: '{"fullName":"Jordan Rivers"}', now: T3 }), true);

  const r = row();
  assert.equal(r.status, 'pending');
  assert.equal(r.credential_number, null);
  assert.equal(r.issued_at, null);
  assert.equal(r.credential_version, 0, 'must return to 0 (never issued), not 1');
  assert.equal(r.revoked_at, null);
  assert.equal(r.revoked_by, null);
  assert.equal(r.revocation_reason, null);
  // pre-existing reset behaviour preserved
  assert.equal(r.approved_by, null);
  assert.equal(r.approved_at, null);
  assert.equal(r.nft_token_id, null);
  assert.equal(r.tx_hash, null);
  // stale object references must never survive back into a pending application
  assert.equal(r.credential_r2_key, null);
  // and the correct fields are preserved
  assert.equal(r.application_json, '{"fullName":"Jordan Rivers"}');
  assert.equal(r.updated_at, T3);
  assert.equal(credentialAvailable(r), false);
});

test('reject -> resubmit -> approve issues a fresh credential on a clean row', async (t) => {
  const { repo, close, row } = setup();
  t.after(close);

  // The real rejected-applicant journey: rejected, resubmitted, then approved.
  assert.equal(await repo.reject('o-1', { approvedBy: 'u-admin' }), true);
  assert.equal(await repo.resubmit('o-1', { applicationJson: '{"fullName":"Jordan Rivers"}', now: T2 }), true);

  const resubmitted = row();
  assert.equal(resubmitted.status, 'pending');
  assert.equal(resubmitted.credential_version, 0);
  assert.equal(resubmitted.credential_number, null);

  assert.equal(await repo.approve('o-1', { approvedBy: 'u-admin', verifySlug: 'slug-new', now: T3 }), true);

  const issued = row();
  assert.match(issued.credential_number, /^BM-[A-Z0-9]{8}$/);
  assert.equal(issued.credential_version, 1, 'a resubmitted-then-approved row is a FIRST issuance');
  assert.equal(issued.issued_at, T3);
  assert.equal(issued.approved_at, T3);
  assert.equal(credentialAvailable(issued), true);
});

/* --------------------------------------------------------------- revocation -- */

test('revoke: sets revocation fields and preserves permanent identity', async (t) => {
  const { repo, close, row } = setup();
  t.after(close);

  await repo.approve('o-1', { approvedBy: 'u-admin', verifySlug: 'slug-abc', now: T1 });
  const issued = row();

  const res = await repo.revoke('o-1', { revokedBy: 'u-admin', reason: 'conduct review', now: T2 });
  assert.deepEqual(res, { ok: true, outcome: 'revoked' });

  const r = row();
  assert.equal(r.revoked_at, T2);
  assert.equal(r.revoked_by, 'u-admin');
  assert.equal(r.revocation_reason, 'conduct review');
  assert.equal(r.updated_at, T2);
  // permanent identity untouched
  assert.equal(r.status, 'approved', 'revocation is orthogonal to status');
  assert.equal(r.credential_number, issued.credential_number);
  assert.equal(r.verify_slug, 'slug-abc');
  assert.equal(r.approved_at, T1);
  assert.equal(r.issued_at, T1);
  assert.equal(r.credential_version, 1);
});

test('revoke: reports outcomes distinctly and is idempotent', async (t) => {
  const { repo, close, row } = setup();
  t.after(close);

  assert.deepEqual(
    await repo.revoke('does-not-exist', { revokedBy: 'u-admin', reason: 'x', now: T2 }),
    { ok: false, outcome: 'not_found' },
  );
  assert.deepEqual(
    await repo.revoke('o-1', { revokedBy: 'u-admin', reason: 'x', now: T2 }),
    { ok: false, outcome: 'not_issued' },
  );

  await repo.approve('o-1', { approvedBy: 'u-admin', verifySlug: 'slug-abc', now: T1 });
  await repo.revoke('o-1', { revokedBy: 'u-admin', reason: 'first reason', now: T2 });

  const again = await repo.revoke('o-1', { revokedBy: 'u-other', reason: 'second reason', now: T3 });
  assert.deepEqual(again, { ok: false, outcome: 'already_revoked' });

  const r = row();
  assert.equal(r.revocation_reason, 'first reason', 'a double revoke must not overwrite the original');
  assert.equal(r.revoked_by, 'u-admin');
  assert.equal(r.revoked_at, T2);
});

/* ------------------------------------------------------------------ reissue -- */

test('reissue: clears revocation, bumps version, preserves identity', async (t) => {
  const { repo, close, row } = setup();
  t.after(close);

  await repo.approve('o-1', { approvedBy: 'u-admin', verifySlug: 'slug-abc', now: T1 });
  const number = row().credential_number;
  await repo.revoke('o-1', { revokedBy: 'u-admin', reason: 'clerical error', now: T2 });

  const res = await repo.reissue('o-1', { now: T3 });
  assert.deepEqual(res, { ok: true, outcome: 'reissued' });

  const r = row();
  assert.equal(r.revoked_at, null);
  assert.equal(r.revoked_by, null);
  assert.equal(r.revocation_reason, null);
  assert.equal(r.issued_at, T3, 'issued_at moves to the reissue timestamp');
  assert.equal(r.credential_version, 2, 'version increments');
  // preserved
  assert.equal(r.credential_number, number, 'credential number is permanent');
  assert.equal(r.verify_slug, 'slug-abc', 'public verification URL is permanent');
  assert.equal(r.approved_at, T1, 'original ordination date is preserved');
  assert.equal(r.approved_by, 'u-admin');
  assert.equal(r.status, 'approved');
  assert.equal(credentialAvailable(r), true);
});

test('reissue: only acts on an issued AND revoked credential', async (t) => {
  const { repo, close } = setup();
  t.after(close);

  assert.deepEqual(await repo.reissue('does-not-exist', { now: T3 }), { ok: false, outcome: 'not_found' });
  assert.deepEqual(await repo.reissue('o-1', { now: T3 }), { ok: false, outcome: 'not_issued' });

  await repo.approve('o-1', { approvedBy: 'u-admin', verifySlug: 'slug-abc', now: T1 });
  assert.deepEqual(
    await repo.reissue('o-1', { now: T3 }),
    { ok: false, outcome: 'not_revoked' },
    'must never silently bump the version of a live credential',
  );
});

test('reissue is repeatable: version climbs 1 -> 2 -> 3', async (t) => {
  const { repo, close, row } = setup();
  t.after(close);

  await repo.approve('o-1', { approvedBy: 'u-admin', verifySlug: 'slug-abc', now: T1 });
  const originalNumber = row().credential_number;

  await repo.revoke('o-1', { revokedBy: 'u-admin', reason: 'a', now: T2 });
  await repo.reissue('o-1', { now: T3 });
  assert.equal(row().credential_version, 2);

  await repo.revoke('o-1', { revokedBy: 'u-admin', reason: 'b', now: T3 });
  await repo.reissue('o-1', { now: T3 });
  assert.equal(row().credential_version, 3);

  assert.equal(row().credential_number, originalNumber, 'the number survives every generation');
  assert.equal(row().verify_slug, 'slug-abc');
  assert.equal(row().approved_at, T1);
});

/* ----------------------------------------------------- credential_available -- */

test('credentialAvailable: false before issue, true after, false when revoked', async (t) => {
  const { repo, close, row } = setup();
  t.after(close);

  assert.equal(credentialAvailable(row()), false, 'pending');

  await repo.approve('o-1', { approvedBy: 'u-admin', verifySlug: 'slug-abc', now: T1 });
  assert.equal(credentialAvailable(row()), true, 'issued');

  await repo.revoke('o-1', { revokedBy: 'u-admin', reason: 'x', now: T2 });
  assert.equal(credentialAvailable(row()), false, 'revoked');

  await repo.reissue('o-1', { now: T3 });
  assert.equal(credentialAvailable(row()), true, 'reissued');
});

test('credentialAvailable: never derived from credential_version or credential_r2_key', () => {
  // version 2 with no issue is not available...
  assert.equal(credentialAvailable({ credential_version: 2, issued_at: null, revoked_at: null }), false);
  // ...and a stale r2 key does not make an un-issued credential available.
  assert.equal(credentialAvailable({ credential_r2_key: 'credentials/x.pdf', issued_at: null }), false);
  // issued + not revoked is the ONLY thing that matters.
  assert.equal(credentialAvailable({ issued_at: T1, revoked_at: null }), true);
  assert.equal(credentialAvailable({ issued_at: T1, revoked_at: T2 }), false);
  assert.equal(credentialAvailable(null), false);
  assert.equal(credentialAvailable(undefined), false);
});
