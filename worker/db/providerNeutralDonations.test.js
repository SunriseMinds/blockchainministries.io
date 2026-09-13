/**
 * M14.3 — provider-neutral donations, migration 0005, and donation intents.
 *
 * Runs against the REAL migration chain (0001..0005) replayed by
 * test/helpers/d1.mjs, so the rebuild in 0005 is executed exactly as written —
 * including the copy step — rather than described. No provider is contacted.
 *
 * Run: node --test worker/db/providerNeutralDonations.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { freshDb, seedUser, MIGRATIONS } from '../../test/helpers/d1.mjs';
import { repos } from './repositories.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sql = (f) => readFileSync(join(REPO_ROOT, 'migrations', f), 'utf8');

function setup() {
  const { db, sqlite, close } = freshDb();
  seedUser(sqlite, { id: 'u-alice', email: 'u-alice@bm.test' });
  return { db, sqlite, close, repo: repos(db) };
}

const fiat = (o = {}) => ({
  provider: 'stripe', providerEventId: 'evt_1', providerTxnId: 'pi_1',
  amountCents: 5000, currency: 'usd', status: 'succeeded', ...o,
});
const xrp = (o = {}) => ({
  provider: 'xrpl', providerEventId: 'A'.repeat(64), providerTxnId: 'A'.repeat(64),
  amountDrops: 25_000_000, currency: 'XRP', status: 'confirmed', ...o,
});

/* ============================================== 1-2. THE REBUILD ITSELF === */

