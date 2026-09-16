/**
 * M14.5B — PayPal recurring support, end to end through the real router.
 *
 * PayPal is stubbed at `globalThis.fetch`; the routes, guards, ordering
 * contract, repositories and migration chain are all real. No PayPal account
 * is contacted and no money moves.
 *
 * PLAN IDS: none is invented. The catalogue still holds placeholders; the
 * configured path is exercised by supplying owner-set configuration
 * (`PAYPAL_PLAN_SUPPORTER`) in a test env, which is exactly how the owner will
 * enable it.
 *
 * Run: node --test worker/routes/paypalRecurring.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '@reellink/api/router.js';
import { freshDb, seedUser } from '../../test/helpers/d1.mjs';
import { PROD_FLAGS, asMember, auditRows } from '../../test/helpers/route.mjs';
import { mount } from './public.js';
import { repos } from '../db/repositories.js';
import { __clearTokenCache, membershipStatusFor, eventCreatedMs, subscriptionEventFromEvent } from '../payments/paypal.js';
import { projectDonation } from '../../src/pages/admin/adminQueues.js';

const SECRET = 'sb-client-secret-DO-NOT-LEAK';
const TOKEN = 'A21AA-sandbox-access-token-DO-NOT-LEAK';
const NONCE = 'abcdefghij123456';
const PLAN = 'P-5ML4271244454362WXNWU5NQ';   // shape only; never sent to PayPal here
const SUB_ID = 'I-BW452GLLEP1G';

let cached = null;
function router() {
  if (!cached) { cached = new Router(); mount(cached); }
  return cached;
}

/** Base env. `plans` opts the three tiers into a configured state. */
function env({ plans = false, ...extra } = {}) {
  return {
    SITE_URL: 'https://blockchainministries.io',
    PAYPAL_ENVIRONMENT: 'sandbox',
    PAYPAL_CLIENT_ID: 'sb-client-id',
    PAYPAL_CLIENT_SECRET: SECRET,
    PAYPAL_WEBHOOK_ID: 'WH-SANDBOX-1',
    ...(plans ? { PAYPAL_PLAN_SUPPORTER: PLAN } : {}),
    EMAIL_PROVIDER: 'resend', EMAIL_API_KEY: 'k',
    EMAIL_FROM: 'contact@blockchainministries.io',
    ADMIN_NOTIFY_EMAIL: 'ops@bm.test',
    ...extra,
  };
}

const SIGNED = {
  'paypal-transmission-id': 'tx-1',
  'paypal-transmission-time': '2026-09-12T00:00:00Z',
  'paypal-cert-url': 'https://api.sandbox.paypal.com/cert.pem',
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-transmission-sig': 'sig',
};

function stubPayPal({ subscription = null, apiStatus = 200, verify = 'SUCCESS' } = {}) {
  const calls = [];
  const mail = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.includes('paypal.com')) { mail.push(String(init?.body ?? '')); return new Response('{}', { status: 200 }); }
    calls.push({ url: u, headers: init.headers ?? {}, body: init.body ? String(init.body) : null });
    if (u.endsWith('/v1/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: TOKEN, expires_in: 32400 }), { status: 200 });
    }
    if (u.endsWith('/v1/notifications/verify-webhook-signature')) {
      return new Response(JSON.stringify({ verification_status: verify }), { status: 200 });
    }
    if (apiStatus !== 200) return new Response(JSON.stringify({ name: 'INTERNAL_SERVER_ERROR' }), { status: apiStatus });
    return new Response(JSON.stringify(subscription ?? {
      id: SUB_ID,
      status: 'APPROVAL_PENDING',
      links: [
        { rel: 'approve', href: 'https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=BA-1' },
        { rel: 'self', href: `https://api-m.sandbox.paypal.com/v1/billing/subscriptions/${SUB_ID}` },
      ],
    }), { status: 201 });
  };
  return {
    calls, mail,
    subs: () => calls.filter(c => c.url.endsWith('/v1/billing/subscriptions')),
    restore() { globalThis.fetch = original; },
  };
}

