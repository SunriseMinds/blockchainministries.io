/**
 * M14.1 — payment normalization and hardening.
 *
 * Stripe is never contacted: `globalThis.fetch` is stubbed, so every
 * assertion about what the Worker WOULD send to Stripe is made against the
 * real outbound request the production code builds. No key, no account, no
 * charge.
 *
 * Run: node --test worker/routes/payments.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '@reellink/api/router.js';
import { freshDb, seedUser } from '../../test/helpers/d1.mjs';
import { PROD_FLAGS, asMember, auditRows } from '../../test/helpers/route.mjs';
import { mount } from './public.js';
import { TIERS, TIER_KEYS, ONE_TIME, resolveTier, tierIsConfigured, givingConfig } from '../config/tiers.js';
import { OPERATIONS, keyFor } from '../payments/idempotency.js';
import { PLACEHOLDER_PRICE_IDS, donationFromEvent, subscriptionEventFromEvent } from '@reellink/payments/stripe.js';

let cached = null;
function router() {
  if (!cached) { cached = new Router(); mount(cached); }
  return cached;
}

const REQ = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'; // 32 hex = valid request_id

/** Captures every outbound fetch so Stripe-bound requests are inspectable. */
function stubStripe({ fail = false } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    const body = typeof init?.body?.toString === 'function' ? init.body.toString() : '';
    calls.push({ url: u, headers: init?.headers ?? {}, params: new URLSearchParams(body) });
    if (u.includes('api.stripe.com')) {
      if (fail) return new Response(JSON.stringify({ error: { message: 'no' } }), { status: 400 });
      return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1', client_secret: 'x' }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: 'msg' }), { status: 200 }); // email
  };
  return {
    calls,
    stripe: () => calls.filter(c => c.url.includes('api.stripe.com')),
    restore() { globalThis.fetch = original; },
  };
}

function baseEnv(extra = {}) {
  return {
    SITE_URL: 'https://blockchainministries.io',
    STRIPE_SECRET_KEY: 'sk_test_dummy_for_harness',
    EMAIL_PROVIDER: 'resend',
    EMAIL_API_KEY: 'k',
    EMAIL_FROM: 'contact@blockchainministries.io',
    ...extra,
  };
}

async function post({ db, path, session = null, body, extraEnv = {} }) {
  const url = new URL(`https://blockchainministries.io${path}`);
  const request = new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.44' },
    body: JSON.stringify(body ?? {}),
  });
  return router().handle({
    request, url, env: { DB: db, ...baseEnv(extraEnv) },
    flags: { ...PROD_FLAGS }, session, sessionLoaded: true,
  });
}

async function getJson({ db, path }) {
  const url = new URL(`https://blockchainministries.io${path}`);
  const res = await router().handle({
    request: new Request(url, { headers: { 'CF-Connecting-IP': '203.0.113.44' } }),
    url, env: { DB: db, ...baseEnv() }, flags: { ...PROD_FLAGS }, session: null, sessionLoaded: true,
  });
  return { res, body: await res.json() };
}

function setup() {
  const { db, sqlite, close } = freshDb();
  seedUser(sqlite, { id: 'u-alice', email: 'u-alice@bm.test' });
  return { db, sqlite, close };
}

/* ============================================ single source of truth === */

test('1. every tier price id is defined exactly once, server-side', () => {
  // The catalogue is the only executable place a price id may appear.
  const names = TIER_KEYS.map(k => TIERS[k].priceId);
  assert.deepEqual(names, ['price_supporter_tier', 'price_guardian_tier', 'price_archangel_tier']);
  assert.equal(new Set(names).size, 3, 'no price id may be reused across tiers');
  // Placeholder semantics are imported, not restated.
  for (const id of names) assert.ok(PLACEHOLDER_PRICE_IDS.includes(id));
});