test('1. an existing Stripe donation survives the 0005 rebuild byte for byte', () => {
  // Replay 0001..0004, write a row through the OLD schema, then run 0005 and
  // compare every value. This is the migration actually executing, not a
  // description of it.
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const f of MIGRATIONS.filter((m) => !m.startsWith('0005'))) db.exec(sql(f));

  db.prepare(`INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
              VALUES ('u-1','donor@bm.test','x','member','active','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`).run();
  const before = {
    id: 'd-1', user_id: 'u-1', provider: 'stripe', stripe_event_id: 'evt_legacy_1',
    provider_charge_id: 'pi_legacy_1', amount_cents: 12345, currency: 'usd',
    status: 'succeeded', receipt_url: 'https://stripe/receipt/1', created_at: '2026-02-03T04:05:06.000Z',
  };
  db.prepare(`INSERT INTO donations (id,user_id,provider,stripe_event_id,provider_charge_id,amount_cents,currency,status,receipt_url,created_at)
              VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    before.id, before.user_id, before.provider, before.stripe_event_id, before.provider_charge_id,
    before.amount_cents, before.currency, before.status, before.receipt_url, before.created_at,
  );
  const countBefore = db.prepare('SELECT COUNT(*) AS n FROM donations').get().n;

  db.exec(sql('0005_provider_neutral_donations.sql'));

  // A. row count unchanged
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM donations').get().n, countBefore);
  const after = db.prepare('SELECT * FROM donations').get();
  // B/C. id and every value preserved or correctly mapped
  assert.equal(after.id, before.id);
  assert.equal(after.user_id, before.user_id);
  assert.equal(after.provider, before.provider);
  assert.equal(after.amount_cents, before.amount_cents);
  assert.equal(after.currency, before.currency);
  assert.equal(after.status, before.status);
  assert.equal(after.created_at, before.created_at);
  // D. renamed columns carry the same values
  assert.equal(after.provider_event_id, before.stripe_event_id, 'idempotency key must survive the rename');
  assert.equal(after.provider_txn_id, before.provider_charge_id);
  assert.equal(after.reference_url, before.receipt_url);
  // New columns are null for migrated fiat rows.
  assert.equal(after.amount_drops, null);
  assert.equal(after.xrpl_destination_tag, null);
  assert.equal(after.xrpl_ledger_index, null);

  // F. the foreign key still points at users and still behaves.
  const fks = db.prepare("SELECT * FROM pragma_foreign_key_list('donations')").all();
  assert.equal(fks.length, 1);
  assert.equal(fks[0].table, 'users');
  assert.equal(fks[0].on_delete, 'SET NULL');
  db.prepare('DELETE FROM users WHERE id = ?').run('u-1');
  assert.equal(db.prepare('SELECT user_id FROM donations').get().user_id, null, 'ON DELETE SET NULL must survive');

  // G. indexes recreated
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='donations' AND sql IS NOT NULL").all().map(r => r.name).sort();
  assert.deepEqual(idx, ['idx_donations_created', 'idx_donations_txn', 'idx_donations_user']);
  // The scaffold table must not survive.
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='donations_new'").get().n, 0);
  db.close();
});

test('2. the migrated Stripe event id is still an idempotency key', () => {
  const db = new DatabaseSync(':memory:');
  for (const f of MIGRATIONS) db.exec(sql(f));
  db.prepare(`INSERT INTO donations (id,provider,provider_event_id,amount_cents,currency,status,created_at)
              VALUES ('d-1','stripe','evt_x',100,'usd','succeeded','2026-01-01T00:00:00.000Z')`).run();
  assert.throws(
    () => db.prepare(`INSERT INTO donations (id,provider,provider_event_id,amount_cents,currency,status,created_at)
                      VALUES ('d-2','stripe','evt_x',200,'usd','succeeded','2026-01-01T00:00:00.000Z')`).run(),
    /UNIQUE/i,
  );
  db.close();
});

/* ======================================== 3-6. PROVIDER VOCABULARY === */

test('3-5. the provider vocabulary accepts exactly stripe, paypal and xrpl', async () => {
  const { sqlite, close, repo } = setup();
  try {
    assert.ok(await repo.donations.recordIfNew(fiat({ provider: 'stripe', providerEventId: 'evt_s' })));
    assert.ok(await repo.donations.recordIfNew(fiat({ provider: 'paypal', providerEventId: 'evt_p' })));
    assert.ok(await repo.donations.recordIfNew(xrp({ providerEventId: 'B'.repeat(64) })));
    assert.deepEqual(
      sqlite.prepare('SELECT provider FROM donations ORDER BY provider').all().map(r => r.provider),
      ['paypal', 'stripe', 'xrpl'],
    );
  } finally { close(); }
});

test('6. an invalid provider is rejected by the database, not merely by code', async () => {
  const { close, repo } = setup();
  try {
    for (const bad of ['venmo', 'STRIPE', 'stripe ', '', 'bitcoin']) {
      await assert.rejects(
        () => repo.donations.recordIfNew(fiat({ provider: bad, providerEventId: `evt_${bad}` })),
        /CHECK|constraint/i,
        `accepted an invented rail: ${JSON.stringify(bad)}`,
      );
    }
  } finally { close(); }
});

/* ============================================== 7-11. AMOUNT MODEL === */

test('7-8. fiat rows carry cents and no drops', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.donations.recordIfNew(fiat({ provider: 'stripe', providerEventId: 'evt_s', amountCents: 2500 }));
    await repo.donations.recordIfNew(fiat({ provider: 'paypal', providerEventId: 'evt_p', amountCents: 999 }));
    const rows = sqlite.prepare('SELECT provider, amount_cents, amount_drops FROM donations ORDER BY amount_cents').all();
    assert.deepEqual(rows.map(r => r.amount_cents), [999, 2500]);
    assert.deepEqual(rows.map(r => r.amount_drops), [null, null]);
  } finally { close(); }
});

test('9. an XRPL row carries drops, no cents, and currency XRP', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.donations.recordIfNew(xrp({ amountDrops: 25_000_000, xrplDestinationTag: 42, xrplLedgerIndex: 90_000_001 }));
    const r = sqlite.prepare('SELECT * FROM donations').get();
    assert.equal(r.amount_drops, 25_000_000);
    assert.equal(r.amount_cents, null);
    assert.equal(r.currency, 'XRP');
    assert.equal(r.xrpl_destination_tag, 42);
    assert.equal(r.xrpl_ledger_index, 90_000_001);
  } finally { close(); }
});

test('9b. mixed or wrong units are unrepresentable', async () => {
  const { close, repo } = setup();
  try {
    const bad = [
      ['xrp row carrying cents', { ...xrp(), amountCents: 100 }],
      ['xrp row with no drops', { ...xrp(), amountDrops: null }],
      ['xrp row in usd', { ...xrp(), currency: 'usd' }],
      ['fiat row carrying drops', { ...fiat(), amountDrops: 1_000_000 }],
      ['fiat row with no cents', { ...fiat(), amountCents: null }],
      ['fiat row with a destination tag', { ...fiat(), xrplDestinationTag: 7 }],
      ['negative fiat', { ...fiat(), amountCents: -1 }],
      ['negative drops', { ...xrp(), amountDrops: -1 }],
      ['out-of-range tag', { ...xrp(), xrplDestinationTag: 4_294_967_296 }],
    ];
    for (const [label, row] of bad) {
      await assert.rejects(
        () => repo.donations.recordIfNew({ ...row, providerEventId: `evt_${label.replace(/\W/g, '')}` }),
        /CHECK|constraint/i,
        `accepted an impossible row: ${label}`,
      );
    }
  } finally { close(); }
});

test('10. an anonymous XRPL receipt is representable — unattributed money is still money', async () => {
  const { sqlite, close, repo } = setup();
  try {
    // No tag, no user: a genuine payment that arrived untagged. It must be
    // recordable rather than silently dropped.
    const id = await repo.donations.recordIfNew(xrp({
      userId: null, xrplDestinationTag: null, xrplLedgerIndex: 90_000_002,
      providerEventId: 'C'.repeat(64), status: 'confirmed',
    }));
    assert.ok(id);
    const r = sqlite.prepare('SELECT * FROM donations').get();
    assert.equal(r.user_id, null);
    assert.equal(r.xrpl_destination_tag, null);
    assert.equal(r.status, 'confirmed');
    assert.equal(r.amount_drops, 25_000_000);
  } finally { close(); }
});

test('11. a duplicate provider_event_id is a no-op on every rail', async () => {
  const { sqlite, close, repo } = setup();
  try {
    for (const row of [fiat({ providerEventId: 'evt_dup' }), xrp({ providerEventId: 'D'.repeat(64) })]) {
      assert.ok(await repo.donations.recordIfNew(row), 'first insert records');
      assert.equal(await repo.donations.recordIfNew(row), null, 'redelivery is a no-op');
    }
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n, 2);
  } finally { close(); }
});

/* ========================================== 12-14. DONATION INTENTS === */

test('12. a destination tag is unique and never reused', async () => {
  const { close, repo } = setup();
  const expires = '2099-01-01T00:00:00.000Z';
  try {
    assert.ok(await repo.donationIntents.create({ userId: 'u-alice', destinationTag: 1001, expectedAmountDrops: 5_000_000, expiresAt: expires }));
    // Same tag again — refused, not silently overwritten.
    assert.equal(await repo.donationIntents.create({ userId: null, destinationTag: 1001, expiresAt: expires }), null);
    // Anonymous intents are supported.
    assert.ok(await repo.donationIntents.create({ userId: null, destinationTag: 1002, expiresAt: expires }));
    // 32-bit unsigned bounds are enforced by the schema.
    await assert.rejects(() => repo.donationIntents.create({ destinationTag: 4_294_967_296, expiresAt: expires }), /CHECK|constraint/i);
    await assert.rejects(() => repo.donationIntents.create({ destinationTag: -1, expiresAt: expires }), /CHECK|constraint/i);
  } finally { close(); }
});

test('13. an expired intent stays auditable, and its tag is still not reusable', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.donationIntents.create({ userId: 'u-alice', destinationTag: 2001, expiresAt: '2020-01-01T00:00:00.000Z' });
    await repo.donationIntents.create({ userId: 'u-alice', destinationTag: 2002, expiresAt: '2099-01-01T00:00:00.000Z' });

    assert.equal(await repo.donationIntents.expireDue('2026-01-01T00:00:00.000Z'), 1);
    // node:sqlite returns null-prototype rows, so normalise before comparing.
    const rows = sqlite.prepare('SELECT destination_tag, status FROM donation_intents ORDER BY destination_tag')
      .all().map((r) => ({ destination_tag: r.destination_tag, status: r.status }));
    assert.deepEqual(rows, [{ destination_tag: 2001, status: 'expired' }, { destination_tag: 2002, status: 'open' }]);
    // Still present — expiry is a status, never a delete.
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM donation_intents').get().n, 2);
    // A donor's wallet does not know about our expiry, so the tag must never
    // be handed to someone else.
    assert.equal(await repo.donationIntents.create({ destinationTag: 2001, expiresAt: '2099-01-01T00:00:00.000Z' }), null);
  } finally { close(); }
});

test('14. an intent cannot be confirmed twice', async () => {
  const { sqlite, close, repo } = setup();
  try {
    const id = await repo.donationIntents.create({ userId: 'u-alice', destinationTag: 3001, expectedAmountDrops: 1_000_000, expiresAt: '2099-01-01T00:00:00.000Z' });
    const hash = 'E'.repeat(64);
    assert.equal(await repo.donationIntents.confirm(id, { providerEventId: hash, now: '2026-05-05T00:00:00.000Z' }), true);
    // A retry changes nothing.
    assert.equal(await repo.donationIntents.confirm(id, { providerEventId: 'F'.repeat(64) }), false);
    const r = sqlite.prepare('SELECT * FROM donation_intents WHERE id = ?').get(id);
    assert.equal(r.status, 'confirmed');
    assert.equal(r.provider_event_id, hash, 'the original evidence must stand');
    assert.equal(r.confirmed_at, '2026-05-05T00:00:00.000Z');
    // And an expired intent cannot be confirmed at all.
    const stale = await repo.donationIntents.create({ destinationTag: 3002, expiresAt: '2020-01-01T00:00:00.000Z' });
    await repo.donationIntents.expireDue('2026-01-01T00:00:00.000Z');
    assert.equal(await repo.donationIntents.confirm(stale, { providerEventId: 'G'.repeat(64) }), false);
  } finally { close(); }
});

test('14b. a confirmed row without evidence is unrepresentable', () => {
  const db = new DatabaseSync(':memory:');
  for (const f of MIGRATIONS) db.exec(sql(f));
  assert.throws(() => db.prepare(
    `INSERT INTO donation_intents (id,provider,destination_tag,currency,status,expires_at,created_at)
     VALUES ('i-1','xrpl',1,'XRP','confirmed','2099-01-01','2026-01-01')`,
  ).run(), /CHECK|constraint/i);
  // ...and so is unconfirmed evidence.
  assert.throws(() => db.prepare(
    `INSERT INTO donation_intents (id,provider,destination_tag,currency,status,expires_at,created_at,provider_event_id)
     VALUES ('i-2','xrpl',2,'XRP','open','2099-01-01','2026-01-01','hash')`,
  ).run(), /CHECK|constraint/i);
  db.close();
});

/* ============================================== 18-20. REGRESSION === */

test('18. the Stripe webhook persistence path still works end to end', async () => {
  const { sqlite, close, repo } = setup();
  try {
    const { donationFromEvent } = await import('@reellink/payments/stripe.js');
    const event = {
      id: 'evt_wh_1', created: 1_770_000_000, type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_wh_1', amount_received: 5000, currency: 'usd', metadata: { user_id: 'u-alice' } } },
    };
    const d = donationFromEvent(event);
    // Exactly the mapping the route performs.
    const id = await repo.donations.recordIfNew({
      provider: d.provider, providerEventId: d.stripeEventId, providerTxnId: d.providerChargeId,
      amountCents: d.amountCents, currency: d.currency, status: d.status,
      referenceUrl: d.receiptUrl, userId: d.userId,
    });
    assert.ok(id);
    const r = sqlite.prepare('SELECT * FROM donations').get();
    assert.equal(r.provider, 'stripe');
    assert.equal(r.provider_event_id, 'evt_wh_1');
    assert.equal(r.provider_txn_id, 'pi_wh_1');
    assert.equal(r.amount_cents, 5000);
    assert.equal(r.user_id, 'u-alice');
    // Redelivery is still a no-op.
    assert.equal(await repo.donations.recordIfNew({
      provider: d.provider, providerEventId: d.stripeEventId, amountCents: d.amountCents,
      currency: d.currency, status: d.status,
    }), null);
  } finally { close(); }
});

test('19. member and admin reads work and expose no internal identifiers', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.donations.recordIfNew(fiat({ userId: 'u-alice', providerEventId: 'evt_m', referenceUrl: 'https://stripe/r/1' }));
    await repo.donations.recordIfNew(xrp({ userId: null, providerEventId: 'H'.repeat(64), referenceUrl: 'https://livenet.xrpl.org/transactions/HH' }));

    const mine = await repo.donations.listByUser('u-alice', {});
    assert.equal(mine.length, 1);
    for (const forbidden of ['provider_event_id', 'provider_txn_id', 'user_id', 'xrpl_destination_tag', 'xrpl_ledger_index']) {
      assert.ok(!(forbidden in mine[0]), `member history must not carry ${forbidden}`);
    }
    assert.equal(mine[0].amount_cents, 5000);
    assert.equal(mine[0].reference_url, 'https://stripe/r/1');

    const all = await repo.donations.list({});
    assert.equal(all.length, 2);
    // The admin query is column-listed; the view projects again on top.
    assert.ok(!('provider_event_id' in all[0]), 'the raw idempotency key is not an admin display field');
    void sqlite;
  } finally { close(); }
});

test('20. M14.2 subscription ordering is untouched by 0005', async () => {
  const { sqlite, close, repo } = setup();
  try {
    // M14.5B: the vocabulary is provider-neutral; the behaviour asserted
    // below is deliberately identical to what M14.2 and M14.3 asserted.
    const base = { provider: 'stripe', userId: 'u-alice', providerSubscriptionId: 'sub_1', providerCustomerId: 'cus_1' };
    assert.equal(await repo.subscriptions.upsertFromWebhook({ ...base, status: 'active', currentPeriodEnd: '2026-03-01T00:00:00.000Z', eventId: 'evt_2', eventCreated: 2000 }), 'inserted');
    assert.equal(await repo.subscriptions.upsertFromWebhook({ ...base, status: 'past_due', currentPeriodEnd: '2026-03-01T00:00:00.000Z', eventId: 'evt_1', eventCreated: 1000 }), 'stale_event');
    assert.equal(await repo.subscriptions.upsertFromWebhook({ ...base, status: 'past_due', eventId: 'evt_2', eventCreated: 2000 }), 'duplicate');
    assert.equal(sqlite.prepare('SELECT status FROM subscriptions').get().status, 'active');
    // 0005 itself still does not touch subscriptions — asserted directly
    // against its SQL below. The COLUMN SET is now 0006's business, and is
    // proven in worker/db/subscriptionMigration.test.js; all that matters
    // here is that the M14.2 ordering columns survived.
    const cols = sqlite.prepare("SELECT name FROM pragma_table_info('subscriptions')").all().map(c => c.name);
    assert.ok(cols.includes('last_event_id') && cols.includes('last_event_created'));
  } finally { close(); }
});

/* ====================================================== migration hygiene === */

test('0005 touches only donations and donation_intents, and 0001-0004 are unchanged', () => {
  const raw = sql('0005_provider_neutral_donations.sql');
  // Comment lines EXPLAIN why the pragma is unnecessary; only executable SQL
  // is asserted against.
  const body = raw.split('\n').filter((l) => !/^\s*--/.test(l)).join('\n');
  for (const forbidden of ['ALTER TABLE subscriptions', 'DROP TABLE users', 'DROP TABLE memberships',
    'DROP TABLE ordinations', 'DROP TABLE audit_logs', 'DROP TABLE sessions', 'ALTER TABLE ordinations']) {
    assert.ok(!body.includes(forbidden), `0005 must not touch: ${forbidden}`);
  }
  assert.ok(body.includes('DROP TABLE donations;'), 'the rebuild must drop the old table');
  assert.ok(body.includes('ALTER TABLE donations_new RENAME TO donations'));
  assert.ok(body.includes('CREATE TABLE donation_intents'));
  // The pragma is deliberately absent — nothing references donations.
  assert.ok(!/PRAGMA\s+foreign_keys/i.test(body), 'no connection pragma should be needed or used');
  // The full chain is present and ordered.
  const files = readdirSync(join(REPO_ROOT, 'migrations')).filter(f => /^\d{4}_.*\.sql$/.test(f)).sort();
  assert.deepEqual(files, [
    '0001_initial_schema.sql', '0002_login_tokens.sql', '0003_ordination_credentials.sql',
    '0004_subscription_event_ordering.sql', '0005_provider_neutral_donations.sql',
    '0006_provider_neutral_subscriptions.sql',
  ]);
});