async function call({ db, path, method = 'POST', session = null, body, headers = {}, extraEnv = {} }) {
  const url = new URL(`https://blockchainministries.io${path}`);
  const request = new Request(url, {
    method,
    headers: {
      'CF-Connecting-IP': '203.0.113.77',
      ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    ...(method === 'POST' ? { body: typeof body === 'string' ? body : JSON.stringify(body ?? {}) } : {}),
  });
  return router().handle({
    request, url, env: { DB: db, ...env(extraEnv) },
    flags: { ...PROD_FLAGS }, session, sessionLoaded: true,
  });
}

function setup() {
  __clearTokenCache();
  const { db, sqlite, close } = freshDb();
  seedUser(sqlite, { id: 'u-alice', email: 'u-alice@bm.test' });
  sqlite.prepare(
    `INSERT INTO memberships (id, user_id, application_status, payment_status, membership_type, created_at, updated_at)
     VALUES ('m-1','u-alice','approved','pending_payment','paid','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')`,
  ).run();
  return { db, sqlite, repo: repos(db), close: () => { close(); __clearTokenCache(); } };
}

const sub = (sqlite, id = SUB_ID) =>
  sqlite.prepare('SELECT * FROM subscriptions WHERE provider_subscription_id = ?').get(id);
const paymentStatus = (sqlite, userId = 'u-alice') =>
  sqlite.prepare('SELECT payment_status FROM memberships WHERE user_id = ?').get(userId).payment_status;
const countDonations = (sqlite) => sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n;

/* --------------------------------------------------------------- events -- */

const T1 = '2026-03-01T10:00:00.000Z';
const T2 = '2026-03-01T11:00:00.000Z';
const T3 = '2026-03-01T12:00:00.000Z';

/** A subscription lifecycle webhook. */
const lifecycle = (type, o = {}) => JSON.stringify({
  id: o.eventId ?? 'WH-L1',
  create_time: o.createTime ?? T1,
  event_type: type,
  resource: { id: o.subscriptionId ?? SUB_ID, custom_id: o.customId ?? 'u-alice', status: o.status ?? 'ACTIVE' },
});

/** A recurring payment webhook (PAYMENT.SALE.*). */
const sale = (type, o = {}) => JSON.stringify({
  id: o.eventId ?? 'WH-S1',
  create_time: o.createTime ?? T2,
  event_type: type,
  resource: {
    id: o.saleId ?? 'SALE-1',
    amount: { total: o.total ?? '10.00', currency: o.currency ?? 'USD' },
    ...(o.billingAgreementId === null ? {} : { billing_agreement_id: o.billingAgreementId ?? SUB_ID }),
    ...(o.saleRef ? { sale_id: o.saleRef } : {}),
    ...(o.links ? { links: o.links } : {}),
  },
});

const webhook = (db, raw, headers = SIGNED, extraEnv = {}) =>
  call({ db, path: '/api/webhooks/paypal', body: raw, headers, extraEnv });

/* ================================================ 14-18. creation guards === */

test('14. recurring requires authentication — an anonymous attempt cannot start one', async () => {
  const { db, close } = setup();
  const stub = stubPayPal();
  try {
    const res = await call({
      db, path: '/api/donations/paypal/subscriptions',
      body: { tier: 'supporter', request_id: NONCE }, extraEnv: { plans: true },
    });
    assert.equal(res.status, 401, 'an anonymous recurring commitment has nobody to manage it');
    assert.equal(stub.subs().length, 0, 'PayPal must not be contacted at all');
  } finally { stub.restore(); close(); }
});

test('15, 19. a signed-in member names a TIER, and creation never claims active', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    const res = await call({
      db, path: '/api/donations/paypal/subscriptions', session: asMember('u-alice'),
      body: { tier: 'supporter', request_id: NONCE }, extraEnv: { plans: true },
    });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.equal(b.id, SUB_ID);
    assert.equal(b.status, 'APPROVAL_PENDING', 'PayPal\'s own word, untranslated');
    assert.notEqual(b.status, 'ACTIVE');
    assert.ok(b.approval_url.startsWith('https://www.sandbox.paypal.com/'));
    assert.deepEqual(Object.keys(b).sort(), ['approval_url', 'id', 'status']);

    // 19. NOTHING is persisted. Only a verified ACTIVATED webhook creates a row.
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM subscriptions').get().n, 0);
    assert.equal(paymentStatus(sqlite), 'pending_payment', 'membership is untouched by creation');

    // The server chose the plan and the subscriber; the browser chose neither.
    const sent = JSON.parse(stub.subs()[0].body);
    assert.equal(sent.plan_id, PLAN);
    assert.equal(sent.custom_id, 'u-alice');
    assert.ok(!stub.subs()[0].body.includes('u-alice@bm.test'), 'no email may reach PayPal');
  } finally { stub.restore(); close(); }
});

