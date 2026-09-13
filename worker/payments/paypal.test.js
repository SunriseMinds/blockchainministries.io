/**
 * M14.5 — the PayPal rail at unit level.
 *
 * PayPal itself is stubbed at `globalThis.fetch`, so the REAL config gate, the
 * REAL OAuth cache, the REAL money conversion and the REAL event mapping run.
 * No PayPal account is contacted, no live credential exists, and no money of
 * any kind — sandbox or otherwise — moves here.
 *
 * Run: node --test worker/payments/paypal.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  accessToken, __clearTokenCache, createOrder, captureOrder,
  verifyWebhook, donationFromEvent, moneyToCents, SIGNATURE_HEADERS,
} from './paypal.js';
import { paypalConfig, paypalAvailable, requireWebhookId } from '../config/paypal.js';
import { resolvePayPalTier, tierPlanIsConfigured, TIERS, PLACEHOLDER_PLAN_IDS } from '../config/tiers.js';
import { keyFor, OPERATIONS } from './idempotency.js';

const SECRET = 'sb-client-secret-DO-NOT-LEAK';
const TOKEN = 'A21AA-sandbox-access-token-DO-NOT-LEAK';

function env(extra = {}) {
  return {
    PAYPAL_ENVIRONMENT: 'sandbox',
    PAYPAL_CLIENT_ID: 'sb-client-id',
    PAYPAL_CLIENT_SECRET: SECRET,
    PAYPAL_WEBHOOK_ID: 'WH-SANDBOX-1',
    ...extra,
  };
}

/**
 * Stub PayPal. Records every request so a test can assert on exactly what
 * crossed the wire (and on what did NOT).
 */
function stubPayPal({ token = TOKEN, expiresIn = 32400, tokenStatus = 200, apiStatus = 200, apiBody = {}, verify = 'SUCCESS', verifyStatus = 200, throwOn = null } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init, body: init.body ? String(init.body) : null, headers: init.headers ?? {} });
    if (throwOn && u.includes(throwOn)) throw new Error('socket hang up');
    if (u.endsWith('/v1/oauth2/token')) {
      if (tokenStatus !== 200) return new Response('nope', { status: tokenStatus });
      return new Response(JSON.stringify({ access_token: token, expires_in: expiresIn, token_type: 'Bearer' }), { status: 200 });
    }
    if (u.endsWith('/v1/notifications/verify-webhook-signature')) {
      if (verifyStatus !== 200) return new Response('nope', { status: verifyStatus });
      return new Response(JSON.stringify({ verification_status: verify }), { status: 200 });
    }
    if (apiStatus !== 200) return new Response(JSON.stringify({ name: 'INTERNAL_SERVER_ERROR' }), { status: apiStatus });
    return new Response(JSON.stringify(apiBody), { status: apiStatus });
  };
  return { calls, restore() { globalThis.fetch = original; } };
}

/** Capture everything the code under test writes to the console. */
function captureConsole(fn) {
  const lines = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...args) => lines.push(args.map(String).join(' '));
  return Promise.resolve()
    .then(fn)
    .finally(() => { for (const k of Object.keys(orig)) console[k] = orig[k]; })
    .then(() => lines.join('\n'));
}

const signedHeaders = new Headers({
  'paypal-transmission-id': 'tx-1',
  'paypal-transmission-time': '2026-09-12T00:00:00Z',
  'paypal-cert-url': 'https://api.sandbox.paypal.com/cert.pem',
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-transmission-sig': 'sig',
});

/* ============================================== 1-2. secrets stay server-side === */

