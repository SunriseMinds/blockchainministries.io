/**
 * M14.5 — the PayPal rail at route level, end to end through the real router.
 *
 * PayPal is stubbed at `globalThis.fetch`; everything else is genuine — the
 * real routes, the real guards, the real repositories and the real migration
 * chain. No PayPal account is contacted, no credential is live, and no money
 * moves in any environment.
 *
 * Run: node --test worker/routes/paypalRoutes.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '@reellink/api/router.js';
import { freshDb, seedUser } from '../../test/helpers/d1.mjs';
import { PROD_FLAGS, asMember, auditRows } from '../../test/helpers/route.mjs';
import { mount } from './public.js';
import { repos } from '../db/repositories.js';
import { __clearTokenCache } from '../payments/paypal.js';
import { projectDonation, DONATION_COLUMNS } from '../../src/pages/admin/adminQueues.js';

const SECRET = 'sb-client-secret-DO-NOT-LEAK';
const TOKEN = 'A21AA-sandbox-access-token-DO-NOT-LEAK';
const NONCE = 'abcdefghij123456';

let cached = null;
function router() {
  if (!cached) { cached = new Router(); mount(cached); }
  return cached;
}

function env(extra = {}) {
  return {
    SITE_URL: 'https://blockchainministries.io',
    PAYPAL_ENVIRONMENT: 'sandbox',
    PAYPAL_CLIENT_ID: 'sb-client-id',
    PAYPAL_CLIENT_SECRET: SECRET,
    PAYPAL_WEBHOOK_ID: 'WH-SANDBOX-1',
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

function stubPayPal({ order = { id: 'ORDER-1', status: 'CREATED' }, capture = null, apiStatus = 200, verify = 'SUCCESS' } = {}) {
  const calls = [];
  const mail = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (!u.includes('paypal.com')) { mail.push(u); return new Response(JSON.stringify({ id: 'msg' }), { status: 200 }); }
    calls.push({ url: u, headers: init.headers ?? {}, body: init.body ? String(init.body) : null });
    if (u.endsWith('/v1/oauth2/token')) {
      return new Response(JSON.stringify({ access_token: TOKEN, expires_in: 32400 }), { status: 200 });
    }
    if (u.endsWith('/v1/notifications/verify-webhook-signature')) {
      return new Response(JSON.stringify({ verification_status: verify }), { status: 200 });
    }
    if (apiStatus !== 200) return new Response(JSON.stringify({ name: 'INTERNAL_SERVER_ERROR' }), { status: apiStatus });
    if (u.endsWith('/capture')) {
      return new Response(JSON.stringify(capture ?? {
        id: 'ORDER-1', status: 'COMPLETED',
        purchase_units: [{ payments: { captures: [{ id: 'CAP-1', status: 'COMPLETED', amount: { currency_code: 'USD', value: '25.00' } }] } }],
      }), { status: 201 });
    }
    return new Response(JSON.stringify(order), { status: 201 });
  };
  return {
    calls, mail,
    orders: () => calls.filter(c => c.url.endsWith('/v2/checkout/orders')),
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
  return { db, sqlite, repo: repos(db), close: () => { close(); __clearTokenCache(); } };
}

const countDonations = (sqlite) => sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n;

/** A PayPal webhook event body. */
const captureEvent = (type, o = {}) => JSON.stringify({
  id: o.eventId ?? 'WH-EVT-1',
  event_type: type,
  resource: {
    id: o.captureId ?? 'CAP-1',
    amount: { currency_code: 'USD', value: o.value ?? '25.00' },
    custom_id: o.customId ?? '',
    ...(o.links ? { links: o.links } : {}),
  },
});

const webhook = (db, raw, headers = SIGNED) =>
  call({ db, path: '/api/webhooks/paypal', body: raw, headers });

/* ==================================================== 1. configuration === */