test('16. an unknown tier is rejected before PayPal is contacted', async () => {
  const { db, close } = setup();
  const stub = stubPayPal();
  try {
    for (const bad of ['patron', 'PATRON', '', '__proto__', 'constructor', 'toString',
      'P-5ML4271244454362WXNWU5NQ', 'supporter,guardian', 42, null, undefined, {}, []]) {
      const res = await call({
        db, path: '/api/donations/paypal/subscriptions', session: asMember('u-alice'),
        body: { tier: bad, request_id: NONCE }, extraEnv: { plans: true },
      });
      assert.equal(res.status, 400, `accepted tier ${JSON.stringify(bad)}`);
    }
    assert.equal(stub.subs().length, 0);

    // The shared validator TRIMS, so 'supporter ' resolves to the real tier
    // rather than being refused. That is leniency, not a hole: the post-trim
    // value must still be one of exactly three keys, so the reachable input
    // space is unchanged and no new plan becomes addressable. The resolver
    // itself is strict — resolvePayPalTier('supporter ') is null — and that is
    // asserted in worker/payments/paypal.test.js.
    const trimmed = await call({
      db, path: '/api/donations/paypal/subscriptions', session: asMember('u-alice'),
      body: { tier: 'supporter ', request_id: NONCE }, extraEnv: { plans: true },
    });
    assert.equal(trimmed.status, 201);
    assert.equal(JSON.parse(stub.subs()[0].body).plan_id, PLAN, 'it resolves to the SAME tier, not another plan');
  } finally { stub.restore(); close(); }
});

test('17. an arbitrary PayPal Plan id is structurally impossible to inject', async () => {
  const { db, close } = setup();
  const stub = stubPayPal();
  try {
    // Every channel a caller might try: as the tier, and as extra fields.
    const attempts = [
      { tier: 'P-ATTACKER-PLAN', request_id: NONCE },
      { tier: 'supporter', plan_id: 'P-ATTACKER-PLAN', request_id: NONCE },
      { tier: 'supporter', paypalPlanId: 'P-ATTACKER-PLAN', request_id: NONCE },
      { tier: 'supporter', request_id: NONCE, plan: { id: 'P-ATTACKER-PLAN' } },
    ];
    for (const body of attempts) {
      await call({
        db, path: '/api/donations/paypal/subscriptions', session: asMember('u-alice'),
        body, extraEnv: { plans: true },
      });
    }
    // Whatever reached PayPal, it was never the attacker's plan.
    for (const c of stub.subs()) {
      assert.ok(!c.body.includes('P-ATTACKER-PLAN'), 'an injected Plan id reached PayPal');
      assert.equal(JSON.parse(c.body).plan_id, PLAN);
    }
  } finally { stub.restore(); close(); }
});

test('18. an unconfigured (placeholder) plan fails closed, and the UI is told', async () => {
  const { db, close } = setup();
  const stub = stubPayPal();
  try {
    // No PAYPAL_PLAN_* configuration: every tier is still a placeholder.
    for (const tier of ['supporter', 'guardian', 'archangel']) {
      const res = await call({
        db, path: '/api/donations/paypal/subscriptions', session: asMember('u-alice'),
        body: { tier, request_id: NONCE },
      });
      assert.equal(res.status, 400, `${tier} must fail closed while unconfigured`);
    }
    assert.equal(stub.subs().length, 0, 'a placeholder must never reach PayPal');

    const off = await (await call({ db, path: '/api/donations/config', method: 'GET' })).json();
    assert.equal(off.paypal.recurring_available, false);
    assert.ok(off.tiers.every(t => t.paypal_available === false));

    // And with one tier configured, only that one opens.
    const on = await (await call({ db, path: '/api/donations/config', method: 'GET', extraEnv: { plans: true } })).json();
    assert.equal(on.paypal.recurring_available, true);
    assert.deepEqual(on.tiers.map(t => [t.key, t.paypal_available]), [
      ['supporter', true], ['guardian', false], ['archangel', false],
    ]);
    // No Plan id is ever exposed.
    assert.ok(!JSON.stringify(on).includes(PLAN));
  } finally { stub.restore(); close(); }
});

/* ================================================ 20-25. lifecycle === */

