/**
 * M14.2 — deterministic Stripe subscription event ordering.
 *
 * Every case runs against the REAL migration chain replayed into an in-memory
 * SQLite database by test/helpers/d1.mjs, and against the real repository.
 * Stripe is never contacted.
 *
 * M14.5B NOTE: the repository interface became provider-neutral, so the
 * VOCABULARY below changed (`providerSubscriptionId` for
 * `stripeSubscriptionId`, and an explicit `provider: 'stripe'`). Every
 * BEHAVIOURAL assertion is unchanged and deliberately so — this file is the
 * regression proof that generalizing the schema cost none of M14.2's
 * guarantees.
 *
 * The contract under test, in precedence order:
 *   1 cancelled is terminal
 *   2 same event.id            -> duplicate
 *   3 older event.created      -> stale_event
 *   4 equal created, other id  -> ambiguous  (FAIL CLOSED)
 *   5 older billing period     -> stale
 *   6 otherwise                -> inserted | updated
 *
 * Run: node --test worker/db/subscriptionOrdering.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, seedUser } from '../../test/helpers/d1.mjs';
import { repos } from './repositories.js';
import { subscriptionEventFromEvent, donationFromEvent } from '@reellink/payments/stripe.js';

/** Unix seconds, so the numbers read like Stripe's. */
const T1 = 1_770_000_000;
const T2 = T1 + 3600;
const T3 = T2 + 3600;

const FEB = '2026-02-01T00:00:00.000Z';
const MAR = '2026-03-01T00:00:00.000Z';
const APR = '2026-04-01T00:00:00.000Z';

function setup() {
  const { db, sqlite, close } = freshDb();
  seedUser(sqlite, { id: 'u-alice', email: 'u-alice@bm.test' });
  // A paid membership, so payment_status is actually writable (setPaymentStatus
  // only touches membership_type = 'paid').
  sqlite.prepare(
    `INSERT INTO memberships (id, user_id, application_status, payment_status, membership_type, created_at, updated_at)
     VALUES ('m-1','u-alice','approved','pending_payment','paid','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`,
  ).run();
  return { db, sqlite, close, repo: repos(db) };
}

const row = (sqlite, id = 'sub_1') =>
  sqlite.prepare('SELECT * FROM subscriptions WHERE provider_subscription_id = ?').get(id);

/**
 * One subscription-lifecycle event, in the provider-neutral vocabulary the
 * Stripe adapter now maps into. `stripeSubscriptionId` is still accepted as a
 * convenience alias in these cases so the behavioural assertions below read
 * exactly as they did in M14.2.
 */
const ev = ({ stripeSubscriptionId, stripeCustomerId, ...o } = {}) => ({
  provider: 'stripe',
  userId: 'u-alice',
  providerSubscriptionId: stripeSubscriptionId ?? 'sub_1',
  providerCustomerId: stripeCustomerId ?? 'cus_1',
  status: 'active', currentPeriodEnd: null, eventId: 'evt_x', eventCreated: T1, ...o,
});

/* ================================================ schema is in place === */

test('the M14.2 ordering columns survive the 0006 rebuild intact', () => {
  const { sqlite, close } = setup();
  try {
    // `notnull` must be quoted — it is a keyword in this projection context.
    const cols = sqlite.prepare(`SELECT name, type, "notnull" AS nn FROM pragma_table_info('subscriptions')`).all();
    const byName = Object.fromEntries(cols.map(c => [c.name, c]));
    assert.ok(byName.last_event_id, 'last_event_id must exist');
    assert.ok(byName.last_event_created, 'last_event_created must exist');
    assert.equal(byName.last_event_created.type, 'INTEGER', 'ordering key must be numeric');
    // The post-0006 shape, and nothing beyond it.
    assert.deepEqual(cols.map(c => c.name).sort(), [
      'created_at', 'current_period_end', 'id', 'last_event_created', 'last_event_id',
      'provider', 'provider_customer_id', 'provider_subscription_id',
      'status', 'updated_at', 'user_id',
    ].sort());
    // Both still nullable, so a row with no baseline remains valid.
    assert.equal(byName.last_event_id.nn, 0);
    assert.equal(byName.last_event_created.nn, 0);
  } finally { close(); }
});

