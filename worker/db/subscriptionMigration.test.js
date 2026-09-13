/**
 * M14.5B — migration 0006 proof: the subscriptions rebuild preserves
 * everything and constrains what it should.
 *
 * The shared freshDb() helper applies the WHOLE chain at once, which cannot
 * prove preservation: there would be no pre-0006 data to preserve. So this
 * file replays the real migration files by hand — 0001..0005, seed realistic
 * rows, THEN 0006 — and compares the table before and after, column by column
 * and row by row.
 *
 * Nothing here touches D1. The real .sql files are the only source of schema.
 *
 * Run: node --test worker/db/subscriptionMigration.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MIGRATIONS } from '../../test/helpers/d1.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sql = (file) => readFileSync(join(REPO_ROOT, 'migrations', file), 'utf8');

const M0006 = '0006_provider_neutral_subscriptions.sql';
const BEFORE_0006 = MIGRATIONS.filter((m) => m < M0006);

/** Apply 0001..0005 only, and seed users + subscriptions the old way. */
function upTo0005() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const file of BEFORE_0006) db.exec(sql(file));

  for (const id of ['u-alice', 'u-bob', 'u-carol']) {
    db.prepare(
      `INSERT INTO users (id,email,password_hash,email_verified,role,display_name,status,created_at,updated_at)
       VALUES (?,?,'x',1,'member',?, 'active','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`,
    ).run(id, `${id}@bm.test`, `User ${id}`);
  }
  return db;
}

/**
 * Three rows chosen to exercise every column that could be lost: a fully
 * populated one with M14.2 ordering metadata, one with NULLs where the schema
 * allows them, and a terminal one.
 */
const SEED = [
  {
    id: 's-1', user_id: 'u-alice', stripe_subscription_id: 'sub_alice', stripe_customer_id: 'cus_alice',
    status: 'active', current_period_end: '2026-03-01T00:00:00.000Z',
    last_event_id: 'evt_alice_7', last_event_created: 1_770_003_600,
    created_at: '2026-01-02T03:04:05.678Z', updated_at: '2026-02-09T10:11:12.131Z',
  },
  {
    id: 's-2', user_id: 'u-bob', stripe_subscription_id: 'sub_bob', stripe_customer_id: 'cus_bob',
    status: 'past_due', current_period_end: null,
    last_event_id: null, last_event_created: null,
    created_at: '2026-01-03T00:00:00.000Z', updated_at: '2026-01-03T00:00:00.000Z',
  },
  {
    id: 's-3', user_id: 'u-carol', stripe_subscription_id: 'sub_carol', stripe_customer_id: 'cus_carol',
    status: 'cancelled', current_period_end: '2026-02-01T00:00:00.000Z',
    last_event_id: 'evt_carol_1', last_event_created: 1_769_000_000,
    created_at: '2026-01-04T00:00:00.000Z', updated_at: '2026-01-20T00:00:00.000Z',
  },
];