test('1. the giving config exposes only the public client id, and nothing else', async () => {
  const { db, close } = setup();
  try {
    const on = await (await call({ db, path: '/api/donations/config', method: 'GET' })).json();
    assert.equal(on.paypal.available, true);
    assert.equal(on.paypal.environment, 'sandbox');
    assert.equal(on.paypal.live, false, 'sandbox must report itself as not live');
    assert.equal(on.paypal.client_id, 'sb-client-id');
    assert.equal(on.paypal.recurring_available, false, 'recurring is deferred and must say so');

    const shown = JSON.stringify(on);
    assert.ok(!shown.includes(SECRET), 'the client secret must never reach the browser');
    assert.ok(!shown.includes('WH-SANDBOX-1'), 'the webhook id must never reach the browser');
    assert.ok(!shown.includes(TOKEN), 'no access token may reach the browser');
    assert.ok(!/client_secret|webhook_id|access_token/.test(shown));

    // Unconfigured means the page simply is not offered PayPal.
    const url = new URL('https://blockchainministries.io/api/donations/config');
    const off = await (await router().handle({
      request: new Request(url), url, env: { DB: db, SITE_URL: 'https://x' },
      flags: { ...PROD_FLAGS }, session: null, sessionLoaded: true,
    })).json();
    assert.equal(off.paypal.available, false);
    assert.equal(off.paypal.client_id, undefined);
  } finally { close(); }
});

/* ==================================================== 3-5, 10. amounts === */

test('3-5. the server enforces the fiat policy, and a malformed amount never reaches PayPal', async () => {
  const { db, close } = setup();
  const stub = stubPayPal();
  try {
    // 3. below the $1 minimum.  4. above the $100,000 maximum.
    for (const bad of [99, 0, -1, 10_000_001, 99_999_999]) {
      const res = await call({ db, path: '/api/donations/paypal/orders', body: { amount_cents: bad, request_id: NONCE } });
      assert.equal(res.status, 400, `accepted ${bad}`);
    }
    // 5. malformed entirely.
    for (const bad of [undefined, null, 'abc', '', {}, [], 25.5, NaN, Infinity, '25; DROP TABLE donations']) {
      const res = await call({ db, path: '/api/donations/paypal/orders', body: { amount_cents: bad, request_id: NONCE } });
      assert.equal(res.status, 400, `accepted ${JSON.stringify(bad)}`);
    }
    assert.equal(stub.orders().length, 0, 'no rejected amount may reach PayPal');

    // The boundaries themselves are accepted.
    for (const good of [100, 10_000_000]) {
      const res = await call({ db, path: '/api/donations/paypal/orders', body: { amount_cents: good, request_id: NONCE } });
      assert.equal(res.status, 201, `refused ${good}`);
    }
    assert.equal(countDonations(db._raw), 0, 'creating an order records no donation');
  } finally { stub.restore(); close(); }
});

test('10. the browser cannot choose the currency, the status, or a provider id', async () => {
  const { db, close } = setup();
  const stub = stubPayPal();
  try {
    const res = await call({
      db, path: '/api/donations/paypal/orders',
      body: {
        amount_cents: 2500, request_id: NONCE,
        currency: 'EUR', currency_code: 'BTC',
        status: 'completed', provider_txn_id: 'CAP-FORGED', id: 'ORDER-FORGED',
        intent: 'AUTHORIZE',
      },
    });
    assert.equal(res.status, 201);
    const sent = JSON.parse(stub.orders()[0].body);
    assert.equal(sent.purchase_units[0].amount.currency_code, 'USD', 'currency is not negotiable');
    assert.equal(sent.intent, 'CAPTURE', 'intent is not negotiable');
    assert.ok(!stub.orders()[0].body.includes('CAP-FORGED'));
    assert.ok(!stub.orders()[0].body.includes('ORDER-FORGED'));
    assert.ok(!stub.orders()[0].body.includes('BTC'));

    // And the response carries only what the approval UX needs.
    assert.deepEqual(Object.keys(await res.json()).sort(), ['id', 'status']);
  } finally { stub.restore(); close(); }
});

/* ==================================================== 6-7. identity === */

test('6. an anonymous one-time gift is allowed and carries no identity', async () => {
  const { db, close } = setup();
  const stub = stubPayPal();
  try {
    const res = await call({ db, path: '/api/donations/paypal/orders', body: { amount_cents: 2500, request_id: NONCE } });
    assert.equal(res.status, 201);
    const sent = JSON.parse(stub.orders()[0].body);
    assert.equal(sent.purchase_units[0].custom_id, '', 'an anonymous gift names no one');
  } finally { stub.restore(); close(); }
});

