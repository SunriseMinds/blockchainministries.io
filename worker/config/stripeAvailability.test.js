/**
 * Post-M14 — Stripe availability is SERVER-derived, and the browser cannot
 * infer readiness from anything else.
 *
 * The defect this locks out: production rendered an enabled "Give $100"
 * button against a Stripe account that did not exist, because the only signal
 * the page had was `one_time.available`, which describes the CATALOGUE rather
 * than the PROVIDER. The 503 arrived only after the donor pressed it.
 *
 * Run: node --test worker/config/stripeAvailability.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Router } from '@reellink/api/router.js';
import { freshDb, seedUser } from '../../test/helpers/d1.mjs';
import { PROD_FLAGS, asMember } from '../../test/helpers/route.mjs';
import { mount } from '../routes/public.js';
import { stripeAvailable, stripeConfig, stripePublicConfig, stripeWebhookConfigured } from './stripe.js';
import { givingConfig } from './tiers.js';

const SECRET_KEY = 'sk_test_DO_NOT_LEAK_51ExampleKeyMaterial';
const LIVE_KEY = 'sk_live_DO_NOT_LEAK_51ExampleKeyMaterial';
const WHSEC = 'whsec_DO_NOT_LEAK_ExampleWebhookSecret';

let cached = null;
function router() {
  if (!cached) { cached = new Router(); mount(cached); }
  return cached;
}

async function config(env = {}) {
  const { db, sqlite, close } = freshDb();
  seedUser(sqlite, { id: 'u-alice', email: 'u-alice@bm.test' });
  try {
    const url = new URL('https://blockchainministries.io/api/donations/config');
    const res = await router().handle({
      request: new Request(url), url,
      env: { DB: db, SITE_URL: 'https://blockchainministries.io', ...env },
      flags: { ...PROD_FLAGS }, session: null, sessionLoaded: true,
    });
    return { status: res.status, body: await res.json() };
  } finally { close(); }
}

/* ============================================== 1. unavailable without config === */

test('1. Stripe is unavailable without the server configuration it actually needs', async () => {
  // Nothing configured.
  assert.equal(stripeAvailable({}), false);
  assert.equal(stripeAvailable(undefined), false);
  // Half configured, in both directions. A Checkout Session the ministry
  // cannot RECORD is not a working rail: without the webhook secret a donor
  // could be charged and no donation row would ever exist.
  assert.equal(stripeAvailable({ STRIPE_SECRET_KEY: SECRET_KEY }), false, 'no webhook secret');
  assert.equal(stripeAvailable({ STRIPE_WEBHOOK_SECRET: WHSEC }), false, 'no secret key');
  assert.equal(stripeAvailable({ STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: WHSEC }), false);
  // Fully configured.
  assert.equal(stripeAvailable({ STRIPE_SECRET_KEY: SECRET_KEY, STRIPE_WEBHOOK_SECRET: WHSEC }), true);

  // And the endpoint reports it, with the two failure modes distinguishable.
  const off = await config();
  assert.equal(off.body.stripe.available, false);
  assert.equal(off.body.stripe.webhook_configured, false);

  const half = await config({ STRIPE_SECRET_KEY: SECRET_KEY });
  assert.equal(half.body.stripe.available, false, 'keys without a webhook must not read as ready');
  assert.equal(half.body.stripe.webhook_configured, false);
  assert.equal(stripeWebhookConfigured({ STRIPE_WEBHOOK_SECRET: WHSEC }), true);
});

test('a configured Stripe reports live vs test mode from the key prefix alone', async () => {
  const test1 = await config({ STRIPE_SECRET_KEY: SECRET_KEY, STRIPE_WEBHOOK_SECRET: WHSEC });
  assert.equal(test1.body.stripe.available, true);
  assert.equal(test1.body.stripe.live, false, 'a test key must not claim live mode');

  const live = await config({ STRIPE_SECRET_KEY: LIVE_KEY, STRIPE_WEBHOOK_SECRET: WHSEC });
  assert.equal(live.body.stripe.live, true);
  // Restricted live keys count as live too.
  assert.equal(stripeConfig({ STRIPE_SECRET_KEY: 'rk_live_x', STRIPE_WEBHOOK_SECRET: WHSEC }).live, true);
  assert.equal(stripeConfig({ STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: WHSEC }).live, false);
});