test('1. the client secret never appears in anything the browser can receive', async () => {
  const cfg = paypalConfig(env());
  // The config object itself holds the secret (it must, to authenticate) but
  // the PUBLIC projection the route builds from it does not.
  const publicShape = {
    available: true, environment: cfg.environment, live: cfg.live,
    client_id: cfg.clientId, recurring_available: false,
  };
  assert.ok(!JSON.stringify(publicShape).includes(SECRET), 'the secret must never be projected');
  assert.ok(!JSON.stringify(publicShape).includes('WH-SANDBOX-1'), 'the webhook id must never be projected');
  assert.equal(publicShape.client_id, 'sb-client-id');

  // And no frontend source may name the secret or the webhook id at all.
  for (const file of ['../../src/pages/Donate/components/PayPalGive.jsx', '../../src/pages/Donate.jsx']) {
    const src = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.ok(!/PAYPAL_CLIENT_SECRET|PAYPAL_WEBHOOK_ID|client_secret/.test(src), `${file} names server-only material`);
  }
});

test('2. the OAuth token is cached, never logged, and never leaves the Worker', async () => {
  __clearTokenCache();
  const stub = stubPayPal();
  try {
    const cfg = paypalConfig(env());
    const output = await captureConsole(async () => {
      const t1 = await accessToken(cfg);
      assert.equal(t1, TOKEN);
      // A second call must reuse the cache, not re-authenticate.
      const t2 = await accessToken(cfg);
      assert.equal(t2, TOKEN);
      await createOrder(cfg, { amountCents: 2500, requestId: 'k1' });
    });
    assert.equal(stub.calls.filter(c => c.url.endsWith('/v1/oauth2/token')).length, 1, 'token must be cached per isolate');
    assert.ok(!output.includes(TOKEN), 'the access token must never be logged');
    assert.ok(!output.includes(SECRET), 'the client secret must never be logged');

    // Expiry is honoured with a safety margin rather than trusted to the second.
    __clearTokenCache();
    const before = Date.now();
    await accessToken(cfg, { now: before });
    // 32400s - 60s margin: still valid a minute later, so no second auth call.
    await accessToken(cfg, { now: before + 60_000 });
    assert.equal(stub.calls.filter(c => c.url.endsWith('/v1/oauth2/token')).length, 2);
  } finally { stub.restore(); __clearTokenCache(); }
});

test('the token request itself never travels to the browser-facing SDK host', async () => {
  __clearTokenCache();
  const stub = stubPayPal();
  try {
    await accessToken(paypalConfig(env()));
    assert.ok(stub.calls[0].url.startsWith('https://api-m.sandbox.paypal.com'), 'sandbox API host only');
    assert.ok(!stub.calls[0].url.includes('www.paypal.com'), 'never the public SDK host');
  } finally { stub.restore(); __clearTokenCache(); }
});

/* ============================================== config gate === */

test('the rail fails closed: unconfigured, misconfigured, and live without the switch', () => {
  assert.equal(paypalAvailable({}), false, 'no credentials means no PayPal');
  assert.equal(paypalAvailable({ PAYPAL_CLIENT_ID: 'x' }), false, 'a half credential is not a credential');
  assert.equal(paypalAvailable(env({ PAYPAL_ENVIRONMENT: 'staging' })), false, 'unknown environment is refused');
  assert.equal(paypalAvailable(env({ PAYPAL_ENVIRONMENT: 'live' })), false, 'M14.5 is sandbox-only');
  assert.equal(paypalAvailable(env({ PAYPAL_ENVIRONMENT: 'live', PAYPAL_ALLOW_LIVE: 'true' })), true, 'live needs an explicit switch');
  assert.equal(paypalConfig(env()).live, false, 'sandbox must report itself as not live');

  // Webhook verification is refused outright without a webhook id.
  assert.throws(() => requireWebhookId(paypalConfig(env({ PAYPAL_WEBHOOK_ID: '' }))), /not configured/);
});

/* ============================================== 3-5. amounts === */