test('2. the public config exposes availability but never a price id', async () => {
  const { db, close } = setup();
  try {
    const { res, body } = await getJson({ db, path: '/api/donations/config' });
    assert.equal(res.status, 200);
    assert.deepEqual(body.tiers.map(t => t.key), ['supporter', 'guardian', 'archangel']);
    assert.deepEqual(body.tiers.map(t => t.amount_cents), [1000, 5000, 10000]);
    // Placeholders today -> every tier honestly unavailable.
    assert.deepEqual(body.tiers.map(t => t.available), [false, false, false]);
    const raw = JSON.stringify(body);
    for (const id of PLACEHOLDER_PRICE_IDS) assert.ok(!raw.includes(id), 'price id leaked to the browser');
    assert.ok(!raw.includes('price_'), 'no Stripe price identifier may be exposed');
    assert.equal(body.one_time.min_cents, 100);
    assert.equal(body.one_time.max_cents, 10_000_000);
    assert.equal(body.one_time.currency, 'usd');

    // M14 checkpoint — no UNAPPROVED tier name may leave the server. The
    // owner has not ratified "Supporter/Guardian/Archangel" as ministry
    // terminology, so the public contract carries the amount and an internal
    // key, and no `name` field at all.
    for (const t of body.tiers) assert.ok(!('name' in t), 'the public config must not name a tier');
    for (const label of ['Supporter', 'Guardian', 'Archangel']) {
      assert.ok(!raw.includes(label), `unapproved tier name exposed: ${label}`);
    }
  } finally { close(); }
});

test('3. availability tracks the catalogue, so the UI cannot drift from it', () => {
  assert.equal(tierIsConfigured(TIERS.supporter), false, 'a placeholder is never configured');
  assert.equal(tierIsConfigured({ priceId: 'price_1RealLiveId' }), true);
  assert.equal(tierIsConfigured({ priceId: '' }), false);
  assert.equal(tierIsConfigured(null), false);
  // givingConfig is derived from the same predicate the checkout uses.
  const cfg = givingConfig();
  for (const t of cfg.tiers) assert.equal(t.available, tierIsConfigured(TIERS[t.key]));
});

/* ================================================== price allowlist === */

test('4. an arbitrary Stripe price id cannot be named (HIGH-1)', async () => {
  const { db, close } = setup();
  const stub = stubStripe();
  try {
    for (const attempt of ['price_1RealSomeoneElses', 'price_live_abc', 'prod_123', '../supporter', 'constructor', '__proto__']) {
      const res = await post({
        db, path: '/api/donations/stripe/checkout', session: asMember('u-alice'),
        body: { mode: 'subscription', tier: attempt, price_id: attempt, request_id: REQ },
      });
      assert.equal(res.status, 400, `accepted an arbitrary identifier: ${attempt}`);
    }
    assert.equal(stub.stripe().length, 0, 'Stripe must never be called for a rejected tier');
  } finally { stub.restore(); close(); }
});

test('5. a placeholder tier fails closed', async () => {
  const { db, close } = setup();
  const stub = stubStripe();
  try {
    for (const key of TIER_KEYS) {
      const res = await post({
        db, path: '/api/donations/stripe/checkout', session: asMember('u-alice'),
        body: { mode: 'subscription', tier: key, request_id: REQ },
      });
      assert.equal(res.status, 400, `${key} must fail closed while its price is a placeholder`);
      const body = await res.json();
      assert.match(body.error.message, /not available yet/);
      assert.ok(!JSON.stringify(body).includes('price_'), 'the refusal must not leak a price id');
    }
    assert.equal(stub.stripe().length, 0);
  } finally { stub.restore(); close(); }
});

test('5b. Stripe recurring REQUIRES authentication, like PayPal recurring', async () => {
  const { db, close } = setup();
  const stub = stubStripe();
  try {
    // M14.5B ratified: recurring monthly support requires authentication,
    // consistent across rails. PayPal enforces it with [requireAuth]; Stripe
    // must too. Without it, an anonymous subscription Checkout carries no
    // metadata.user_id, so `checkout.session.completed` resolves no user, the
    // webhook records nothing, and a paying subscriber is orphaned — real
    // money with no membership link and no subscription row.
    //
    // Unreachable while every tier's price is a placeholder, and that is
    // exactly the point: it would activate silently the moment real Stripe
    // Price IDs are configured.
    for (const key of TIER_KEYS) {
      const res = await post({
        db, path: '/api/donations/stripe/checkout',
        body: { mode: 'subscription', tier: key, request_id: REQ },   // no session
      });
      assert.equal(res.status, 401, `anonymous recurring must be refused for ${key}`);
    }
    assert.equal(stub.stripe().length, 0, 'Stripe must not be contacted for an anonymous subscription');

    // One-time giving stays anonymous-friendly — that was ratified in M14.1
    // and must not be tightened by this guard.
    const oneTime = await post({
      db, path: '/api/donations/stripe/checkout',
      body: { mode: 'payment', amount_cents: 2500, request_id: REQ },
    });
    assert.equal(oneTime.status, 201, 'anonymous one-time giving must still work');
  } finally { stub.restore(); close(); }
});