function seedSubscriptions(db) {
  for (const r of SEED) {
    db.prepare(
      `INSERT INTO subscriptions (id,user_id,stripe_subscription_id,stripe_customer_id,status,
                                  current_period_end,last_event_id,last_event_created,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(r.id, r.user_id, r.stripe_subscription_id, r.stripe_customer_id, r.status,
      r.current_period_end, r.last_event_id, r.last_event_created, r.created_at, r.updated_at);
  }
}

/** 0001..0005, seeded, then 0006. The exact sequence a real preview run does. */
function migrated() {
  const db = upTo0005();
  seedSubscriptions(db);
  db.exec(sql(M0006));
  return db;
}

const rows = (db) => db.prepare('SELECT * FROM subscriptions ORDER BY id').all();
const cols = (db) => db.prepare(`SELECT name, type, "notnull" AS nn, dflt_value FROM pragma_table_info('subscriptions')`).all();

/* ====================================================== 1, 7, 8. preservation === */

test('1, 7, 8. every existing Stripe subscription survives the rebuild exactly', () => {
  const db = migrated();
  try {
    const after = rows(db);
    assert.equal(after.length, SEED.length, 'no row may be lost');

    for (const want of SEED) {
      const got = after.find((r) => r.id === want.id);
      assert.ok(got, `row ${want.id} disappeared`);
      // 1. id preserved.
      assert.equal(got.id, want.id);
      assert.equal(got.user_id, want.user_id);
      // Existing rows are Stripe, and say so.
      assert.equal(got.provider, 'stripe');
      // The Stripe subscription id, under its honest new name.
      assert.equal(got.provider_subscription_id, want.stripe_subscription_id);
      // 7. the Stripe customer id.
      assert.equal(got.provider_customer_id, want.stripe_customer_id);
      // statuses, billing period.
      assert.equal(got.status, want.status);
      assert.equal(got.current_period_end, want.current_period_end);
      // 8. M14.2 ordering metadata, including the NULL case.
      assert.equal(got.last_event_id, want.last_event_id);
      assert.equal(got.last_event_created, want.last_event_created);
      // timestamps, to the millisecond.
      assert.equal(got.created_at, want.created_at);
      assert.equal(got.updated_at, want.updated_at);
    }
  } finally { db.close(); }
});

test('the rebuilt table has exactly the intended shape and nothing else', () => {
  const db = migrated();
  try {
    const c = cols(db);
    const byName = Object.fromEntries(c.map((x) => [x.name, x]));
    assert.deepEqual(c.map((x) => x.name).sort(), [
      'created_at', 'current_period_end', 'id', 'last_event_created', 'last_event_id',
      'provider', 'provider_customer_id', 'provider_subscription_id',
      'status', 'updated_at', 'user_id',
    ].sort());

    // The three constraints that made PayPal unrepresentable are now right.
    assert.equal(byName.provider.nn, 1, 'provider must be NOT NULL');
    assert.equal(byName.provider.dflt_value, "'stripe'");
    assert.equal(byName.provider_subscription_id.nn, 1);
    assert.equal(byName.provider_customer_id.nn, 0, '6. a PayPal row needs no customer id');
    assert.equal(byName.user_id.nn, 1);

    // The old Stripe-specific columns are gone, not merely shadowed.
    assert.ok(!byName.stripe_subscription_id);
    assert.ok(!byName.stripe_customer_id);
  } finally { db.close(); }
});

test('the temporary rebuild table is absent and the indexes are all back', () => {
  const db = migrated();
  try {
    const objects = db.prepare(`SELECT type, name FROM sqlite_master WHERE tbl_name='subscriptions' OR name LIKE '%subscriptions%'`).all();
    const names = objects.map((o) => o.name);
    assert.ok(!names.includes('subscriptions_new'), 'the temporary table must not survive');
    assert.ok(names.includes('subscriptions'));
    for (const idx of ['idx_subscriptions_user', 'idx_subscriptions_status', 'idx_subscriptions_provider']) {
      assert.ok(names.includes(idx), `${idx} must exist after the rebuild`);
    }
    // The UNIQUE on provider_subscription_id survives as an autoindex.
    assert.ok(names.some((n) => n.startsWith('sqlite_autoindex_subscriptions')), 'UNIQUE must still be enforced');
  } finally { db.close(); }
});

/* ====================================================== 2-6. constraints === */

const insert = (db, o = {}) => db.prepare(
  `INSERT INTO subscriptions (id,user_id,provider,provider_subscription_id,provider_customer_id,
                              status,current_period_end,last_event_id,last_event_created,created_at,updated_at)
   VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
).run(
  o.id ?? 'n-1', o.user_id ?? 'u-alice',
  // `in` rather than `??`: a deliberate NULL must reach the database, and a
  // nullish default would silently substitute a valid value and make the
  // NOT NULL assertion below pass for the wrong reason.
  'provider' in o ? o.provider : 'paypal',
  o.provider_subscription_id ?? 'I-NEW', o.provider_customer_id ?? null,
  o.status ?? 'active', o.current_period_end ?? null,
  o.last_event_id ?? null, o.last_event_created ?? null,
  '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z',
);

test('2-4. the provider vocabulary is closed: stripe and paypal only', () => {
  const db = migrated();
  try {
    // 2, 3. both ratified rails are accepted.
    insert(db, { id: 'n-s', provider: 'stripe', provider_subscription_id: 'sub_new', provider_customer_id: 'cus_new' });
    insert(db, { id: 'n-p', provider: 'paypal', provider_subscription_id: 'I-PAYPAL-1' });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM subscriptions').get().n, SEED.length + 2);

    // 4. anything else is refused by the database itself, not by convention.
    for (const bad of ['Stripe', 'PAYPAL', 'xrpl', 'braintree', '', 'stripe ']) {
      assert.throws(
        () => insert(db, { id: `bad-${bad}`, provider: bad, provider_subscription_id: `x-${bad}` }),
        /CHECK constraint failed|constraint/i,
        `accepted provider ${JSON.stringify(bad)}`,
      );
    }
    // NULL is refused too.
    assert.throws(() => insert(db, { id: 'bad-null', provider: null, provider_subscription_id: 'x-null' }), /NOT NULL|constraint/i);
  } finally { db.close(); }
});

test('5. provider_subscription_id is UNIQUE across every rail', () => {
  const db = migrated();
  try {
    insert(db, { id: 'n-p', provider: 'paypal', provider_subscription_id: 'I-DUP' });
    assert.throws(
      () => insert(db, { id: 'n-p2', provider: 'paypal', provider_subscription_id: 'I-DUP' }),
      /UNIQUE|constraint/i,
      'a duplicate subscription id must be impossible',
    );
    // Even across providers — the guarantee is global, which is stronger.
    assert.throws(
      () => insert(db, { id: 'n-s2', provider: 'stripe', provider_subscription_id: 'I-DUP', provider_customer_id: 'cus_x' }),
      /UNIQUE|constraint/i,
    );
    // And a migrated Stripe id is still protected.
    assert.throws(
      () => insert(db, { id: 'n-s3', provider: 'stripe', provider_subscription_id: 'sub_alice', provider_customer_id: 'cus_x' }),
      /UNIQUE|constraint/i,
    );
  } finally { db.close(); }
});

test('6. a PayPal row needs no customer id, and a Stripe one keeps the one it had', () => {
  const db = migrated();
  try {
    insert(db, { id: 'n-p', provider: 'paypal', provider_subscription_id: 'I-NOCUST', provider_customer_id: null });
    assert.equal(db.prepare('SELECT provider_customer_id FROM subscriptions WHERE id = ?').get('n-p').provider_customer_id, null);
    assert.equal(db.prepare('SELECT provider_customer_id FROM subscriptions WHERE id = ?').get('s-1').provider_customer_id, 'cus_alice');
  } finally { db.close(); }
});

test('the status vocabulary gains exactly suspended and expired, and nothing more', () => {
  const db = migrated();
  try {
    const accepted = ['active', 'past_due', 'cancelled', 'incomplete', 'suspended', 'expired'];
    accepted.forEach((status, i) => {
      insert(db, { id: `st-${i}`, provider_subscription_id: `I-ST-${i}`, status });
    });
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM subscriptions').get().n, SEED.length + accepted.length);

    for (const bad of ['ACTIVE', 'paused', 'approval_pending', 'approved', 'deleted', '', 'activeX']) {
      assert.throws(
        () => insert(db, { id: `bad-st-${bad}`, provider_subscription_id: `I-BAD-${bad}`, status: bad }),
        /CHECK constraint failed|constraint/i,
        `accepted status ${JSON.stringify(bad)}`,
      );
    }
  } finally { db.close(); }
});

/* ====================================================== foreign keys === */

test('the user foreign key and ON DELETE CASCADE both survive the rebuild', () => {
  const db = migrated();
  try {
    const fks = db.prepare(`SELECT "table" AS t, "from" AS f, "to" AS c, on_delete FROM pragma_foreign_key_list('subscriptions')`).all();
    assert.equal(fks.length, 1, 'exactly one foreign key');
    assert.equal(fks[0].t, 'users');
    assert.equal(fks[0].f, 'user_id');
    assert.equal(fks[0].c, 'id');
    assert.equal(fks[0].on_delete, 'CASCADE');

    // Enforced, not merely declared.
    assert.throws(
      () => insert(db, { id: 'orphan', user_id: 'u-nobody', provider_subscription_id: 'I-ORPHAN' }),
      /FOREIGN KEY|constraint/i,
      'an orphan subscription must be impossible',
    );

    // And the cascade genuinely cascades.
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE user_id = ?').get('u-bob').n, 1);
    db.prepare('DELETE FROM users WHERE id = ?').run('u-bob');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE user_id = ?').get('u-bob').n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM subscriptions').get().n, SEED.length - 1, 'only that user\'s row went');
  } finally { db.close(); }
});