test('20. an unverified lifecycle webhook changes nothing', async () => {
  const cases = [
    ['verification refused', { verify: 'FAILURE' }, SIGNED],
    ['no signature', {}, {}],
    ...Object.keys(SIGNED).map(h => [`missing ${h}`, {}, Object.fromEntries(Object.entries(SIGNED).filter(([k]) => k !== h))]),
  ];
  for (const [label, opts, headers] of cases) {
    const { db, sqlite, close } = setup();
    const stub = stubPayPal(opts);
    try {
      const res = await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED'), headers);
      assert.equal(res.status, 400, `accepted ${label}`);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM subscriptions').get().n, 0, `${label} wrote a subscription`);
      assert.equal(paymentStatus(sqlite), 'pending_payment', `${label} changed membership`);
    } finally { stub.restore(); close(); }
  }
});

test('21, 30. an ACTIVATED event creates the subscription and the membership together', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    const res = await (await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T1 }))).json();
    assert.deepEqual(res, { received: true, subscription: 'synced' });

    const row = sub(sqlite);
    assert.equal(row.provider, 'paypal');
    assert.equal(row.status, 'active');
    assert.equal(row.user_id, 'u-alice', 'identity comes from custom_id the server itself set');
    assert.equal(row.provider_customer_id, null, 'PayPal needs no customer id');
    assert.equal(row.last_event_id, 'WH-A');
    assert.equal(row.last_event_created, Date.parse(T1), 'ordering uses PayPal\'s own clock, in ms');
    assert.equal(paymentStatus(sqlite), 'active', '30. subscription and membership move together');

    // 15/36. Activation is NOT a payment, so nothing is announced and nothing
    // is recorded as a gift.
    assert.equal(countDonations(sqlite), 0);
    assert.equal(stub.mail.length, 0, 'activation is not money received');
  } finally { stub.restore(); close(); }
});

test('22. a PAYMENT.FAILED event moves the member to past_due', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T1 }));
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.PAYMENT.FAILED', { eventId: 'WH-F', createTime: T2 }));
    assert.equal(sub(sqlite).status, 'past_due');
    assert.equal(paymentStatus(sqlite), 'past_due');
  } finally { stub.restore(); close(); }
});

test('23. SUSPENDED is recoverable, per PayPal\'s own lifecycle — not terminal', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T1 }));
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.SUSPENDED', { eventId: 'WH-S', createTime: T2 }));
    assert.equal(sub(sqlite).status, 'suspended');
    // `suspended` has no membership column of its own; it maps to the nearest
    // TRUE meaning rather than inventing vocabulary or overstating as cancelled.
    assert.equal(paymentStatus(sqlite), 'past_due');
    assert.notEqual(paymentStatus(sqlite), 'cancelled');

    // PayPal documents an activate endpoint and allows updates while
    // SUSPENDED, so reactivation must genuinely work.
    const back = await (await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A2', createTime: T3 }))).json();
    assert.deepEqual(back, { received: true, subscription: 'synced' });
    assert.equal(sub(sqlite).status, 'active');
    assert.equal(paymentStatus(sqlite), 'active');
  } finally { stub.restore(); close(); }
});

test('24, 25. CANCELLED and EXPIRED are terminal and cannot be resurrected', async () => {
  for (const [type, status] of [['BILLING.SUBSCRIPTION.CANCELLED', 'cancelled'], ['BILLING.SUBSCRIPTION.EXPIRED', 'expired']]) {
    const { db, sqlite, close } = setup();
    const stub = stubPayPal();
    try {
      await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T1 }));
      await webhook(db, lifecycle(type, { eventId: 'WH-T', createTime: T2 }));
      assert.equal(sub(sqlite).status, status);
      assert.equal(paymentStatus(sqlite), 'cancelled', 'both end the paid membership');

      // A strictly NEWER activation must not bring it back.
      const late = await (await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-LATE', createTime: T3 }))).json();
      assert.deepEqual(late, { received: true, subscription: 'terminal' });
      assert.equal(sub(sqlite).status, status, 'a terminal subscription stays terminal');
      assert.equal(sub(sqlite).last_event_id, 'WH-T', 'a refused event must not advance the marker');
      assert.equal(paymentStatus(sqlite), 'cancelled');

      // But a genuinely NEW subscription id is a new subscription.
      const fresh = await (await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', {
        eventId: 'WH-NEW', createTime: T3, subscriptionId: 'I-SECOND',
      }))).json();
      assert.deepEqual(fresh, { received: true, subscription: 'synced' });
      assert.equal(sub(sqlite, 'I-SECOND').status, 'active');
      assert.equal(sub(sqlite).status, status, 'the old subscription stays closed');
    } finally { stub.restore(); close(); }
  }
});