/* ========================================================= A - N === */

test('A. an exact duplicate event id is ignored', async () => {
  const { sqlite, close, repo } = setup();
  try {
    assert.equal(await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_1', eventCreated: T1, status: 'active', currentPeriodEnd: MAR })), 'inserted');
    // Same delivery again — later status must not take effect.
    assert.equal(await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_1', eventCreated: T1, status: 'past_due', currentPeriodEnd: MAR })), 'duplicate');
    assert.equal(row(sqlite).status, 'active');
    assert.equal(row(sqlite).last_event_id, 'evt_1');
  } finally { close(); }
});

test('B. an older event.created for the same period is ignored', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_2', eventCreated: T2, status: 'active', currentPeriodEnd: MAR }));
    assert.equal(await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_1', eventCreated: T1, status: 'past_due', currentPeriodEnd: MAR })), 'stale_event');
    assert.equal(row(sqlite).status, 'active');
    assert.equal(row(sqlite).last_event_created, T2, 'the marker must not rewind');
  } finally { close(); }
});

test('C. a newer event.created for the same period is accepted', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_1', eventCreated: T1, status: 'active', currentPeriodEnd: MAR }));
    assert.equal(await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_2', eventCreated: T2, status: 'past_due', currentPeriodEnd: MAR })), 'updated');
    assert.equal(row(sqlite).status, 'past_due');
    assert.equal(row(sqlite).last_event_created, T2);
    assert.equal(row(sqlite).last_event_id, 'evt_2');
  } finally { close(); }
});

test('D. invoice.paid then an OLDER invoice.payment_failed stays active', async () => {
  const { sqlite, close, repo } = setup();
  try {
    // The failure was created first but delivered second — the exact gap M14.1
    // could not close, because both events share one billing period.
    await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_paid', eventCreated: T2, status: 'active', currentPeriodEnd: MAR }));
    assert.equal(await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_fail', eventCreated: T1, status: 'past_due', currentPeriodEnd: MAR })), 'stale_event');
    assert.equal(row(sqlite).status, 'active', 'a member who paid must not be downgraded by an older event');
  } finally { close(); }
});

test('E. invoice.payment_failed then a NEWER invoice.paid becomes active', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_fail', eventCreated: T1, status: 'past_due', currentPeriodEnd: MAR }));
    assert.equal(await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_paid', eventCreated: T2, status: 'active', currentPeriodEnd: MAR })), 'updated');
    assert.equal(row(sqlite).status, 'active', 'a member who fixed their card must be restored');
  } finally { close(); }
});

test('F. a NEWER payment failure after a payment does downgrade — current state wins', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_paid', eventCreated: T1, status: 'active', currentPeriodEnd: MAR }));
    // Genuinely later: e.g. the card was charged back, or the next attempt failed.
    assert.equal(await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_fail', eventCreated: T2, status: 'past_due', currentPeriodEnd: MAR })), 'updated');
    assert.equal(row(sqlite).status, 'past_due', 'the newest unambiguous event is authoritative');
  } finally { close(); }
});

test('G. cancelled stays cancelled against a late invoice.paid', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_1', eventCreated: T1, status: 'active', currentPeriodEnd: MAR }));
    await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_2', eventCreated: T2, status: 'cancelled' }));
    assert.equal(row(sqlite).status, 'cancelled');
    // Even a strictly NEWER event cannot resurrect it.
    assert.equal(await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_3', eventCreated: T3, status: 'active', currentPeriodEnd: APR })), 'terminal');
    assert.equal(row(sqlite).status, 'cancelled');
    assert.equal(row(sqlite).last_event_id, 'evt_2', 'a refused event must not advance the marker');
  } finally { close(); }
});