test('7. the session decides who the donor is; a client-supplied user id is ignored', async () => {
  const { db, close } = setup();
  const stub = stubPayPal();
  try {
    await call({
      db, path: '/api/donations/paypal/orders',
      session: asMember('u-alice'),
      body: { amount_cents: 2500, request_id: NONCE, user_id: 'u-attacker', custom_id: 'u-attacker' },
    });
    const sent = JSON.parse(stub.orders()[0].body);
    assert.equal(sent.purchase_units[0].custom_id, 'u-alice', 'identity comes from the session');
    assert.ok(!stub.orders()[0].body.includes('u-attacker'));
    // Nothing about the donor beyond an opaque internal id crosses to PayPal.
    assert.ok(!stub.orders()[0].body.includes('u-alice@bm.test'), 'no email may reach PayPal');
  } finally { stub.restore(); close(); }
});

/* ==================================================== 8-9. idempotency === */

test('8-9. a retry reuses the PayPal idempotency key; a new gift gets a new one', async () => {
  const { db, close } = setup();
  const stub = stubPayPal();
  try {
    const body = { amount_cents: 2500, request_id: NONCE };
    await call({ db, path: '/api/donations/paypal/orders', session: asMember('u-alice'), body });
    await call({ db, path: '/api/donations/paypal/orders', session: asMember('u-alice'), body });          // retry
    await call({ db, path: '/api/donations/paypal/orders', session: asMember('u-alice'), body: { ...body, request_id: 'zzzzzzzzzz999999' } });
    await call({ db, path: '/api/donations/paypal/orders', body });                                         // anonymous, same nonce

    const keys = stub.orders().map(c => c.headers['PayPal-Request-Id']);
    assert.equal(keys.length, 4);
    assert.equal(keys[0], keys[1], '8. the same intentional gift keeps one key');
    assert.notEqual(keys[0], keys[2], '9. a new intentional gift gets a new key');
    assert.notEqual(keys[0], keys[3], 'two donors sharing a nonce must not collide');
    assert.ok(keys.every(k => typeof k === 'string' && k.length > 0));

    // A malformed nonce never reaches PayPal at all.
    for (const bad of ['short', 'x'.repeat(65), 'has spaces', 'has:colon', undefined]) {
      const res = await call({ db, path: '/api/donations/paypal/orders', body: { amount_cents: 2500, request_id: bad } });
      assert.equal(res.status, 400, `accepted request_id ${bad}`);
    }
    assert.equal(stub.orders().length, 4);
  } finally { stub.restore(); close(); }
});

/* ==================================================== 11, 33. failure === */

test('11, 33. a PayPal outage is retryable, writes nothing, and is not a failed payment', async () => {
  for (const status of [429, 500, 503]) {
    const { db, sqlite, close } = setup();
    const stub = stubPayPal({ apiStatus: status });
    try {
      const res = await call({ db, path: '/api/donations/paypal/orders', body: { amount_cents: 2500, request_id: NONCE } });
      assert.equal(res.status, 502, `${status} must surface as a gateway problem`);
      const b = await res.json();
      assert.ok(!/failed|declined/i.test(JSON.stringify(b)), 'must not read as a payment failure');
      assert.equal(countDonations(sqlite), 0);
    } finally { stub.restore(); close(); }
  }
});

/* ==================================================== 12-13. capture === */

test('12. capture requires a well-formed order id and never forwards a malformed one', async () => {
  const { db, close } = setup();
  const stub = stubPayPal();
  try {
    for (const bad of ['abc', 'x'.repeat(65), 'has space', 'a/b', '../../v1/oauth2/token', '%2e%2e']) {
      const res = await call({ db, path: `/api/donations/paypal/orders/${encodeURIComponent(bad)}/capture` });
      assert.equal(res.status, 400, `accepted order id ${bad}`);
    }
    assert.equal(stub.calls.filter(c => c.url.includes('/capture')).length, 0, 'nothing malformed reached PayPal');
  } finally { stub.restore(); close(); }
});

test('13. a successful capture reports what PayPal said and persists NOTHING', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    const res = await call({ db, path: '/api/donations/paypal/orders/ORDER-1/capture' });
    assert.equal(res.status, 200);
    const b = await res.json();
    assert.equal(b.status, 'COMPLETED');
    assert.equal(b.capture_status, 'COMPLETED');
    // The browser's onApprove is not proof money arrived. The webhook is.
    assert.equal(countDonations(sqlite), 0, 'capture must not fabricate a donation row');
    assert.equal(auditRows(sqlite, 'donation.recorded').length, 0);
    assert.ok(!JSON.stringify(b).includes(TOKEN));
    assert.ok(!JSON.stringify(b).includes(SECRET));
  } finally { stub.restore(); close(); }
});