/* ================================================ 26-29. ordering === */

test('26. an older PayPal event is rejected and cannot downgrade a current member', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T2 }));
    assert.equal(paymentStatus(sqlite), 'active');

    // Created FIRST, delivered SECOND — exactly what PayPal warns can happen.
    const res = await (await webhook(db, lifecycle('BILLING.SUBSCRIPTION.PAYMENT.FAILED', { eventId: 'WH-F', createTime: T1 }))).json();
    assert.deepEqual(res, { received: true, subscription: 'stale_event' });
    assert.equal(sub(sqlite).status, 'active');
    assert.equal(sub(sqlite).last_event_created, Date.parse(T2), 'the marker must not rewind');
    assert.equal(paymentStatus(sqlite), 'active', '29. a rejected event leaves membership unchanged');
  } finally { stub.restore(); close(); }
});

test('27. an exact duplicate PayPal delivery is a no-op', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T1 }));
    // Same event id, different payload — a redelivery must not take effect.
    const again = await (await webhook(db, JSON.stringify({
      id: 'WH-A', create_time: T1, event_type: 'BILLING.SUBSCRIPTION.CANCELLED',
      resource: { id: SUB_ID, custom_id: 'u-alice' },
    }))).json();
    assert.deepEqual(again, { received: true, subscription: 'duplicate' });
    assert.equal(sub(sqlite).status, 'active');
    assert.equal(paymentStatus(sqlite), 'active');
  } finally { stub.restore(); close(); }
});

test('28. equal create_time with different event ids FAILS CLOSED', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-AAA', createTime: T1 }));

    // PayPal documents no ordering guarantee over event ids, so breaking the
    // tie on id order would be deterministic but arbitrary.
    for (const eventId of ['WH-ZZZ', 'WH-000']) {
      const res = await (await webhook(db, lifecycle('BILLING.SUBSCRIPTION.SUSPENDED', { eventId, createTime: T1 }))).json();
      assert.deepEqual(res, { received: true, subscription: 'ambiguous' }, `tie broken for ${eventId}`);
    }
    assert.equal(sub(sqlite).status, 'active');
    assert.equal(sub(sqlite).last_event_id, 'WH-AAA');
    assert.equal(paymentStatus(sqlite), 'active');

    // The next unambiguous event re-establishes truth.
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.SUSPENDED', { eventId: 'WH-NEXT', createTime: T2 }));
    assert.equal(sub(sqlite).status, 'suspended');
  } finally { stub.restore(); close(); }
});

test('an event with no usable create_time fails closed once a baseline exists', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T2 }));
    for (const createTime of ['', 'soon', 'not-a-date', null]) {
      const raw = JSON.stringify({
        id: `WH-BAD-${createTime}`, create_time: createTime,
        event_type: 'BILLING.SUBSCRIPTION.CANCELLED', resource: { id: SUB_ID, custom_id: 'u-alice' },
      });
      const res = await (await webhook(db, raw)).json();
      assert.equal(res.subscription, 'unorderable', `accepted create_time ${JSON.stringify(createTime)}`);
    }
    assert.equal(sub(sqlite).status, 'active');
    assert.equal(paymentStatus(sqlite), 'active');
  } finally { stub.restore(); close(); }
});

test('worker arrival time is never used as provider chronology', () => {
  // The ordering key comes from create_time alone. A missing one is null, not
  // Date.now(), because "now" records when THIS server saw the event.
  assert.equal(eventCreatedMs({ create_time: T1 }), Date.parse(T1));
  for (const bad of [undefined, null, '', 'soon', 42, {}]) {
    assert.equal(eventCreatedMs({ create_time: bad }), null, `invented a timestamp for ${JSON.stringify(bad)}`);
  }
  // And the normalizer carries nothing but identifiers, a status and a time.
  const out = subscriptionEventFromEvent({
    id: 'WH-P', create_time: T1, event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
    resource: {
      id: SUB_ID, custom_id: 'u-alice', status: 'ACTIVE',
      subscriber: { email_address: 'donor@example.com', name: { given_name: 'A' }, shipping_address: { address_line_1: 'x' } },
      billing_info: { last_payment: { amount: { value: '10.00' } } },
    },
  });
  const serialised = JSON.stringify(out);
  for (const leak of ['donor@example.com', 'given_name', 'shipping_address', 'billing_info', 'address_line_1']) {
    assert.ok(!serialised.includes(leak), `subscription state carries ${leak}`);
  }
  assert.deepEqual(Object.keys(out).sort(), ['eventCreated', 'eventId', 'providerSubscriptionId', 'status', 'userIdHint']);
});