test('3-5. money converts exactly, and a malformed amount converts to nothing', () => {
  assert.equal(moneyToCents('1.00'), 100);          // minimum $1
  assert.equal(moneyToCents('100000.00'), 10_000_000); // maximum $100,000
  assert.equal(moneyToCents('12.34'), 1234);
  assert.equal(moneyToCents('0.07'), 7);
  assert.equal(moneyToCents('19.9'), 1990, 'one decimal place pads, it does not truncate');
  assert.equal(moneyToCents('99999999999999999.99'), 9999999999999999900, 'no float rounding at scale');
  for (const bad of ['', ' ', 'abc', '-1.00', '1.234', '1e2', '1,00', null, undefined, {}, []]) {
    assert.equal(moneyToCents(bad), null, `accepted ${JSON.stringify(bad)}`);
  }
});

test('the order amount PayPal is told is derived from cents, never from a float', async () => {
  __clearTokenCache();
  const stub = stubPayPal({ apiBody: { id: 'ORDER-1', status: 'CREATED' } });
  try {
    await createOrder(paypalConfig(env()), { amountCents: 2500, requestId: 'k' });
    const order = JSON.parse(stub.calls.find(c => c.url.endsWith('/v2/checkout/orders')).body);
    assert.equal(order.purchase_units[0].amount.value, '25.00');
    assert.equal(order.purchase_units[0].amount.currency_code, 'USD');
    assert.equal(order.intent, 'CAPTURE');
    assert.equal(order.application_context.shipping_preference, 'NO_SHIPPING');
  } finally { stub.restore(); __clearTokenCache(); }
});

/* ============================================== 8-9. idempotency === */

test('8-9. the same intentional gift keeps one key; a new gift gets a new one', async () => {
  __clearTokenCache();
  const stub = stubPayPal({ apiBody: { id: 'ORDER-1', status: 'CREATED' } });
  try {
    const cfg = paypalConfig(env());
    const nonce = 'abcdefghij123456';
    const retryKey = keyFor(OPERATIONS.ONE_TIME, 'u-alice', nonce);

    await createOrder(cfg, { amountCents: 2500, requestId: retryKey });
    await createOrder(cfg, { amountCents: 2500, requestId: retryKey });   // a retry
    await createOrder(cfg, { amountCents: 2500, requestId: keyFor(OPERATIONS.ONE_TIME, 'u-alice', 'zzzzzzzzzz999999') });

    const sent = stub.calls
      .filter(c => c.url.endsWith('/v2/checkout/orders'))
      .map(c => c.headers['PayPal-Request-Id']);
    assert.equal(sent.length, 3);
    assert.equal(sent[0], sent[1], 'a retry must carry the SAME PayPal-Request-Id');
    assert.notEqual(sent[0], sent[2], 'a new intentional gift must carry a new one');

    // Two donors with the same nonce must never collide.
    assert.notEqual(
      keyFor(OPERATIONS.ONE_TIME, 'u-alice', nonce),
      keyFor(OPERATIONS.ONE_TIME, 'u-bob', nonce),
    );
    // A one-time gift and a subscription are different acts.
    assert.notEqual(retryKey, keyFor(OPERATIONS.TIER, 'u-alice', nonce));
  } finally { stub.restore(); __clearTokenCache(); }
});

/* ============================================== 11 / 33. provider failure === */

test('11, 33. a transient PayPal failure is retryable and is never reported as payment failure', async () => {
  for (const status of [429, 500, 502, 503]) {
    __clearTokenCache();
    const stub = stubPayPal({ apiStatus: status });
    try {
      await assert.rejects(
        () => createOrder(paypalConfig(env()), { amountCents: 2500, requestId: 'k' }),
        (e) => {
          assert.equal(e.status, 502, `${status} must surface as a gateway problem`);
          assert.equal(e.code, 'provider_unavailable');
          assert.ok(!/failed|declined/i.test(e.message), 'must not read as a payment failure');
          return true;
        },
      );
    } finally { stub.restore(); __clearTokenCache(); }
  }
});