test('a capture PayPal has not completed is reported honestly, not as success', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal({
    capture: { id: 'ORDER-1', status: 'PENDING', purchase_units: [{ payments: { captures: [{ id: 'CAP-1', status: 'PENDING' }] } }] },
  });
  try {
    const b = await (await call({ db, path: '/api/donations/paypal/orders/ORDER-1/capture' })).json();
    assert.equal(b.status, 'PENDING');
    assert.equal(b.capture_status, 'PENDING');
    assert.equal(countDonations(sqlite), 0);
  } finally { stub.restore(); close(); }
});

/* ==================================================== 14-15. webhook gate === */

test('14. an unverified webhook is rejected and changes no financial state', async () => {
  // Every failure mode of verification: PayPal says no, and every signature
  // header individually missing.
  const cases = [
    ['verification refused', { verify: 'FAILURE' }, SIGNED],
    ['no signature at all', {}, {}],
    ...Object.keys(SIGNED).map(h => [`missing ${h}`, {}, Object.fromEntries(Object.entries(SIGNED).filter(([k]) => k !== h))]),
  ];
  for (const [label, opts, headers] of cases) {
    const { db, sqlite, close } = setup();
    const stub = stubPayPal(opts);
    try {
      const res = await webhook(db, captureEvent('PAYMENT.CAPTURE.COMPLETED'), headers);
      assert.equal(res.status, 400, `accepted a webhook with ${label}`);
      assert.equal(countDonations(sqlite), 0, `${label} altered financial state`);
      assert.equal(auditRows(sqlite, 'donation.recorded').length, 0);
    } finally { stub.restore(); close(); }
  }
});

test('the webhook endpoint refuses outright when verification is not configured', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    const url = new URL('https://blockchainministries.io/api/webhooks/paypal');
    const { PAYPAL_WEBHOOK_ID, ...rest } = env();
    void PAYPAL_WEBHOOK_ID;
    const res = await router().handle({
      request: new Request(url, { method: 'POST', headers: SIGNED, body: captureEvent('PAYMENT.CAPTURE.COMPLETED') }),
      url, env: { DB: db, ...rest }, flags: { ...PROD_FLAGS }, session: null, sessionLoaded: true,
    });
    assert.equal(res.status, 503, 'an unverifiable webhook must be refused, not accepted');
    assert.equal(countDonations(sqlite), 0);
  } finally { stub.restore(); close(); }
});

test('15. a malformed webhook body is rejected', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    for (const raw of ['', 'not json', '{"unterminated":', '[]']) {
      const res = await webhook(db, raw);
      assert.ok(res.status >= 400, `accepted body ${JSON.stringify(raw)}`);
      assert.equal(countDonations(sqlite), 0);
    }
  } finally { stub.restore(); close(); }
});

/* ==================================================== 16-18, 23. persistence === */

test('16-17. a verified completed capture persists one gift at the amount PayPal states', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    // The browser earlier ASKED for $25. PayPal says the captured amount was
    // $37.19. The provider record is what is persisted.
    await call({ db, path: '/api/donations/paypal/orders', session: asMember('u-alice'), body: { amount_cents: 2500, request_id: NONCE } });

    const res = await webhook(db, captureEvent('PAYMENT.CAPTURE.COMPLETED', { value: '37.19', customId: 'u-alice' }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { received: true, donation: 'recorded' });

    const row = sqlite.prepare('SELECT * FROM donations').get();
    assert.equal(row.provider, 'paypal');
    assert.equal(row.provider_event_id, 'WH-EVT-1', 'the webhook event id is the idempotency key');
    assert.equal(row.provider_txn_id, 'CAP-1', 'the capture id is the authoritative transaction id');
    assert.equal(row.amount_cents, 3719, '17. the captured amount is authoritative');
    assert.equal(row.amount_drops, null, 'a fiat gift carries no drops');
    assert.equal(row.currency, 'usd');
    assert.equal(row.status, 'completed');
    assert.equal(row.user_id, 'u-alice');

    // Nothing forbidden is stored.
    const stored = JSON.stringify(row);
    assert.ok(!/payer|email|address|token|links|seller_receivable/i.test(stored), `raw provider material stored: ${stored}`);
  } finally { stub.restore(); close(); }
});