/* ====================================================== migration hygiene === */

test('0006 is additive to the chain: 0001-0005 are untouched and it applies once', () => {
  // The chain on disk is exactly what it should be, in order.
  assert.deepEqual(MIGRATIONS, [
    '0001_initial_schema.sql',
    '0002_login_tokens.sql',
    '0003_ordination_credentials.sql',
    '0004_subscription_event_ordering.sql',
    '0005_provider_neutral_donations.sql',
    '0006_provider_neutral_subscriptions.sql',
  ]);
  assert.ok(!MIGRATIONS.some((m) => m.startsWith('0007')), 'no migration 0007 may exist');

  // 0006 rebuilds subscriptions and touches nothing else. Asserted against
  // STATEMENTS, not prose: the migration's header explains at length why it
  // does NOT use `PRAGMA foreign_keys = OFF`, and a grep over raw text matches
  // that explanation and reports the very thing it rules out.
  const text = sql(M0006).split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  for (const other of ['donations', 'donation_intents', 'users', 'memberships', 'ordinations', 'scrolls', 'audit_logs']) {
    assert.ok(
      !new RegExp(`(CREATE TABLE|DROP TABLE|ALTER TABLE)\\s+${other}\\b`).test(text),
      `0006 must not touch ${other}`,
    );
  }
  // It is correct with foreign keys ON, so it never reaches for the pragma.
  assert.ok(!/PRAGMA\s+foreign_keys/i.test(text), '0006 must not depend on a connection-scoped pragma');

  // Applying it a second time fails, which is why D1 tracks applied
  // migrations — proof that it is not accidentally idempotent in a way that
  // would mask a double application.
  const db = migrated();
  try {
    assert.throws(() => db.exec(sql(M0006)), /already exists|no such (table|column)/i);
  } finally { db.close(); }
});