test('H. an older billing period is ignored even when the event is newer', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_mar', eventCreated: T1, status: 'active', currentPeriodEnd: MAR }));
    // Created later, but ABOUT February — e.g. an old invoice marked
    // uncollectible weeks after the member already paid for March.
    assert.equal(await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_feb', eventCreated: T3, status: 'past_due', currentPeriodEnd: FEB })), 'stale');
    assert.equal(row(sqlite).status, 'active');
    assert.equal(row(sqlite).current_period_end, MAR, 'the period must not rewind');
  } finally { close(); }
});

test('I. a newer billing period is accepted', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_mar', eventCreated: T1, status: 'active', currentPeriodEnd: MAR }));
    assert.equal(await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_apr', eventCreated: T2, status: 'active', currentPeriodEnd: APR })), 'updated');
    assert.equal(row(sqlite).current_period_end, APR);
  } finally { close(); }
});

test('J. equal event.created with different ids FAILS CLOSED, deterministically', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_aaa', eventCreated: T1, status: 'active', currentPeriodEnd: MAR }));
    // Stripe stamped both in the same second. Nothing on the events says which
    // came first, so neither is allowed to move state — breaking the tie on id
    // order would let string comparison decide a member's billing standing.
    assert.equal(await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_zzz', eventCreated: T1, status: 'past_due', currentPeriodEnd: MAR })), 'ambiguous');
    assert.equal(row(sqlite).status, 'active');

    // Deterministic: the outcome does not depend on which id happens to sort
    // first, nor on arrival order.
    assert.equal(await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_000', eventCreated: T1, status: 'past_due', currentPeriodEnd: MAR })), 'ambiguous');
    assert.equal(row(sqlite).status, 'active');
    assert.equal(row(sqlite).last_event_id, 'evt_aaa', 'the marker stays on the last accepted event');

    // And the NEXT unambiguous event re-establishes truth.
    assert.equal(await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_next', eventCreated: T2, status: 'past_due', currentPeriodEnd: MAR })), 'updated');
    assert.equal(row(sqlite).status, 'past_due');
  } finally { close(); }
});

test('K. a genuine resubscription with a NEW subscription id is allowed', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_1', eventCreated: T1, status: 'active', currentPeriodEnd: MAR }));
    await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_2', eventCreated: T2, status: 'cancelled' }));
    assert.equal(row(sqlite, 'sub_1').status, 'cancelled');

    // Stripe issues a new subscription id when the member subscribes again, so
    // the terminal guard on the OLD row never blocks a returning member.
    assert.equal(await repo.subscriptions.upsertFromWebhook(ev({
      stripeSubscriptionId: 'sub_2', eventId: 'evt_3', eventCreated: T3, status: 'active', currentPeriodEnd: APR,
    })), 'inserted');
    assert.equal(row(sqlite, 'sub_2').status, 'active');
    assert.equal(row(sqlite, 'sub_1').status, 'cancelled', 'the old subscription stays closed');
  } finally { close(); }
});

test('L. a rejected event leaves membership.payment_status untouched', async () => {
  const { db, sqlite, close, repo } = setup();
  try {
    await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_1', eventCreated: T2, status: 'active', currentPeriodEnd: MAR }));
    await repos(db).memberships.setPaymentStatus('u-alice', 'active');
    assert.equal(sqlite.prepare('SELECT payment_status FROM memberships WHERE user_id = ?').get('u-alice').payment_status, 'active');

    // A stale failure. The route only writes payment_status on an accepted
    // outcome, so the rejection below must leave the membership alone.
    const outcome = await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_0', eventCreated: T1, status: 'past_due', currentPeriodEnd: MAR }));
    assert.equal(outcome, 'stale_event');
    assert.ok(!['inserted', 'updated'].includes(outcome), 'the route treats this as nothing happened');
    assert.equal(sqlite.prepare('SELECT payment_status FROM memberships WHERE user_id = ?').get('u-alice').payment_status, 'active');
    assert.equal(row(sqlite).status, 'active');
  } finally { close(); }
});