test('18, 23. a duplicate delivery is a no-op and sends no second notification', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    const raw = captureEvent('PAYMENT.CAPTURE.COMPLETED', { customId: 'u-alice' });
    const first = await (await webhook(db, raw)).json();
    const mailsAfterFirst = stub.mail.length;

    for (let i = 0; i < 3; i += 1) {
      const again = await (await webhook(db, raw)).json();
      assert.deepEqual(again, { received: true, donation: 'duplicate' });
    }
    assert.equal(first.donation, 'recorded');
    assert.equal(countDonations(sqlite), 1, 'PayPal retries must not duplicate a gift');
    assert.equal(auditRows(sqlite, 'donation.recorded').length, 1, '23. exactly one audit for one gift');
    assert.equal(stub.mail.length, mailsAfterFirst, '23. no second notification');
    assert.ok(mailsAfterFirst >= 1, 'a genuinely new completed gift is announced');
    assert.equal(auditRows(sqlite, 'notify.failed').length, 0);
  } finally { stub.restore(); close(); }
});

test('23. the notification carries safe facts only, and its failure is fail-soft', async () => {
  const { db, sqlite, close } = setup();
  const original = globalThis.fetch;
  const bodies = [];
  const stub = stubPayPal();
  const wrapped = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes('paypal.com')) bodies.push(String(init?.body ?? ''));
    return wrapped(url, init);
  };
  try {
    await webhook(db, captureEvent('PAYMENT.CAPTURE.COMPLETED', { value: '37.19', customId: 'u-alice' }));
    const mail = bodies.join('\n');
    assert.ok(mail.includes('37.19'), 'the amount is safe to report');
    assert.ok(!mail.includes(TOKEN) && !mail.includes(SECRET), 'no credential may be mailed');
    assert.ok(!mail.includes('u-alice@bm.test'), 'no donor email');
    assert.ok(!mail.includes('WH-SANDBOX-1'));
    assert.ok(!/paypal-transmission|cert_url|auth_algo/i.test(mail), 'no webhook headers');
    assert.equal(countDonations(sqlite), 1);
  } finally { globalThis.fetch = original; stub.restore(); close(); }
});

test('a notification failure never undoes the gift it was announcing', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  const wrapped = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (!String(url).includes('paypal.com')) throw new Error('mail provider down');
    return wrapped(url, init);
  };
  try {
    const res = await webhook(db, captureEvent('PAYMENT.CAPTURE.COMPLETED'));
    assert.equal(res.status, 200, 'notification failure must be fail-soft');
    assert.equal(countDonations(sqlite), 1, 'the gift is still recorded');
  } finally { stub.restore(); close(); }
});

/* ==================================================== 19-22. lifecycle === */

test('21. a pending capture is recorded as pending, announced to nobody, and is not completed', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    await webhook(db, captureEvent('PAYMENT.CAPTURE.PENDING'));
    const row = sqlite.prepare('SELECT * FROM donations').get();
    assert.equal(row.status, 'pending');
    assert.notEqual(row.status, 'completed');
    assert.equal(stub.mail.length, 0, 'a pending capture is not good news to send');
  } finally { stub.restore(); close(); }
});

test('22. a declined capture never becomes a successful gift', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    await webhook(db, captureEvent('PAYMENT.CAPTURE.DECLINED'));
    const row = sqlite.prepare('SELECT * FROM donations').get();
    assert.equal(row.status, 'declined');
    assert.equal(stub.mail.length, 0);
    // A declined gift must not surface as money in a member's history.
    const mine = await (await call({ db, path: '/api/donations/mine', method: 'GET', session: asMember('u-alice') })).json();
    assert.equal(mine.items.length, 0, 'an anonymous declined capture is not the member\'s');
  } finally { stub.restore(); close(); }
});