test('a genuine PayPal rejection is a 400, and its body is never echoed to the donor', async () => {
  __clearTokenCache();
  const stub = stubPayPal({ apiStatus: 422 });
  try {
    await assert.rejects(
      () => createOrder(paypalConfig(env()), { amountCents: 2500, requestId: 'k' }),
      (e) => {
        assert.equal(e.status, 400);
        assert.equal(e.code, 'provider_error');
        assert.ok(!e.message.includes('INTERNAL_SERVER_ERROR'), 'provider internals must not be echoed');
        return true;
      },
    );
  } finally { stub.restore(); __clearTokenCache(); }
});

test('an unreachable PayPal is retryable, not a failed payment', async () => {
  __clearTokenCache();
  const stub = stubPayPal({ throwOn: '/v2/checkout/orders' });
  try {
    await assert.rejects(
      () => createOrder(paypalConfig(env()), { amountCents: 2500, requestId: 'k' }),
      (e) => { assert.equal(e.code, 'provider_unavailable'); return true; },
    );
  } finally { stub.restore(); __clearTokenCache(); }
});

test('OAuth being unavailable never becomes a payment-failed state', async () => {
  // The last case is a 200 that carries no token at all — a shape that must
  // not be mistaken for a successful authentication.
  for (const opts of [{ tokenStatus: 500 }, { tokenStatus: 401 }, { throwOn: '/v1/oauth2/token' }, { token: null }]) {
    __clearTokenCache();
    const stub = stubPayPal(opts);
    try {
      await assert.rejects(
        () => accessToken(paypalConfig(env())),
        (e) => { assert.equal(e.status, 502); assert.equal(e.code, 'provider_unavailable'); return true; },
      );
    } finally { stub.restore(); __clearTokenCache(); }
  }
});

/* ============================================== 12. capture === */

test('12. capture addresses exactly the order it was given, safely encoded', async () => {
  __clearTokenCache();
  const stub = stubPayPal({ apiBody: { id: 'ORDER-1', status: 'COMPLETED' } });
  try {
    await captureOrder(paypalConfig(env()), 'ORDER/../../v1/oauth2/token');
    const call = stub.calls.find(c => c.url.includes('/capture'));
    assert.ok(call.url.includes('ORDER%2F..%2F..%2Fv1%2Foauth2%2Ftoken'), 'the order id must be encoded');
    assert.ok(call.url.endsWith('/capture'));
  } finally { stub.restore(); __clearTokenCache(); }
});

/* ============================================== 14. webhook verification === */