test('the membership mapping neither expands nor invents vocabulary', () => {
  const allowed = new Set(['pending_payment', 'active', 'past_due', 'cancelled']);
  for (const [from, to] of Object.entries({
    active: 'active', past_due: 'past_due', suspended: 'past_due',
    cancelled: 'cancelled', expired: 'cancelled',
  })) {
    assert.equal(membershipStatusFor(from), to, `${from} must map to ${to}`);
    assert.ok(allowed.has(to), `${to} is outside the membership CHECK in migration 0001`);
  }
  // Anything unmapped leaves membership alone rather than guessing.
  for (const unknown of ['incomplete', 'approval_pending', '', null, undefined, 'nonsense']) {
    assert.equal(membershipStatusFor(unknown), null, `invented a mapping for ${JSON.stringify(unknown)}`);
  }
});

/* ================================================ 31-36. recurring money === */

test('31, 33. a recurring payment creates ONE donation at the amount PayPal states', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T1 }));
    const res = await (await webhook(db, sale('PAYMENT.SALE.COMPLETED', { eventId: 'WH-S1', saleId: 'SALE-1', total: '10.00' }))).json();
    assert.deepEqual(res, { received: true, donation: 'recorded' });

    const row = sqlite.prepare('SELECT * FROM donations').get();
    assert.equal(row.provider, 'paypal');
    assert.equal(row.provider_event_id, 'WH-S1', 'the webhook event id is the idempotency key');
    assert.equal(row.provider_txn_id, 'SALE-1', 'the sale id is the authoritative transaction id');
    assert.equal(row.amount_cents, 1000, '33. the provider amount is authoritative');
    assert.equal(row.amount_drops, null);
    assert.equal(row.currency, 'usd');
    assert.equal(row.status, 'completed');
    // 13. identity comes from the STORED subscription, not from the event.
    assert.equal(row.user_id, 'u-alice');
  } finally { stub.restore(); close(); }
});

test('the stored subscription decides the donor, not anything on the sale event', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    seedUser(sqlite, { id: 'u-mallory', email: 'u-mallory@bm.test' });
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T1 }));

    // The sale claims a different person. The subscription's own user wins.
    const raw = JSON.parse(sale('PAYMENT.SALE.COMPLETED', { eventId: 'WH-S1' }));
    raw.resource.custom_id = 'u-mallory';
    raw.resource.payer = { payer_info: { email: 'mallory@example.com' } };
    await webhook(db, JSON.stringify(raw));

    assert.equal(sqlite.prepare('SELECT user_id FROM donations').get().user_id, 'u-alice');
  } finally { stub.restore(); close(); }
});

test('a sale arriving before its subscription is recorded UNATTRIBUTED, never dropped', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    // PayPal documents that events may arrive out of order. This is real money
    // either way, so it is recorded rather than discarded.
    await webhook(db, sale('PAYMENT.SALE.COMPLETED', { eventId: 'WH-S1' }));
    const row = sqlite.prepare('SELECT * FROM donations').get();
    assert.equal(row.amount_cents, 1000);
    assert.equal(row.user_id, null, 'unattributed, not invented');
    assert.equal(countDonations(sqlite), 1);
  } finally { stub.restore(); close(); }
});

test('32. a redelivered recurring payment creates no second donation', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T1 }));
    const raw = sale('PAYMENT.SALE.COMPLETED', { eventId: 'WH-S1' });
    await webhook(db, raw);
    const mailsAfterFirst = stub.mail.length;

    for (let i = 0; i < 3; i += 1) {
      const again = await (await webhook(db, raw)).json();
      assert.deepEqual(again, { received: true, donation: 'duplicate' });
    }
    assert.equal(countDonations(sqlite), 1);
    assert.equal(auditRows(sqlite, 'donation.recorded').length, 1);
    assert.equal(stub.mail.length, mailsAfterFirst, '36. no second notification');
  } finally { stub.restore(); close(); }
});