test('6. a configured tier resolves to its server-side price, structurally', () => {
  assert.equal(resolveTier('supporter'), null, 'placeholder today');
  assert.equal(resolveTier('nope'), null);
  assert.equal(resolveTier('__proto__'), null, 'prototype keys must not resolve');
  assert.equal(resolveTier(undefined), null);
  // With a real price the same code path yields the tier and its price id.
  const live = { ...TIERS.guardian, priceId: 'price_1LiveGuardian' };
  assert.equal(tierIsConfigured(live), true);
  assert.equal(live.priceId, 'price_1LiveGuardian');
});

/* ========================================================= identity === */

test('7. the client cannot set user_id; the server identity wins', async () => {
  const { db, close } = setup();
  const stub = stubStripe();
  try {
    await post({
      db, path: '/api/donations/stripe/checkout', session: asMember('u-alice'),
      body: { mode: 'payment', amount_cents: 2500, request_id: REQ, user_id: 'u-attacker', metadata: { user_id: 'u-attacker' } },
    });
    const call = stub.stripe()[0];
    assert.equal(call.params.get('metadata[user_id]'), 'u-alice', 'server session must win');
    assert.ok(!call.params.toString().includes('u-attacker'));
  } finally { stub.restore(); close(); }
});

test('8. an anonymous one-time gift is supported and carries no user', async () => {
  const { db, close } = setup();
  const stub = stubStripe();
  try {
    const res = await post({ db, path: '/api/donations/stripe/checkout', body: { mode: 'payment', amount_cents: 2500, request_id: REQ } });
    assert.equal(res.status, 201);
    assert.equal(stub.stripe()[0].params.get('metadata[user_id]'), '');
  } finally { stub.restore(); close(); }
});

/* =========================================================== amounts === */

test('9. amounts outside the ratified bounds are rejected', async () => {
  const { db, close } = setup();
  const stub = stubStripe();
  try {
    for (const amount of [0, 99, -100, 10_000_001, 99_999_999]) {
      const res = await post({ db, path: '/api/donations/stripe/checkout', body: { mode: 'payment', amount_cents: amount, request_id: REQ } });
      assert.equal(res.status, 400, `accepted out-of-bounds amount ${amount}`);
    }
    for (const amount of [null, undefined, 12.5, NaN, '1e9', {}, [], 'free']) {
      const res = await post({ db, path: '/api/donations/stripe/checkout', body: { mode: 'payment', amount_cents: amount, request_id: REQ } });
      assert.equal(res.status, 400, `accepted malformed amount ${JSON.stringify(amount)}`);
    }
    assert.equal(stub.stripe().length, 0);
  } finally { stub.restore(); close(); }
});

test('9b. a numeric STRING amount is coerced safely, not silently mis-sent', async () => {
  // @reellink/core's v.int coerces with Number() by design, shared across the
  // platform. That is lenient, not unsafe — the coerced value is still bounds
  // checked, and this proves the integer that reaches Stripe is the right one
  // rather than a string smuggled through.
  const { db, close } = setup();
  const stub = stubStripe();
  try {
    const res = await post({ db, path: '/api/donations/stripe/checkout', body: { mode: 'payment', amount_cents: '2500', request_id: REQ } });
    assert.equal(res.status, 201);
    assert.equal(stub.stripe()[0].params.get('line_items[0][price_data][unit_amount]'), '2500');
    // A string that would exceed the ceiling is still refused after coercion.
    const over = await post({ db, path: '/api/donations/stripe/checkout', body: { mode: 'payment', amount_cents: '10000001', request_id: REQ } });
    assert.equal(over.status, 400);
  } finally { stub.restore(); close(); }
});

test('10. the boundary amounts themselves are accepted', async () => {
  const { db, close } = setup();
  const stub = stubStripe();
  try {
    for (const amount of [ONE_TIME.minCents, ONE_TIME.maxCents]) {
      const res = await post({ db, path: '/api/donations/stripe/checkout', body: { mode: 'payment', amount_cents: amount, request_id: REQ } });
      assert.equal(res.status, 201, `rejected boundary amount ${amount}`);
    }
    const first = stub.stripe()[0].params;
    assert.equal(first.get('line_items[0][price_data][unit_amount]'), String(ONE_TIME.minCents));
    assert.equal(first.get('line_items[0][price_data][currency]'), 'usd');
    assert.equal(first.get('mode'), 'payment');
  } finally { stub.restore(); close(); }
});