test('M. an accepted event leaves subscription and membership consistent', async () => {
  const { db, sqlite, close, repo } = setup();
  try {
    const outcome = await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_1', eventCreated: T1, status: 'active', currentPeriodEnd: MAR }));
    assert.ok(['inserted', 'updated'].includes(outcome));
    await repos(db).memberships.setPaymentStatus('u-alice', 'active');

    const sub = row(sqlite);
    assert.equal(sub.status, 'active');
    assert.equal(sub.current_period_end, MAR);
    assert.equal(sub.last_event_id, 'evt_1');
    assert.equal(sub.last_event_created, T1);
    assert.equal(sqlite.prepare('SELECT payment_status FROM memberships WHERE user_id = ?').get('u-alice').payment_status, 'active');
  } finally { close(); }
});

test('N. donation webhook idempotency is unchanged', async () => {
  const { db, sqlite, close } = setup();
  try {
    const repo = repos(db);
    const donation = {
      provider: 'stripe', providerEventId: 'evt_d1', providerTxnId: 'pi_1',
      amountCents: 5000, currency: 'usd', status: 'succeeded', referenceUrl: null, userId: 'u-alice',
    };
    const first = await repo.donations.recordIfNew(donation);
    const second = await repo.donations.recordIfNew(donation);
    assert.ok(first, 'the first delivery records');
    assert.equal(second, null, 'a redelivery is a no-op');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n, 1);
    // Donation idempotency remains keyed on the delivery id, untouched by 0004.
    assert.equal(sqlite.prepare('SELECT provider_event_id FROM donations').get().provider_event_id, 'evt_d1');
  } finally { close(); }
});

test('16. an event with unusable ordering metadata fails safely, it is not applied', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_good', eventCreated: T2, status: 'active', currentPeriodEnd: MAR }));

    // Once a baseline exists, an event that cannot be placed in time must not
    // change state — accepting it would decide by ARRIVAL order, the exact
    // defect this contract removes. Real Stripe events always carry `created`.
    for (const bad of [null, undefined, NaN, Infinity, '1770000000', {}, [], 'soon']) {
      const outcome = await repo.subscriptions.upsertFromWebhook(
        ev({ eventId: 'evt_bad', eventCreated: bad, status: 'cancelled', currentPeriodEnd: MAR }),
      );
      assert.equal(outcome, 'unorderable', `accepted an unorderable event: ${JSON.stringify(bad)}`);
    }
    const after = row(sqlite);
    assert.equal(after.status, 'active', 'state must be untouched');
    assert.equal(after.last_event_id, 'evt_good', 'the marker must be untouched');
    assert.equal(after.last_event_created, T2);
  } finally { close(); }
});

test('16b. a malformed event cannot crash the store or write a bad marker', async () => {
  const { sqlite, close, repo } = setup();
  try {
    // No baseline yet: there is nothing to regress, so the row is created and
    // the marker is left NULL rather than written with junk.
    const outcome = await repo.subscriptions.upsertFromWebhook(
      ev({ eventId: null, eventCreated: NaN, status: 'active', currentPeriodEnd: MAR }),
    );
    assert.equal(outcome, 'inserted');
    const r = row(sqlite);
    assert.equal(r.status, 'active');
    assert.equal(r.last_event_created, null, 'a non-finite timestamp must never be stored');
    assert.equal(r.last_event_id, null);
    // And a subsequent well-formed event establishes the baseline properly.
    assert.equal(await repo.subscriptions.upsertFromWebhook(ev({ eventId: 'evt_ok', eventCreated: T1, status: 'past_due', currentPeriodEnd: MAR })), 'updated');
    assert.equal(row(sqlite).last_event_created, T1);
  } finally { close(); }
});

/* ============================================ pre-0004 rows and shapes === */