test('a second month is a genuinely new gift, not a duplicate', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T1 }));
    await webhook(db, sale('PAYMENT.SALE.COMPLETED', { eventId: 'WH-S1', saleId: 'SALE-1' }));
    await webhook(db, sale('PAYMENT.SALE.COMPLETED', { eventId: 'WH-S2', saleId: 'SALE-2' }));
    assert.equal(countDonations(sqlite), 2, 'monthly support recurs; each payment is real');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM donations WHERE user_id = ?').get('u-alice').n, 2);
  } finally { stub.restore(); close(); }
});

test('34, 35. a recurring refund or reversal transitions the ORIGINAL payment', async () => {
  for (const [type, status] of [['PAYMENT.SALE.REFUNDED', 'refunded'], ['PAYMENT.SALE.REVERSED', 'reversed']]) {
    const { db, sqlite, close } = setup();
    const stub = stubPayPal();
    try {
      await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T1 }));
      await webhook(db, sale('PAYMENT.SALE.COMPLETED', { eventId: 'WH-S1', saleId: 'SALE-1' }));
      assert.equal(countDonations(sqlite), 1);

      const raw = JSON.stringify({
        id: 'WH-R1', create_time: T3, event_type: type,
        resource: { id: 'REF-1', sale_id: 'SALE-1', amount: { total: '10.00', currency: 'USD' } },
      });
      const res = await (await webhook(db, raw)).json();
      assert.deepEqual(res, { received: true, transition: status });
      assert.equal(countDonations(sqlite), 1, 'a new event id must not manufacture a phantom donation');
      assert.equal(sqlite.prepare('SELECT status FROM donations').get().status, status);

      // Redelivery converges rather than accumulating.
      assert.equal((await (await webhook(db, raw)).json()).transition, 'no_matching_donation');
      assert.equal(countDonations(sqlite), 1);
    } finally { stub.restore(); close(); }
  }
});

test('a refund correlates through the HATEOAS link when no sale_id is present', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T1 }));
    await webhook(db, sale('PAYMENT.SALE.COMPLETED', { eventId: 'WH-S1', saleId: 'SALE-1' }));
    const raw = JSON.stringify({
      id: 'WH-R2', create_time: T3, event_type: 'PAYMENT.SALE.REFUNDED',
      resource: { id: 'REF-2', links: [{ rel: 'up', href: 'https://api-m.sandbox.paypal.com/v1/payments/sale/SALE-1' }] },
    });
    assert.equal((await (await webhook(db, raw)).json()).transition, 'refunded');
    assert.equal(sqlite.prepare('SELECT status FROM donations').get().status, 'refunded');
  } finally { stub.restore(); close(); }
});

test('36. only a genuinely new received payment is announced', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    // Creation, activation and suspension are not money.
    await call({
      db, path: '/api/donations/paypal/subscriptions', session: asMember('u-alice'),
      body: { tier: 'supporter', request_id: NONCE }, extraEnv: { plans: true },
    });
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T1 }));
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.SUSPENDED', { eventId: 'WH-S', createTime: T2 }));
    assert.equal(stub.mail.length, 0, 'lifecycle alone must announce nothing');

    await webhook(db, sale('PAYMENT.SALE.COMPLETED', { eventId: 'WH-S1' }));
    assert.ok(stub.mail.length >= 1, 'money received is announced');
    const body = stub.mail.join('\n');
    assert.ok(body.includes('10.00'), 'the amount is safe to report');
    assert.ok(!body.includes(TOKEN) && !body.includes(SECRET) && !body.includes(PLAN));
    assert.ok(!body.includes('u-alice@bm.test'), 'no donor email');
    assert.ok(!/paypal-transmission|cert_url|auth_algo/i.test(body), 'no webhook headers');
    assert.equal(auditRows(sqlite, 'notify.failed').length, 0);
  } finally { stub.restore(); close(); }
});

test('a notification failure never undoes the recurring gift it announced', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  const wrapped = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes('paypal.com')) throw new Error('mail provider down');
    return wrapped(url, init);
  };
  try {
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T1 }));
    const res = await webhook(db, sale('PAYMENT.SALE.COMPLETED', { eventId: 'WH-S1' }));
    assert.equal(res.status, 200, 'notification failure must be fail-soft');
    assert.equal(countDonations(sqlite), 1);
  } finally { stub.restore(); close(); }
});

/* ================================================ 37-38. projections === */