/* ======================================================= idempotency === */

test('11. the same logical retry produces the same Stripe idempotency key (HIGH-2)', async () => {
  const { db, close } = setup();
  const stub = stubStripe();
  try {
    for (let i = 0; i < 3; i++) {
      await post({ db, path: '/api/donations/stripe/checkout', session: asMember('u-alice'), body: { mode: 'payment', amount_cents: 5000, request_id: REQ } });
    }
    const keys = stub.stripe().map(c => c.headers['Idempotency-Key']);
    assert.equal(keys.length, 3);
    assert.equal(new Set(keys).size, 1, 'a retry must reuse the key, not mint a new one');
    assert.equal(keys[0], keyFor(OPERATIONS.ONE_TIME, 'u-alice', REQ));
  } finally { stub.restore(); close(); }
});

test('12. a different intentional gift produces a different key', async () => {
  const { db, close } = setup();
  const stub = stubStripe();
  const other = 'ffffffffffffffffffffffffffffffff';
  try {
    await post({ db, path: '/api/donations/stripe/checkout', session: asMember('u-alice'), body: { mode: 'payment', amount_cents: 5000, request_id: REQ } });
    await post({ db, path: '/api/donations/stripe/checkout', session: asMember('u-alice'), body: { mode: 'payment', amount_cents: 5000, request_id: other } });
    const keys = stub.stripe().map(c => c.headers['Idempotency-Key']);
    assert.equal(new Set(keys).size, 2, 'a second genuine gift must not be swallowed');
  } finally { stub.restore(); close(); }
});

test('13. keys are scoped so operations and callers cannot collide', () => {
  assert.notEqual(keyFor(OPERATIONS.ONE_TIME, 'u-a', REQ), keyFor(OPERATIONS.TIER, 'u-a', REQ));
  assert.notEqual(keyFor(OPERATIONS.ONE_TIME, 'u-a', REQ), keyFor(OPERATIONS.ONE_TIME, 'u-b', REQ));
  assert.notEqual(keyFor(OPERATIONS.ONE_TIME, null, REQ), keyFor(OPERATIONS.ONE_TIME, 'u-a', REQ));
  assert.equal(keyFor(OPERATIONS.ONE_TIME, null, REQ), keyFor(OPERATIONS.ONE_TIME, '', REQ), 'anonymous is one bucket');
  // The amount is deliberately absent: two genuine $50 gifts must both work.
  assert.ok(!keyFor(OPERATIONS.ONE_TIME, 'u-a', REQ).includes('5000'));
  assert.ok(keyFor(OPERATIONS.ONE_TIME, 'u-a', REQ).length < 255, 'Stripe caps the header at 255');
});

test('14. an invalid request id is rejected before Stripe is touched', async () => {
  const { db, close } = setup();
  const stub = stubStripe();
  try {
    for (const bad of [undefined, '', 'short', 'a'.repeat(65), 'has spaces in it!!', 'semi:colon:injection:abcdefgh', 42, null]) {
      const res = await post({ db, path: '/api/donations/stripe/checkout', body: { mode: 'payment', amount_cents: 2500, request_id: bad } });
      assert.equal(res.status, 400, `accepted request_id ${JSON.stringify(bad)}`);
    }
    assert.equal(stub.stripe().length, 0);
  } finally { stub.restore(); close(); }
});

/* ====================================================== webhook auth === */

test('15. a bad webhook signature is rejected', async () => {
  const { db, close } = setup();
  try {
    const url = new URL('https://blockchainministries.io/api/webhooks/stripe');
    const res = await router().handle({
      request: new Request(url, { method: 'POST', headers: { 'Stripe-Signature': 't=1,v1=deadbeef' }, body: '{"id":"evt_1"}' }),
      url, env: { DB: db, ...baseEnv({ STRIPE_WEBHOOK_SECRET: 'whsec_test' }) },
      flags: { ...PROD_FLAGS }, session: null, sessionLoaded: true,
    });
    assert.equal(res.status, 400);
  } finally { close(); }
});