/* ============================================== 2. no secret exposure === */

test('2. no Stripe secret value appears in the config response, in any state', async () => {
  for (const env of [
    {},
    { STRIPE_SECRET_KEY: SECRET_KEY },
    { STRIPE_WEBHOOK_SECRET: WHSEC },
    { STRIPE_SECRET_KEY: SECRET_KEY, STRIPE_WEBHOOK_SECRET: WHSEC },
    { STRIPE_SECRET_KEY: LIVE_KEY, STRIPE_WEBHOOK_SECRET: WHSEC },
  ]) {
    const { body } = await config(env);
    const raw = JSON.stringify(body);
    for (const leak of [SECRET_KEY, LIVE_KEY, WHSEC, 'sk_test', 'sk_live', 'rk_live', 'whsec_']) {
      assert.ok(!raw.includes(leak), `config leaked ${leak}`);
    }
    assert.ok(!/STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET/.test(raw));
    // The public projection carries booleans only — no key, no prefix, no id.
    for (const v of Object.values(body.stripe)) assert.equal(typeof v, 'boolean');
  }

  // The config builder itself never returns key material either.
  const pub = stripePublicConfig({ STRIPE_SECRET_KEY: LIVE_KEY, STRIPE_WEBHOOK_SECRET: WHSEC });
  assert.ok(!JSON.stringify(pub).includes(LIVE_KEY));
  assert.deepEqual(Object.keys(pub).sort(), ['available', 'live', 'webhook_configured']);
});

/* ============================================== 3. catalogue != provider === */

test('3. catalogue availability does NOT imply provider availability', async () => {
  const { body } = await config();   // no Stripe configuration at all
  // The catalogue still says one-off giving exists as an offering...
  assert.equal(body.one_time.available, true, 'the catalogue is unchanged');
  // ...but the PROVIDER says no, and that is the authority for the UI.
  assert.equal(body.stripe.available, false);
  assert.notEqual(body.one_time.available, body.stripe.available,
    'these must be able to disagree — conflating them was the defect');

  // givingConfig alone knows nothing about provider configuration.
  const cat = givingConfig({});
  assert.equal(cat.one_time.available, true);
  assert.ok(!('stripe' in cat), 'provider state belongs to the route, not the catalogue');
});

/* ============================================== 4. UI offers no fake checkout === */