test('37. a member sees their recurring PayPal gift with no provider internals', async () => {
  const { db, close } = setup();
  const stub = stubPayPal();
  try {
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T1 }));
    await webhook(db, sale('PAYMENT.SALE.COMPLETED', { eventId: 'WH-S1', saleId: 'SALE-1', total: '10.00' }));

    const body = await (await call({ db, path: '/api/donations/mine', method: 'GET', session: asMember('u-alice') })).json();
    assert.equal(body.items.length, 1);
    const item = body.items[0];
    assert.equal(item.provider, 'paypal');
    assert.equal(item.amount_cents, 1000);
    assert.equal(item.status, 'completed');
    assert.deepEqual(
      Object.keys(item).sort(),
      ['amount_cents', 'amount_drops', 'created_at', 'currency', 'id', 'provider', 'reference_url', 'status'],
    );
    const shown = JSON.stringify(body);
    for (const internal of ['SALE-1', 'WH-S1', SUB_ID, 'u-alice', PLAN]) {
      assert.ok(!shown.includes(internal), `member history leaked ${internal}`);
    }
  } finally { stub.restore(); close(); }
});

test('38. the admin Donations view shows a recurring PayPal row safely', async () => {
  const { db, close } = setup();
  const stub = stubPayPal();
  try {
    await webhook(db, lifecycle('BILLING.SUBSCRIPTION.ACTIVATED', { eventId: 'WH-A', createTime: T1 }));
    await webhook(db, sale('PAYMENT.SALE.COMPLETED', { eventId: 'WH-S1', total: '10.00' }));

    const rows = await repos(db).donations.list({});
    const view = projectDonation(rows[0]);
    assert.equal(view.provider, 'PayPal');
    assert.equal(view.amount, '10.00 USD');
    assert.equal(view.status, 'Completed');
    assert.equal(view.donor, 'Member');
    const shown = JSON.stringify(view);
    for (const internal of ['u-alice', 'SALE-1', 'WH-S1', SUB_ID, '@']) {
      assert.ok(!shown.includes(internal), `admin view leaked ${internal}`);
    }
  } finally { stub.restore(); close(); }
});

/* ================================================ cross-provider safety === */

test('a PayPal event can never be compared against a Stripe row', async () => {
  const { db, sqlite, close, repo } = setup();
  const stub = stubPayPal();
  try {
    // Stripe stamps SECONDS; PayPal parses to MILLISECONDS. If the two ever
    // met on one row, every PayPal event would look astronomically newer.
    await repo.subscriptions.upsertFromWebhook({
      provider: 'stripe', userId: 'u-alice', providerSubscriptionId: SUB_ID,
      providerCustomerId: 'cus_1', status: 'active', eventId: 'evt_1', eventCreated: 1_770_000_000,
    });
    const res = await (await webhook(db, lifecycle('BILLING.SUBSCRIPTION.CANCELLED', { eventId: 'WH-X', createTime: T3 }))).json();
    assert.deepEqual(res, { received: true, subscription: 'provider_mismatch' });
    assert.equal(sub(sqlite).status, 'active', 'the Stripe row is untouched');
    assert.equal(sub(sqlite).provider, 'stripe');
    assert.equal(paymentStatus(sqlite), 'pending_payment');
  } finally { stub.restore(); close(); }
});

test('BILLING.SUBSCRIPTION.CREATED and .UPDATED are deliberately not acted on', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    for (const type of ['BILLING.SUBSCRIPTION.CREATED', 'BILLING.SUBSCRIPTION.UPDATED', 'PAYMENT.SALE.PENDING', 'PAYMENT.SALE.DENIED']) {
      const res = await (await webhook(db, lifecycle(type, { eventId: `WH-${type}` }))).json();
      assert.deepEqual(res, { received: true, ignored: type }, `${type} must be acknowledged and ignored`);
    }
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM subscriptions').get().n, 0, 'creation is not activation');
    assert.equal(countDonations(sqlite), 0);
    assert.equal(paymentStatus(sqlite), 'pending_payment');
  } finally { stub.restore(); close(); }
});

test('a lifecycle event for an unknown subscriber resolves nobody and writes nothing', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    const raw = JSON.stringify({
      id: 'WH-NOUSER', create_time: T1, event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      resource: { id: 'I-ORPHAN' },      // no custom_id, no stored row
    });
    const res = await (await webhook(db, raw)).json();
    assert.deepEqual(res, { received: true, subscription: 'unresolved_user' });
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM subscriptions').get().n, 0);
  } finally { stub.restore(); close(); }
});