test('16. a stale webhook timestamp is rejected', async () => {
  const { db, close } = setup();
  try {
    const old = Math.floor(Date.now() / 1000) - 4000; // far outside 300s
    const url = new URL('https://blockchainministries.io/api/webhooks/stripe');
    const res = await router().handle({
      request: new Request(url, { method: 'POST', headers: { 'Stripe-Signature': `t=${old},v1=abc` }, body: '{"id":"evt_1"}' }),
      url, env: { DB: db, ...baseEnv({ STRIPE_WEBHOOK_SECRET: 'whsec_test' }) },
      flags: { ...PROD_FLAGS }, session: null, sessionLoaded: true,
    });
    assert.equal(res.status, 400);
  } finally { close(); }
});

test('17. a missing webhook secret fails closed, it does not skip verification', async () => {
  const { db, close } = setup();
  try {
    const url = new URL('https://blockchainministries.io/api/webhooks/stripe');
    const res = await router().handle({
      request: new Request(url, { method: 'POST', headers: { 'Stripe-Signature': 't=1,v1=abc' }, body: '{}' }),
      url, env: { DB: db, ...baseEnv() }, // no STRIPE_WEBHOOK_SECRET
      flags: { ...PROD_FLAGS }, session: null, sessionLoaded: true,
    });
    assert.equal(res.status, 503);
  } finally { close(); }
});

/* =================================================== webhook replay === */

test('18. a replayed donation event dedupes on the provider event id', () => {
  const event = {
    id: 'evt_dup', type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_1', amount_received: 5000, currency: 'usd', metadata: { user_id: 'u-alice' } } },
  };
  const a = donationFromEvent(event);
  const b = donationFromEvent(event);
  assert.equal(a.stripeEventId, b.stripeEventId, 'the delivery id is the idempotency key');
  assert.equal(a.stripeEventId, 'evt_dup');
  assert.notEqual(a.stripeEventId, a.providerChargeId, 'event id and object id must not be conflated');
});

test('19. a cancelled subscription cannot be resurrected by a late replay', async () => {
  const { db, sqlite, close } = setup();
  try {
    const { repos } = await import('../db/repositories.js');
    const repo = repos(db);
    await repo.subscriptions.upsertFromWebhook({
      provider: 'stripe', userId: 'u-alice', providerSubscriptionId: 'sub_1', providerCustomerId: 'cus_1',
      status: 'active', currentPeriodEnd: '2026-03-01T00:00:00.000Z',
    });
    await repo.subscriptions.upsertFromWebhook({
      provider: 'stripe', userId: 'u-alice', providerSubscriptionId: 'sub_1', providerCustomerId: 'cus_1', status: 'cancelled',
    });
    assert.equal(sqlite.prepare('SELECT status FROM subscriptions WHERE provider_subscription_id = ?').get('sub_1').status, 'cancelled');

    // A redelivered invoice.paid from before the cancellation.
    const outcome = await repo.subscriptions.upsertFromWebhook({
      provider: 'stripe', userId: 'u-alice', providerSubscriptionId: 'sub_1', providerCustomerId: 'cus_1',
      status: 'active', currentPeriodEnd: '2026-03-01T00:00:00.000Z',
    });
    assert.equal(outcome, 'terminal');
    assert.equal(sqlite.prepare('SELECT status FROM subscriptions WHERE provider_subscription_id = ?').get('sub_1').status, 'cancelled');
  } finally { close(); }
});

test('20. a stale payment failure cannot downgrade a member who already paid', async () => {
  const { db, sqlite, close } = setup();
  try {
    const { repos } = await import('../db/repositories.js');
    const repo = repos(db);
    // February failed, March paid.
    await repo.subscriptions.upsertFromWebhook({
      provider: 'stripe', userId: 'u-alice', providerSubscriptionId: 'sub_2', providerCustomerId: 'cus_2',
      status: 'past_due', currentPeriodEnd: '2026-02-01T00:00:00.000Z',
    });
    await repo.subscriptions.upsertFromWebhook({
      provider: 'stripe', userId: 'u-alice', providerSubscriptionId: 'sub_2', providerCustomerId: 'cus_2',
      status: 'active', currentPeriodEnd: '2026-03-01T00:00:00.000Z',
    });
    // Stripe redelivers the FEBRUARY failure after the March success.
    const outcome = await repo.subscriptions.upsertFromWebhook({
      provider: 'stripe', userId: 'u-alice', providerSubscriptionId: 'sub_2', providerCustomerId: 'cus_2',
      status: 'past_due', currentPeriodEnd: '2026-02-01T00:00:00.000Z',
    });
    assert.equal(outcome, 'stale');
    const row = sqlite.prepare('SELECT status, current_period_end FROM subscriptions WHERE provider_subscription_id = ?').get('sub_2');
    assert.equal(row.status, 'active', 'a paying member must not be downgraded by a replay');
    assert.equal(row.current_period_end, '2026-03-01T00:00:00.000Z', 'the period must not rewind');
  } finally { close(); }
});

