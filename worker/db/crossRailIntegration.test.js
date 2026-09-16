/**
 * M14 integration checkpoint — the three rails as ONE system.
 *
 * Each milestone tested its own rail. This file tests the seams BETWEEN them,
 * which is where a defect can live while every per-milestone suite still
 * passes: one donations table, one subscriptions table, one membership
 * payment status, three providers writing to all of them.
 *
 * Run: node --test worker/db/crossRailIntegration.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedUser } from '../../test/helpers/d1.mjs';
import { repos } from './repositories.js';
import { membershipStatusFor } from '../payments/paypal.js';

function setup() {
  const { db, sqlite, close } = freshDb();
  seedUser(sqlite, { id: 'u-alice', email: 'u-alice@bm.test' });
  seedUser(sqlite, { id: 'u-bob', email: 'u-bob@bm.test' });
  sqlite.prepare(
    `INSERT INTO memberships (id, user_id, application_status, payment_status, membership_type, created_at, updated_at)
     VALUES ('m-1','u-alice','approved','pending_payment','paid','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`,
  ).run();
  return { db, sqlite, close, repo: repos(db) };
}

/* ============================================ one donations table, three rails === */

test('all three rails coexist in one donations table with correct units', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.donations.recordIfNew({
      userId: 'u-alice', provider: 'stripe', providerEventId: 'evt_stripe_1',
      providerTxnId: 'ch_1', amountCents: 5000, currency: 'usd', status: 'succeeded',
    });
    await repo.donations.recordIfNew({
      userId: 'u-alice', provider: 'paypal', providerEventId: 'WH-PP-1',
      providerTxnId: 'CAP-1', amountCents: 2500, currency: 'usd', status: 'completed',
    });
    await repo.donations.recordIfNew({
      userId: 'u-alice', provider: 'xrpl', providerEventId: 'A'.repeat(64),
      providerTxnId: 'A'.repeat(64), amountDrops: 25_000_000, currency: 'XRP',
      status: 'confirmed', xrplLedgerIndex: 90_000_100,
    });

    const rows = sqlite.prepare('SELECT provider, amount_cents, amount_drops, currency FROM donations ORDER BY provider').all();
    assert.deepEqual(rows.map(r => r.provider), ['paypal', 'stripe', 'xrpl']);
    // The units never mix: the schema makes the mistake unrepresentable.
    assert.equal(rows.find(r => r.provider === 'stripe').amount_drops, null);
    assert.equal(rows.find(r => r.provider === 'paypal').amount_drops, null);
    assert.equal(rows.find(r => r.provider === 'xrpl').amount_cents, null);
    assert.equal(rows.find(r => r.provider === 'xrpl').currency, 'XRP');

    // A member's history spans every rail in one list.
    const mine = await repo.donations.listByUser('u-alice', {});
    assert.equal(mine.length, 3);
  } finally { close(); }
});

test('the idempotency key is shared across rails and cannot be reused', async () => {
  const { sqlite, close, repo } = setup();
  try {
    const first = await repo.donations.recordIfNew({
      provider: 'stripe', providerEventId: 'SHARED-ID', providerTxnId: 'ch_1',
      amountCents: 100, currency: 'usd', status: 'succeeded',
    });
    assert.ok(first);
    // A DIFFERENT rail presenting the same delivery id is still a duplicate.
    // One UNIQUE column means one global idempotency guarantee.
    const second = await repo.donations.recordIfNew({
      provider: 'paypal', providerEventId: 'SHARED-ID', providerTxnId: 'CAP-1',
      amountCents: 999, currency: 'usd', status: 'completed',
    });
    assert.equal(second, null, 'a cross-rail id collision must not create a second gift');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n, 1);
    assert.equal(sqlite.prepare('SELECT provider FROM donations').get().provider, 'stripe', 'the first write stands');
  } finally { close(); }
});

test('a malformed row RAISES rather than vanishing, on every rail', async () => {
  const { close, repo } = setup();
  try {
    // ON CONFLICT ... DO NOTHING is scoped to the duplicate-delivery conflict
    // ONLY. A CHECK violation must not be silently reported as "already
    // recorded" — for a table representing money, that would be a lie.
    await assert.rejects(() => repo.donations.recordIfNew({
      provider: 'xrpl', providerEventId: 'bad-1', amountCents: 500, currency: 'usd', status: 'confirmed',
    }), /CHECK|constraint/i, 'an XRPL row carrying cents must raise');

    await assert.rejects(() => repo.donations.recordIfNew({
      provider: 'paypal', providerEventId: 'bad-2', amountDrops: 100, currency: 'XRP', status: 'completed',
    }), /CHECK|constraint/i, 'a fiat row carrying drops must raise');

    await assert.rejects(() => repo.donations.recordIfNew({
      provider: 'venmo', providerEventId: 'bad-3', amountCents: 100, currency: 'usd', status: 'completed',
    }), /CHECK|constraint/i, 'an unratified rail must raise');
  } finally { close(); }
});