test('4. the Card UI offers no actionable checkout while Stripe is unavailable', () => {
  const src = readFileSync(new URL('../../src/pages/Donate/components/StripeOneTime.jsx', import.meta.url), 'utf8');

  // It consults the PROVIDER flag, not the catalogue one.
  assert.match(src, /config\?\.stripe\?\.available === true/, 'must read the server-derived provider flag');
  // The action is gated in BOTH the handler and the control.
  assert.match(src, /if \(!stripeReady\) return;/, 'the handler must refuse when the rail is off');
  assert.match(src, /disabled=\{busy \|\| !stripeReady\}/, 'the button must be disabled when the rail is off');
  assert.match(src, /onClick=\{stripeReady \? give : undefined\}/, 'no handler may be attached when off');
  // Honest copy, and the tab is not hidden.
  assert.match(src, /Card giving is being prepared and is not yet open/);
  assert.match(src, /not open yet/);
  // Rendering must not itself call the API — the only request is inside the
  // click handler, so an unconfigured rail produces no failed network call.
  assert.ok(!/useEffect/.test(src), 'the Card panel must issue no request merely by rendering');
  assert.equal((src.match(/api\.post\(/g) ?? []).length, 1, 'exactly one call site, inside the handler');

  // Tiers require BOTH a real Price and a configured Stripe.
  const tiers = readFileSync(new URL('../../src/pages/Donate/components/StripeTiers.jsx', import.meta.url), 'utf8');
  assert.match(tiers, /stripeReady && tier\.available/, 'a Price id alone must not enable a tier button');
  assert.match(tiers, /disabled=\{!canCheckout\(tier\)\}/);

  // The Card tab remains a first-class peer on the Donate page.
  const donate = readFileSync(new URL('../../src/pages/Donate.jsx', import.meta.url), 'utf8');
  assert.ok(donate.includes('<TabsTrigger value="card"'), 'the Card tab must stay visible');
});

/* ============================================== 5-6. other rails intact === */

test('5, 6. PayPal and XRP unavailable behaviour is unchanged', async () => {
  const { body } = await config();
  assert.equal(body.paypal.available, false);
  assert.equal(body.paypal.client_id, undefined);
  assert.equal(body.xrp.available, false);
  assert.equal(body.xrp.address, undefined);
  assert.equal(body.xrp.network, undefined);

  // Configuring Stripe must not disturb either of them.
  const withStripe = await config({ STRIPE_SECRET_KEY: SECRET_KEY, STRIPE_WEBHOOK_SECRET: WHSEC });
  assert.equal(withStripe.body.paypal.available, false);
  assert.equal(withStripe.body.xrp.available, false);
  assert.equal(withStripe.body.stripe.available, true);

  // And the three rails are reported independently of one another.
  const withXrp = await config({
    XRPL_NETWORK: 'testnet', XRPL_DONATION_ADDRESS: 'rssjCkKZiaCqqqBGZiVpWAXmddRgs8291E',
  });
  assert.equal(withXrp.body.xrp.available, true);
  assert.equal(withXrp.body.stripe.available, false, 'XRP being on must not imply Stripe is');
});

/* ============================================== 7-8. checkout behaviour === */

async function checkout({ env = {}, session = null, body }) {
  const { db, sqlite, close } = freshDb();
  seedUser(sqlite, { id: 'u-alice', email: 'u-alice@bm.test' });
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('api.stripe.com')) {
      return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }), { status: 200 });
    }
    return new Response('{}', { status: 200 });
  };
  try {
    const url = new URL('https://blockchainministries.io/api/donations/stripe/checkout');
    const res = await router().handle({
      request: new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.9' },
        body: JSON.stringify(body),
      }),
      url,
      env: { DB: db, SITE_URL: 'https://blockchainministries.io', ...env },
      flags: { ...PROD_FLAGS }, session, sessionLoaded: true,
    });
    return res.status;
  } finally { globalThis.fetch = original; close(); }
}

const CONFIGURED = { STRIPE_SECRET_KEY: SECRET_KEY, STRIPE_WEBHOOK_SECRET: WHSEC };
const NONCE = 'abcdefghij123456';

test('7. anonymous one-time Stripe giving still works once Stripe is genuinely configured', async () => {
  // Unconfigured: refused, and nothing is created.
  assert.equal(
    await checkout({ body: { mode: 'payment', amount_cents: 2500, request_id: NONCE } }),
    503, 'an unconfigured Stripe must refuse',
  );
  // Configured: an ANONYMOUS one-time gift is accepted, as M14.1 ratified.
  assert.equal(
    await checkout({ env: CONFIGURED, body: { mode: 'payment', amount_cents: 2500, request_id: NONCE } }),
    201, 'anonymous one-time giving must remain supported',
  );
  // Signed in also works.
  assert.equal(
    await checkout({ env: CONFIGURED, session: asMember('u-alice'), body: { mode: 'payment', amount_cents: 2500, request_id: NONCE } }),
    201,
  );
});

test('8. Stripe recurring still requires authentication', async () => {
  // Anonymous recurring is refused BEFORE the tier is even resolved.
  assert.equal(
    await checkout({ env: CONFIGURED, body: { mode: 'subscription', tier: 'supporter', request_id: NONCE } }),
    401, 'anonymous recurring must stay refused',
  );
  // Signed in, it still fails closed on the placeholder Price — the two gates
  // are independent, and neither was weakened by this change.
  assert.equal(
    await checkout({ env: CONFIGURED, session: asMember('u-alice'), body: { mode: 'subscription', tier: 'supporter', request_id: NONCE } }),
    400, 'a placeholder Price must still fail closed',
  );
});