test('17. a legacy row with NULL ordering metadata accepts its first event and initializes', async () => {
  const { sqlite, close, repo } = setup();
  try {
    // Simulate a row written before the migration: ordering columns NULL.
    sqlite.prepare(
      `INSERT INTO subscriptions (id, user_id, provider, provider_subscription_id, provider_customer_id, status, current_period_end, created_at, updated_at)
       VALUES ('s-old','u-alice','stripe','sub_old','cus_1','active',?,?,?)`,
    ).run(MAR, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    const before = row(sqlite, 'sub_old');
    assert.equal(before.last_event_id, null);
    assert.equal(before.last_event_created, null);

    assert.equal(await repo.subscriptions.upsertFromWebhook(ev({
      stripeSubscriptionId: 'sub_old', eventId: 'evt_new', eventCreated: T2, status: 'past_due', currentPeriodEnd: MAR,
    })), 'updated');
    const after = row(sqlite, 'sub_old');
    assert.equal(after.status, 'past_due');
    assert.equal(after.last_event_id, 'evt_new', 'the baseline is now recorded');
    assert.equal(after.last_event_created, T2);
  } finally { close(); }
});

test('all four subscription event shapes carry Stripe ordering metadata', () => {
  const shapes = [
    { id: 'evt_a', created: T1, type: 'checkout.session.completed', data: { object: { mode: 'subscription', subscription: 'sub_1', customer: 'cus_1', metadata: { user_id: 'u-alice' } } } },
    { id: 'evt_b', created: T2, type: 'invoice.paid', data: { object: { id: 'in_1', subscription: 'sub_1', customer: 'cus_1', lines: { data: [{ period: { end: 1772323200 } }] } } } },
    { id: 'evt_c', created: T3, type: 'invoice.payment_failed', data: { object: { id: 'in_2', subscription: 'sub_1', customer: 'cus_1', lines: { data: [{ period: { end: 1772323200 } }] } } } },
    { id: 'evt_d', created: T3, type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', customer: 'cus_1' } } },
  ];
  for (const raw of shapes) {
    const out = subscriptionEventFromEvent(raw);
    assert.ok(out, `${raw.type} must normalize`);
    assert.equal(out.stripeEventId, raw.id, `${raw.type} must carry the delivery id`);
    assert.equal(out.eventCreated, raw.created, `${raw.type} must carry Stripe's own timestamp`);
  }
  // A malformed or absent timestamp degrades to null rather than a bad number.
  const noTime = subscriptionEventFromEvent({ id: 'evt_e', type: 'customer.subscription.deleted', data: { object: { id: 'sub_1' } } });
  assert.equal(noTime.eventCreated, null);
});

test('only identifiers and a timestamp are persisted — no payload, no PII', () => {
  const out = subscriptionEventFromEvent({
    id: 'evt_pii', created: T1, type: 'invoice.paid',
    data: { object: {
      id: 'in_1', subscription: 'sub_1', customer: 'cus_1',
      customer_email: 'donor@example.com', customer_name: 'A Donor',
      payment_method_details: { card: { last4: '4242', brand: 'visa' } },
      hosted_invoice_url: 'https://stripe/x', lines: { data: [{ period: { end: 1772323200 } }] },
    } },
  });
  const serialised = JSON.stringify(out);
  for (const leak of ['donor@example.com', 'A Donor', '4242', 'visa', 'payment_method_details']) {
    assert.ok(!serialised.includes(leak), `subscription state must not carry ${leak}`);
  }
  assert.deepEqual(Object.keys(out).sort(), ['currentPeriodEnd', 'eventCreated', 'status', 'stripeCustomerId', 'stripeEventId', 'stripeSubscriptionId', 'userId'].sort());
  // And the donation shape is likewise unchanged and minimal.
  assert.ok(!JSON.stringify(donationFromEvent({ id: 'e', created: T1, type: 'invoice.paid', data: { object: { id: 'in', amount_paid: 100, currency: 'usd' } } })).includes('card'));
});