/* ============================================ refund correlation across rails === */

test('a refund transitions ONLY the intended rail\'s donation', async () => {
  const { sqlite, close, repo } = setup();
  try {
    // Deliberately contrived: the same transaction id under two rails. It is
    // implausible in production (a Stripe charge id, a PayPal capture id and
    // an XRPL hash have disjoint shapes) but the STORE must not depend on
    // that coincidence — a provider-blind UPDATE would hit the wrong row.
    await repo.donations.recordIfNew({
      userId: 'u-alice', provider: 'stripe', providerEventId: 'evt_s',
      providerTxnId: 'SHARED-TXN', amountCents: 5000, currency: 'usd', status: 'succeeded',
    });
    await repo.donations.recordIfNew({
      userId: 'u-bob', provider: 'paypal', providerEventId: 'WH-p',
      providerTxnId: 'SHARED-TXN', amountCents: 2500, currency: 'usd', status: 'completed',
    });

    const moved = await repo.donations.transitionByProviderTxnId('SHARED-TXN', 'refunded', 'paypal');
    assert.equal(moved, true);

    // node:sqlite returns null-prototype rows; normalise before comparing.
    const rows = sqlite.prepare('SELECT provider, status FROM donations ORDER BY provider').all().map(r => ({ ...r }));
    assert.deepEqual(rows, [
      { provider: 'paypal', status: 'refunded' },
      { provider: 'stripe', status: 'succeeded' },
    ], 'a PayPal refund must never touch a Stripe gift');
  } finally { close(); }
});

test('a refund for a transaction on no rail changes nothing', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.donations.recordIfNew({
      provider: 'paypal', providerEventId: 'WH-1', providerTxnId: 'CAP-1',
      amountCents: 1000, currency: 'usd', status: 'completed',
    });
    assert.equal(await repo.donations.transitionByProviderTxnId('CAP-UNKNOWN', 'refunded', 'paypal'), false);
    assert.equal(await repo.donations.transitionByProviderTxnId(null, 'refunded', 'paypal'), false);
    assert.equal(sqlite.prepare('SELECT status FROM donations').get().status, 'completed');
  } finally { close(); }
});

/* ============================================ subscriptions across rails === */

test('one user may hold a Stripe and a PayPal subscription without collision', async () => {
  const { sqlite, close, repo } = setup();
  try {
    assert.equal(await repo.subscriptions.upsertFromWebhook({
      provider: 'stripe', userId: 'u-alice', providerSubscriptionId: 'sub_1',
      providerCustomerId: 'cus_1', status: 'active', eventId: 'evt_1', eventCreated: 1_770_000_000,
    }), 'inserted');
    assert.equal(await repo.subscriptions.upsertFromWebhook({
      provider: 'paypal', userId: 'u-alice', providerSubscriptionId: 'I-1',
      status: 'active', eventId: 'WH-1', eventCreated: Date.parse('2026-03-01T10:00:00.000Z'),
    }), 'inserted');

    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM subscriptions WHERE user_id = ?').get('u-alice').n, 2);
    // Each rail resolves only its own.
    assert.equal((await repo.subscriptions.byProviderSubscriptionId('stripe', 'sub_1')).provider, 'stripe');
    assert.equal((await repo.subscriptions.byProviderSubscriptionId('paypal', 'I-1')).provider, 'paypal');
    assert.equal(await repo.subscriptions.byProviderSubscriptionId('paypal', 'sub_1'), null,
      'a rail must not resolve another rail\'s subscription');
  } finally { close(); }
});

test('the second-and-+ rails cannot corrupt each other\'s ordering baseline', async () => {
  const { sqlite, close, repo } = setup();
  try {
    // Stripe stamps SECONDS (~1.77e9); PayPal parses to MILLISECONDS
    // (~1.77e12). If the two ever met on one row, every PayPal event would
    // look ~1000x newer and would always win.
    await repo.subscriptions.upsertFromWebhook({
      provider: 'stripe', userId: 'u-alice', providerSubscriptionId: 'sub_1',
      providerCustomerId: 'cus_1', status: 'active', eventId: 'evt_1', eventCreated: 1_770_000_000,
    });
    const out = await repo.subscriptions.upsertFromWebhook({
      provider: 'paypal', userId: 'u-alice', providerSubscriptionId: 'sub_1',
      status: 'cancelled', eventId: 'WH-1', eventCreated: 1_770_000_000_000,
    });
    assert.equal(out, 'provider_mismatch');
    const row = { ...sqlite.prepare('SELECT provider, status, last_event_created FROM subscriptions').get() };
    assert.deepEqual(row, { provider: 'stripe', status: 'active', last_event_created: 1_770_000_000 });
  } finally { close(); }
});