test('19-20. a refund or reversal transitions the ORIGINAL gift and creates no second one', async () => {
  for (const [type, status] of [['PAYMENT.CAPTURE.REFUNDED', 'refunded'], ['PAYMENT.CAPTURE.REVERSED', 'reversed']]) {
    const { db, sqlite, close } = setup();
    const stub = stubPayPal();
    try {
      await webhook(db, captureEvent('PAYMENT.CAPTURE.COMPLETED', { customId: 'u-alice' }));
      assert.equal(countDonations(sqlite), 1);

      const links = [
        { rel: 'self', href: 'https://api-m.sandbox.paypal.com/v2/payments/refunds/REF-9' },
        { rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAP-1' },
      ];
      const raw = JSON.stringify({ id: 'WH-EVT-2', event_type: type, resource: { id: 'REF-9', links } });

      const res = await (await webhook(db, raw)).json();
      assert.deepEqual(res, { received: true, transition: status });
      assert.equal(countDonations(sqlite), 1, 'a new event id must not manufacture a phantom donation');
      assert.equal(sqlite.prepare('SELECT status FROM donations').get().status, status);
      assert.equal(sqlite.prepare('SELECT provider_txn_id FROM donations').get().provider_txn_id, 'CAP-1');

      // A redelivered refund converges instead of accumulating.
      const again = await (await webhook(db, raw)).json();
      assert.deepEqual(again, { received: true, transition: 'no_matching_donation' });
      assert.equal(countDonations(sqlite), 1);
    } finally { stub.restore(); close(); }
  }
});

test('a refund for a capture this ministry never recorded writes nothing at all', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    const raw = JSON.stringify({
      id: 'WH-EVT-3', event_type: 'PAYMENT.CAPTURE.REFUNDED',
      resource: { id: 'REF-X', links: [{ rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAP-UNKNOWN' }] },
    });
    const res = await (await webhook(db, raw)).json();
    assert.equal(res.transition, 'no_matching_donation');
    assert.equal(countDonations(sqlite), 0);
  } finally { stub.restore(); close(); }
});

test('an event the ministry does not handle is acknowledged and ignored', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    // M14.5B note: BILLING.SUBSCRIPTION.ACTIVATED used to belong on this list
    // and no longer does — it is now genuinely handled. See
    // worker/routes/paypalRecurring.test.js.
    for (const type of ['CHECKOUT.ORDER.APPROVED', 'CUSTOMER.DISPUTE.CREATED', 'PAYMENT.CAPTURE.DENIED']) {
      const res = await (await webhook(db, captureEvent(type, { eventId: `WH-${type}` }))).json();
      assert.deepEqual(res, { received: true, ignored: type });
    }
    assert.equal(countDonations(sqlite), 0);
  } finally { stub.restore(); close(); }
});

/* ==================================================== 24-25. projections === */

test('24. a member sees their PayPal gift with no provider internals', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    await webhook(db, captureEvent('PAYMENT.CAPTURE.COMPLETED', { value: '37.19', customId: 'u-alice' }));
    const body = await (await call({ db, path: '/api/donations/mine', method: 'GET', session: asMember('u-alice') })).json();

    assert.equal(body.items.length, 1);
    const item = body.items[0];
    assert.equal(item.provider, 'paypal');
    assert.equal(item.amount_cents, 3719);
    assert.equal(item.currency, 'usd');
    assert.equal(item.status, 'completed');
    assert.ok(item.created_at);
    // The capture id, the destination tag and the ledger index are all absent.
    assert.deepEqual(
      Object.keys(item).sort(),
      ['amount_cents', 'amount_drops', 'created_at', 'currency', 'id', 'provider', 'reference_url', 'status'],
    );
    assert.ok(!JSON.stringify(body).includes('CAP-1'), 'no provider transaction id');
    assert.ok(!JSON.stringify(body).includes('WH-EVT-1'), 'no provider event id');
    assert.ok(!JSON.stringify(body).includes('u-alice'), 'no user id echoed');

    // Another member sees nothing of it.
    seedUser(sqlite, { id: 'u-bob', email: 'u-bob@bm.test' });
    const other = await (await call({ db, path: '/api/donations/mine', method: 'GET', session: asMember('u-bob') })).json();
    assert.equal(other.items.length, 0);
  } finally { stub.restore(); close(); }
});