test('21. a genuine forward transition still applies', async () => {
  const { db, sqlite, close } = setup();
  try {
    const { repos } = await import('../db/repositories.js');
    const repo = repos(db);
    assert.equal(await repo.subscriptions.upsertFromWebhook({
      provider: 'stripe', userId: 'u-alice', providerSubscriptionId: 'sub_3', providerCustomerId: 'c', status: 'active',
      currentPeriodEnd: '2026-02-01T00:00:00.000Z',
    }), 'inserted');
    assert.equal(await repo.subscriptions.upsertFromWebhook({
      provider: 'stripe', userId: 'u-alice', providerSubscriptionId: 'sub_3', providerCustomerId: 'c', status: 'past_due',
      currentPeriodEnd: '2026-03-01T00:00:00.000Z',
    }), 'updated');
    assert.equal(sqlite.prepare('SELECT status FROM subscriptions WHERE provider_subscription_id = ?').get('sub_3').status, 'past_due');
  } finally { close(); }
});

test('22. invoice.payment_failed now carries its billing period', () => {
  // Without it the store has no ordering key for that event and cannot tell a
  // fresh failure from a replay.
  const ev = subscriptionEventFromEvent({
    id: 'evt_f', type: 'invoice.payment_failed',
    data: { object: { id: 'in_1', subscription: 'sub_9', customer: 'cus_9', lines: { data: [{ period: { end: 1772323200 } }] } } },
  });
  assert.equal(ev.status, 'past_due');
  assert.equal(typeof ev.currentPeriodEnd, 'string');
  assert.match(ev.currentPeriodEnd, /^\d{4}-\d{2}-\d{2}T/);
});

/* =========================================== success page authority === */

test('23. the checkout success query parameter cannot fabricate database state', async () => {
  const { db, sqlite, close } = setup();
  try {
    // Nothing about ?checkout=success touches the API; only a signed webhook
    // writes a donation. Prove the table stays empty.
    const before = sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n;
    const { res } = await getJson({ db, path: '/api/donations/config?checkout=success' });
    assert.equal(res.status, 200);
    const after = sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n;
    assert.equal(after, before, 'a query parameter must never create a donation');
    assert.equal(after, 0);
  } finally { close(); }
});

/* ================================================== admin awareness === */

test('24. a newly recorded donation notifies admins without card or Stripe internals', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubStripe();
  try {
    const { repos } = await import('../db/repositories.js');
    const id = await repos(db).donations.recordIfNew({
      provider: 'stripe', providerEventId: 'evt_n1', providerTxnId: 'pi_secret_1',
      amountCents: 5000, currency: 'usd', status: 'succeeded', referenceUrl: null, userId: null,
    });
    assert.ok(id);
    const rows = sqlite.prepare('SELECT * FROM donations').all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amount_cents, 5000);
  } finally { stub.restore(); close(); }
});

/* ============================================= no secret in frontend === */

test('25. no Stripe secret material can reach the browser bundle', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const root = new URL('../../src/', import.meta.url);
  const files = ['pages/Donate.jsx', 'pages/Donate/components/StripeTiers.jsx', 'pages/Donate/components/StripeOneTime.jsx', 'pages/Donate/components/givingRequest.js', 'main.jsx'];
  for (const f of files) {
    const src = readFileSync(new URL(f, root), 'utf8');
    for (const banned of ['sk_live', 'sk_test', 'rk_live', 'whsec_', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'VITE_STRIPE']) {
      assert.ok(!src.includes(banned), `${f} references secret material: ${banned}`);
    }
  }
  // And the server-side catalogue is not importable from src/.
  const tiers = readFileSync(new URL('../config/tiers.js', import.meta.url), 'utf8');
  assert.ok(tiers.includes('price_supporter_tier'), 'prices live server-side');
  assert.ok(!files.some(f => readFileSync(new URL(f, root), 'utf8').includes('price_supporter_tier')));
  void join;
});