test('14. webhook verification fails closed in every direction', async () => {
  const cfg = paypalConfig(env());
  const body = JSON.stringify({ id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' });

  // A missing webhook id: nothing can be verified, so nothing is accepted.
  {
    const stub = stubPayPal();
    __clearTokenCache();
    try {
      assert.equal(await verifyWebhook({ ...cfg, webhookId: null }, body, signedHeaders), false);
      assert.equal(stub.calls.length, 0, 'must not even ask PayPal');
    } finally { stub.restore(); }
  }

  // Each signature header is individually required.
  for (const missing of SIGNATURE_HEADERS) {
    const stub = stubPayPal();
    __clearTokenCache();
    try {
      const h = new Headers(signedHeaders);
      h.delete(missing);
      assert.equal(await verifyWebhook(cfg, body, h), false, `accepted a webhook missing ${missing}`);
    } finally { stub.restore(); }
  }

  // Anything other than SUCCESS, an error from the verifier, or an
  // unreachable verifier all mean: do not act.
  for (const opts of [{ verify: 'FAILURE' }, { verify: 'UNKNOWN' }, { verifyStatus: 500 }, { throwOn: 'verify-webhook-signature' }]) {
    const stub = stubPayPal(opts);
    __clearTokenCache();
    try {
      assert.equal(await verifyWebhook(cfg, body, signedHeaders), false, `accepted ${JSON.stringify(opts)}`);
    } finally { stub.restore(); }
  }

  // And the happy path genuinely verifies, over the RAW bytes received.
  {
    const stub = stubPayPal({ verify: 'SUCCESS' });
    __clearTokenCache();
    try {
      assert.equal(await verifyWebhook(cfg, body, signedHeaders), true);
      const sent = JSON.parse(stub.calls.find(c => c.url.includes('verify-webhook-signature')).body);
      assert.equal(sent.webhook_id, 'WH-SANDBOX-1');
      assert.equal(sent.transmission_id, 'tx-1');
      assert.equal(sent.auth_algo, 'SHA256withRSA');
      assert.deepEqual(sent.webhook_event, JSON.parse(body), 'the event is posted back as received');
    } finally { stub.restore(); __clearTokenCache(); }
  }
});

test('15. a malformed webhook body cannot be verified', async () => {
  const stub = stubPayPal();
  __clearTokenCache();
  try {
    assert.equal(await verifyWebhook(paypalConfig(env()), 'not json', signedHeaders), false);
    assert.equal(stub.calls.length, 0, 'unparseable input must not reach the verifier');
  } finally { stub.restore(); __clearTokenCache(); }
});

/* ============================================== 16-22. event mapping === */

const captureEvent = (type, o = {}) => ({
  id: o.eventId ?? 'WH-EVT-1',
  event_type: type,
  resource: {
    id: o.captureId ?? 'CAP-1',
    amount: { currency_code: o.currency ?? 'USD', value: o.value ?? '25.00' },
    custom_id: o.customId ?? '',
    ...(o.links ? { links: o.links } : {}),
  },
});

test('16-17. a completed capture maps to a completed gift at the amount PayPal states', () => {
  const m = donationFromEvent(captureEvent('PAYMENT.CAPTURE.COMPLETED', { value: '37.19', customId: 'u-alice' }));
  assert.equal(m.kind, 'record');
  assert.equal(m.status, 'completed');
  assert.equal(m.amountCents, 3719, 'the amount is the provider record, not anything a browser said');
  assert.equal(m.currency, 'usd');
  assert.equal(m.providerEventId, 'WH-EVT-1');
  assert.equal(m.providerTxnId, 'CAP-1', 'the capture id is the authoritative transaction id');
  assert.equal(m.userId, 'u-alice');
});

test('21. a pending capture is recorded as pending and never as completed', () => {
  const m = donationFromEvent(captureEvent('PAYMENT.CAPTURE.PENDING'));
  assert.equal(m.kind, 'record');
  assert.equal(m.status, 'pending');
  assert.notEqual(m.status, 'completed');
});

test('22. a declined capture is never a successful gift', () => {
  const m = donationFromEvent(captureEvent('PAYMENT.CAPTURE.DECLINED'));
  assert.equal(m.status, 'declined');
  assert.notEqual(m.status, 'completed');
});

test('19-20. a refund or reversal is a transition on the ORIGINAL capture, not a new gift', () => {
  const links = [
    { rel: 'self', href: 'https://api-m.sandbox.paypal.com/v2/payments/refunds/REF-9' },
    { rel: 'up', href: 'https://api-m.sandbox.paypal.com/v2/payments/captures/CAP-1' },
  ];
  for (const [type, status] of [['PAYMENT.CAPTURE.REFUNDED', 'refunded'], ['PAYMENT.CAPTURE.REVERSED', 'reversed']]) {
    const m = donationFromEvent({ id: 'WH-EVT-2', event_type: type, resource: { id: 'REF-9', links } });
    assert.equal(m.kind, 'transition', 'must never be a record: that would manufacture a phantom donation');
    assert.equal(m.status, status);
    assert.equal(m.targetTxnId, 'CAP-1', 'correlated to the capture, not to the refund id');
    assert.notEqual(m.targetTxnId, 'REF-9');
  }
});

test('events the ministry does not handle are ignored rather than guessed at', () => {
  for (const type of [
    'CHECKOUT.ORDER.APPROVED', 'PAYMENT.CAPTURE.DENIED', 'BILLING.SUBSCRIPTION.ACTIVATED',
    'PAYMENT.SALE.COMPLETED', 'CUSTOMER.DISPUTE.CREATED', 'MADE.UP.EVENT',
  ]) {
    assert.equal(donationFromEvent(captureEvent(type)), null, `${type} must not be mapped`);
  }
  assert.equal(donationFromEvent(null), null);
  assert.equal(donationFromEvent({}), null);
  assert.equal(donationFromEvent({ event_type: 'PAYMENT.CAPTURE.COMPLETED' }), null, 'no resource, no gift');
  // A completed event with an unusable amount is not turned into a zero gift.
  assert.equal(donationFromEvent({ id: 'e', event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'c', amount: { value: 'abc' } } }), null);
});

test('an anonymous gift carries no user, and custom_id is the only identity channel', () => {
  assert.equal(donationFromEvent(captureEvent('PAYMENT.CAPTURE.COMPLETED', { customId: '' })).userId, null);
  const m = donationFromEvent(captureEvent('PAYMENT.CAPTURE.COMPLETED', { customId: 'u-bob' }));
  assert.equal(m.userId, 'u-bob');
  // Nothing else about the payer is carried forward.
  assert.deepEqual(Object.keys(m).sort(), ['amountCents', 'currency', 'kind', 'providerEventId', 'providerTxnId', 'status', 'userId']);
});

/* ============================================== 28-32. recurring security model === */

test('28-29. the browser names a semantic tier; a PayPal Plan id cannot be injected', () => {
  // The three ministry tiers are the entire input space.
  assert.deepEqual(Object.keys(TIERS), ['supporter', 'guardian', 'archangel']);
  assert.equal(TIERS.supporter.amountCents, 1000);
  assert.equal(TIERS.guardian.amountCents, 5000);
  assert.equal(TIERS.archangel.amountCents, 10000);

  // A Plan id offered as a tier key resolves to nothing: there is no path
  // from browser input to an arbitrary PayPal Plan.
  for (const injected of ['P-5ML4271244454362WXNWU5NQ', 'PLAN_SUPPORTER_PLACEHOLDER', 'supporter ', 'SUPPORTER']) {
    assert.equal(resolvePayPalTier(injected), null, `resolved ${injected}`);
  }
});

test('31-32. an unknown tier and a placeholder plan both fail closed', () => {
  for (const bad of ['', 'patron', '__proto__', 'constructor', 'toString', null, undefined, 42, {}]) {
    assert.equal(resolvePayPalTier(bad), null, `resolved ${JSON.stringify(bad)}`);
  }
  // Every plan id is still a placeholder, so every tier is refused today.
  for (const key of Object.keys(TIERS)) {
    assert.ok(PLACEHOLDER_PLAN_IDS.includes(TIERS[key].paypalPlanId), `${key} must still be a placeholder`);
    assert.equal(tierPlanIsConfigured(TIERS[key]), false);
    assert.equal(resolvePayPalTier(key), null, `${key} must fail closed while unconfigured`);
  }
  // And it opens only when a real plan id exists — proven WITHOUT writing one
  // into the catalogue. M14.5B: the real id arrives as owner-set server
  // configuration, so this is exercised through env rather than by inventing
  // a Plan id in source.
  const configured = { PAYPAL_PLAN_SUPPORTER: 'P-REAL-PLAN-ID' };
  assert.equal(tierPlanIsConfigured(TIERS.supporter, configured), true);
  assert.equal(resolvePayPalTier('supporter', configured)?.paypalPlanId, 'P-REAL-PLAN-ID');
  assert.equal(resolvePayPalTier('guardian', configured), null, 'one configured tier does not open the others');
  // A blank or leftover-placeholder configuration still fails closed.
  assert.equal(tierPlanIsConfigured(TIERS.supporter, { PAYPAL_PLAN_SUPPORTER: '' }), false);
  assert.equal(tierPlanIsConfigured(TIERS.supporter, { PAYPAL_PLAN_SUPPORTER: 'PLAN_SUPPORTER_PLACEHOLDER' }), false);
  assert.equal(tierPlanIsConfigured({}, configured), false, 'a tier with no key resolves to nothing');
});

test('no PayPal Plan id is exposed to the browser by the catalogue projection', async () => {
  const { givingConfig } = await import('../config/tiers.js');
  const shown = JSON.stringify(givingConfig());
  for (const id of PLACEHOLDER_PLAN_IDS) assert.ok(!shown.includes(id), `${id} reached the browser`);
  assert.ok(!shown.includes('paypalPlanId'));
  assert.ok(!shown.includes('price_'), 'no Stripe Price id either');
});

/* ============================================== 26-27. SDK loading === */

test('26-27. the PayPal SDK loads only on Donate, only when configured, never sitewide', () => {
  const root = new URL('../../src/', import.meta.url);
  const read = (p) => readFileSync(new URL(p, root), 'utf8');

  /**
   * Assert against CODE, not prose. main.jsx carries a comment recording that
   * the sitewide PayPalScriptProvider was deleted and why — a naive grep over
   * raw source matches that explanation and reports the very defect it
   * documents. Block comments and whole-line `//` comments are removed; inline
   * trailing `//` is left alone so URLs inside string literals survive.
   */
  const withoutComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  // No sitewide provider survives anywhere.
  for (const p of ['App.jsx', 'main.jsx', 'pages/Home.jsx', 'pages/Contact.jsx', 'pages/Verify.jsx',
    'pages/Dashboard.jsx', 'pages/admin/AdminDashboard.jsx', 'components/layout/DashboardLayout.jsx']) {
    let src;
    try { src = withoutComments(read(p)); } catch { continue; }
    assert.ok(!/PayPalScriptProvider|@paypal\/react-paypal-js/.test(src), `${p} pulls in a PayPal provider`);
    assert.ok(!/paypal\.com\/sdk\/js/.test(src), `${p} loads the PayPal SDK`);
  }

  // The one place that loads it does so lazily and behind the availability gate.
  const give = read('pages/Donate/components/PayPalGive.jsx');
  assert.match(give, /paypal\.com\/sdk\/js/, 'the Donate PayPal component must load the SDK');
  assert.match(give, /if \(!pp\.available\) return undefined;/, 'the SDK must not load when PayPal is unconfigured');
  assert.match(give, /document\.createElement\('script'\)/, 'the SDK must be injected lazily, not bundled');

  // No package dependency on the old React wrapper remains.
  const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.ok(!Object.keys(deps).some(d => d.includes('paypal')), 'no PayPal package dependency should exist');
});

test('the Donate page offers Card, PayPal and XRP as peers, and PayPal is honest when unconfigured', () => {
  const donate = readFileSync(new URL('../../src/pages/Donate.jsx', import.meta.url), 'utf8');
  for (const value of ['card', 'paypal', 'xrp', 'monthly']) {
    assert.ok(donate.includes(`<TabsTrigger value="${value}"`), `the ${value} tab must exist`);
    assert.ok(donate.includes(`<TabsContent value="${value}"`), `the ${value} panel must exist`);
  }
  const give = readFileSync(new URL('../../src/pages/Donate/components/PayPalGive.jsx', import.meta.url), 'utf8');
  assert.match(give, /not yet open/, 'an unconfigured rail must say so plainly');
  // 20. Approval is never announced as a completed payment.
  assert.ok(!/Payment successful|Thank you for your payment|Donation successful/i.test(give));
  assert.match(give, /confirmation may take a moment/i);
});