test('terminality is per provider and does not leak between rails', async () => {
  const { close, repo } = setup();
  try {
    // `expired` is terminal on PayPal but is NOT a Stripe outcome; a Stripe
    // row must keep exactly M14.2's rule (cancelled only).
    await repo.subscriptions.upsertFromWebhook({
      provider: 'paypal', userId: 'u-alice', providerSubscriptionId: 'I-1',
      status: 'expired', eventId: 'WH-1', eventCreated: 1_000,
    });
    assert.equal(await repo.subscriptions.upsertFromWebhook({
      provider: 'paypal', userId: 'u-alice', providerSubscriptionId: 'I-1',
      status: 'active', eventId: 'WH-2', eventCreated: 2_000,
    }), 'terminal');

    // Stripe: `incomplete` is not terminal, and a forward event still applies.
    await repo.subscriptions.upsertFromWebhook({
      provider: 'stripe', userId: 'u-bob', providerSubscriptionId: 'sub_9',
      providerCustomerId: 'cus_9', status: 'incomplete', eventId: 'evt_1', eventCreated: 1_000,
    });
    assert.equal(await repo.subscriptions.upsertFromWebhook({
      provider: 'stripe', userId: 'u-bob', providerSubscriptionId: 'sub_9',
      providerCustomerId: 'cus_9', status: 'active', eventId: 'evt_2', eventCreated: 2_000,
    }), 'updated');
  } finally { close(); }
});

/* ============================================ membership vocabulary === */

test('every status either maps into the membership CHECK or is refused outright', async () => {
  const { sqlite, close, repo } = setup();
  try {
    // migration 0001 constrains memberships.payment_status to exactly these.
    const allowed = ['pending_payment', 'active', 'past_due', 'cancelled'];
    for (const status of allowed) {
      assert.equal(await repo.memberships.setPaymentStatus('u-alice', status), true, `${status} must be writable`);
      assert.equal(sqlite.prepare('SELECT payment_status FROM memberships WHERE user_id = ?').get('u-alice').payment_status, status);
    }

    // PayPal's extra lifecycle states have no column of their own, so the
    // PayPal path maps them BEFORE writing. Proven end to end here: every
    // subscription status the PayPal rail can produce maps into the allowed
    // set, and every mapped value is genuinely writable.
    for (const s of ['active', 'past_due', 'suspended', 'cancelled', 'expired']) {
      const mapped = membershipStatusFor(s);
      assert.ok(allowed.includes(mapped), `${s} maps to ${mapped}, outside the membership CHECK`);
      assert.equal(await repo.memberships.setPaymentStatus('u-alice', mapped), true);
    }

    // And the database itself rejects anything outside the vocabulary, so a
    // future rail that forgets to map cannot quietly corrupt a membership.
    await assert.rejects(
      () => repo.memberships.setPaymentStatus('u-alice', 'suspended'),
      /CHECK|constraint/i,
      'an unmapped provider status must raise, not be stored',
    );
  } finally { close(); }
});

test('membership payment status is only ever written for a PAID membership', async () => {
  const { sqlite, close, repo } = setup();
  try {
    // u-bob has no membership row at all; a webhook resolving to them must
    // change nothing rather than create billing state from nowhere.
    assert.equal(await repo.memberships.setPaymentStatus('u-bob', 'active'), false);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM memberships').get().n, 1);

    // A FREE membership is never put into a paid subscription state.
    sqlite.prepare(
      `INSERT INTO memberships (id, user_id, application_status, membership_type, created_at, updated_at)
       VALUES ('m-2','u-bob','approved','free','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`,
    ).run();
    assert.equal(await repo.memberships.setPaymentStatus('u-bob', 'active'), false);
    assert.equal(sqlite.prepare('SELECT payment_status FROM memberships WHERE user_id = ?').get('u-bob').payment_status, null);
  } finally { close(); }
});

/* ============================================ deleting a user === */

test('deleting a user cascades subscriptions but PRESERVES the money record', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.subscriptions.upsertFromWebhook({
      provider: 'paypal', userId: 'u-alice', providerSubscriptionId: 'I-1',
      status: 'active', eventId: 'WH-1', eventCreated: 1_000,
    });
    await repo.donations.recordIfNew({
      userId: 'u-alice', provider: 'paypal', providerEventId: 'WH-S1',
      providerTxnId: 'SALE-1', amountCents: 1000, currency: 'usd', status: 'completed',
    });

    sqlite.prepare('DELETE FROM users WHERE id = ?').run('u-alice');

    // The subscription is billing state tied to a person: it goes.
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM subscriptions').get().n, 0);
    // The donation is a financial record the ministry must keep: it stays,
    // de-attributed. ON DELETE SET NULL, deliberately different from CASCADE.
    const d = sqlite.prepare('SELECT user_id, amount_cents FROM donations').get();
    assert.equal(d.user_id, null, 'the gift is de-attributed, not destroyed');
    assert.equal(d.amount_cents, 1000);
  } finally { close(); }
});