test('25. the admin projection shows a PayPal row as PayPal, with no payer PII', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    await webhook(db, captureEvent('PAYMENT.CAPTURE.COMPLETED', { value: '37.19', customId: 'u-alice' }));
    const rows = await repos(db).donations.list({});
    assert.equal(rows.length, 1);

    const view = projectDonation(rows[0]);
    assert.equal(view.provider, 'PayPal');
    assert.equal(view.amount, '37.19 USD');
    assert.equal(view.currency, 'USD');
    assert.equal(view.status, 'Completed');
    assert.equal(view.donor, 'Member', 'a donor is shown as attributed, never named');

    const shown = JSON.stringify(view);
    assert.ok(!shown.includes('u-alice'), 'no user id');
    assert.ok(!shown.includes('CAP-1'), 'no capture id');
    assert.ok(!shown.includes('WH-EVT-1'), 'no provider event id');
    assert.ok(!shown.includes('@'), 'no email of any kind');

    // Every column the admin table renders is present, and the projection
    // carries no raw database field the M13 allow-list excluded.
    for (const col of DONATION_COLUMNS) {
      assert.ok(col.key in view, `the admin table renders ${col.key} but the projection omits it`);
    }
    for (const forbidden of ['user_id', 'provider_event_id', 'provider_txn_id',
      'xrpl_destination_tag', 'xrpl_ledger_index', 'amount_cents', 'amount_drops']) {
      assert.ok(!(forbidden in view), `${forbidden} leaked into the admin projection`);
    }

    // An anonymous PayPal gift reads as Anonymous rather than blank.
    await webhook(db, captureEvent('PAYMENT.CAPTURE.COMPLETED', { eventId: 'WH-EVT-9', captureId: 'CAP-9' }));
    const all = await repos(db).donations.list({});
    assert.ok(all.map(projectDonation).some(v => v.donor === 'Anonymous'));
    assert.equal(countDonations(sqlite), 2);
  } finally { stub.restore(); close(); }
});

/* ============================== 28-32. recurring — DEFERRED at the schema gate === */

test('28-32. the recurring gate is LIFTED by 0006, and still fails closed unconfigured', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubPayPal();
  try {
    // M14.5 deferred recurring because the schema could not hold a PayPal
    // subscription. M14.5B authorized migration 0006, so the honest state has
    // changed: the route exists, the schema is provider-neutral, and the gate
    // is now purely CONFIGURATION — which still fails closed.
    const res = await call({
      db, path: '/api/donations/paypal/subscriptions',
      session: asMember('u-alice'), body: { tier: 'supporter', request_id: NONCE },
    });
    assert.equal(res.status, 400, 'no configured Plan id: refuse, do not fabricate');
    assert.notEqual(res.status, 404, 'the route itself now exists');

    const cfg = await (await call({ db, path: '/api/donations/config', method: 'GET' })).json();
    assert.equal(cfg.paypal.recurring_available, false, 'unconfigured means the UI is told plainly');

    // The table can now hold a PayPal subscription.
    const cols = sqlite.prepare('SELECT name FROM pragma_table_info(\'subscriptions\')').all().map(c => c.name);
    assert.ok(cols.includes('provider'), 'provider-neutral after 0006');
    assert.ok(cols.includes('provider_subscription_id'));
    assert.ok(!cols.includes('stripe_subscription_id'), 'the Stripe-specific columns are gone');

    // 0006 exists; 0007 does not.
    const { MIGRATIONS } = await import('../../test/helpers/d1.mjs');
    assert.ok(MIGRATIONS.includes('0006_provider_neutral_subscriptions.sql'));
    assert.ok(!MIGRATIONS.some(m => m.startsWith('0007')), 'migration 0007 must not exist without authorization');
  } finally { stub.restore(); close(); }
});

test('19 (UI). the Monthly tab states plainly that PayPal recurring is not open', async () => {
  const { readFileSync } = await import('node:fs');
  const tiers = readFileSync(new URL('../../src/pages/Donate/components/StripeTiers.jsx', import.meta.url), 'utf8');
  assert.match(tiers, /recurring_available/, 'the UI must read the server\'s own recurring flag');
  assert.match(tiers, /not open yet/, 'an unavailable rail must say so rather than vanish');
  // No unfinished benefits and no tax claims, on either monthly surface.
  //
  // Asserted against CODE, not prose: StripeTiers.jsx carries a comment
  // recording that the old benefit promises were deleted and why, and a naive
  // grep over raw source matches that explanation and reports the very defect
  // it documents.
  const withoutComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  for (const p of ['StripeTiers.jsx', 'PayPalGive.jsx']) {
    const src = withoutComments(readFileSync(new URL(`../../src/pages/Donate/components/${p}`, import.meta.url), 'utf8'));
    assert.ok(!/tax.?deduct|501\(c\)|charitable contribution|tax.?exempt/i.test(src), `${p} makes a tax claim`);
    assert.ok(!/DAO voting|priority support|monthly EFT reward/i.test(src), `${p} promises an unimplemented benefit`);
  }
});
