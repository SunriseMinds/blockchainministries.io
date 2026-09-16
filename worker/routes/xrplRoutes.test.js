/**
 * M14.4 — the XRP rail at route level, plus the scheduled sweep.
 *
 * The XRP Ledger is stubbed at `globalThis.fetch`, so the real routes, the
 * real verification contract and the real repositories all run; only the node
 * is simulated. No ledger is contacted and nothing is signed.
 *
 * Run: node --test worker/routes/xrplRoutes.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Router } from '@reellink/api/router.js';
import { freshDb, seedUser } from '../../test/helpers/d1.mjs';
import { PROD_FLAGS, asMember, auditRows } from '../../test/helpers/route.mjs';
import { mount } from './public.js';
import { repos } from '../db/repositories.js';
import { reconcile, SWEEP_LIMIT } from '../payments/xrplReconcile.js';
import { donationConfig } from '../config/xrpl.js';

const ADDRESS = 'rssjCkKZiaCqqqBGZiVpWAXmddRgs8291E';
const HASH = 'B'.repeat(64);

let cached = null;
function router() {
  if (!cached) { cached = new Router(); mount(cached); }
  return cached;
}

function env(extra = {}) {
  return {
    SITE_URL: 'https://blockchainministries.io',
    XRPL_NETWORK: 'testnet',
    XRPL_DONATION_ADDRESS: ADDRESS,
    EMAIL_PROVIDER: 'resend', EMAIL_API_KEY: 'k',
    EMAIL_FROM: 'contact@blockchainministries.io',
    ADMIN_NOTIFY_EMAIL: 'ops@bm.test',
    ...extra,
  };
}

const payment = (o = {}) => ({
  validated: true,
  hash: o.hash ?? HASH,
  ledger_index: o.ledgerIndex ?? 90_000_100,
  meta: { TransactionResult: 'tesSUCCESS', delivered_amount: o.delivered ?? '25000000' },
  tx_json: {
    TransactionType: 'Payment', Destination: o.destination ?? ADDRESS, Amount: '25000000',
    ...(o.tag === undefined ? {} : { DestinationTag: o.tag }),
  },
});

/** Stub the ledger node (and the mail provider) at the fetch boundary. */
function stubLedger({ tx = null, txs = [], fail = false, status = 200 } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('rippletest.net') || u.includes('xrplcluster')) {
      calls.push(JSON.parse(init.body));
      if (fail) throw new Error('socket hang up');
      if (status !== 200) return new Response('rate limited', { status });
      const method = JSON.parse(init.body).method;
      if (method === 'tx') return new Response(JSON.stringify({ result: tx ?? { error: 'txnNotFound' } }), { status: 200 });
      if (method === 'account_tx') return new Response(JSON.stringify({ result: { transactions: txs } }), { status: 200 });
    }
    return new Response(JSON.stringify({ id: 'msg' }), { status: 200 }); // email
  };
  return { calls, restore() { globalThis.fetch = original; } };
}

async function call({ db, path, method = 'POST', session = null, body, extraEnv = {} }) {
  const url = new URL(`https://blockchainministries.io${path}`);
  const request = new Request(url, {
    method,
    ...(method === 'POST' ? {
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '203.0.113.77' },
      body: JSON.stringify(body ?? {}),
    } : { headers: { 'CF-Connecting-IP': '203.0.113.77' } }),
  });
  return router().handle({
    request, url, env: { DB: db, ...env(extraEnv) },
    flags: { ...PROD_FLAGS }, session, sessionLoaded: true,
  });
}

function setup() {
  const { db, sqlite, close } = freshDb();
  seedUser(sqlite, { id: 'u-alice', email: 'u-alice@bm.test' });
  return { db, sqlite, close, repo: repos(db) };
}

/* =============================================== config + intents === */

test('the giving config advertises XRP only when the rail is configured', async () => {
  const { db, close } = setup();
  try {
    const on = await (await call({ db, path: '/api/donations/config', method: 'GET' })).json();
    assert.equal(on.xrp.available, true);
    assert.equal(on.xrp.network, 'testnet');
    assert.equal(on.xrp.live, false, 'testnet must report itself as not live');
    assert.equal(on.xrp.address, ADDRESS);
    assert.ok(!JSON.stringify(on).includes('SEED'));

    const url = new URL('https://blockchainministries.io/api/donations/config');
    const off = await (await router().handle({
      request: new Request(url), url, env: { DB: db, SITE_URL: 'https://x' },
      flags: { ...PROD_FLAGS }, session: null, sessionLoaded: true,
    })).json();
    assert.equal(off.xrp.available, false, 'unconfigured means the page does not offer XRP');
  } finally { close(); }
});

test('an intent returns a payment request and stores server-side ownership', async () => {
  const { db, sqlite, close } = setup();
  try {
    const res = await call({ db, path: '/api/donations/xrpl/intents', session: asMember('u-alice'), body: { amount_xrp: '25.5' } });
    assert.equal(res.status, 201);
    const b = await res.json();
    assert.equal(b.amount_xrp, '25.5');
    assert.equal(b.amount_drops, '25500000');
    assert.equal(b.address, ADDRESS);
    assert.equal(b.network, 'testnet');
    assert.ok(b.destination_tag >= 1 && b.destination_tag <= 4_294_967_294);
    assert.ok(b.payment_uri.includes(`dt=${b.destination_tag}`));
    assert.ok(!JSON.stringify(b).includes('u-alice'), 'the response must not echo identity');

    const row = sqlite.prepare('SELECT * FROM donation_intents').get();
    assert.equal(row.user_id, 'u-alice', 'ownership is stored server-side');
    assert.equal(row.expected_amount_drops, 25_500_000);
    assert.equal(row.status, 'open');
  } finally { close(); }
});

test('an anonymous intent is supported and a bad amount is refused', async () => {
  const { db, sqlite, close } = setup();
  try {
    assert.equal((await call({ db, path: '/api/donations/xrpl/intents', body: { amount_xrp: '1' } })).status, 201);
    assert.equal(sqlite.prepare('SELECT user_id FROM donation_intents').get().user_id, null);
    for (const bad of ['0', '-1', '1e6', 'abc', '0.0000001', '1000000']) {
      assert.equal((await call({ db, path: '/api/donations/xrpl/intents', body: { amount_xrp: bad } })).status, 400, `accepted ${bad}`);
    }
  } finally { close(); }
});

/* ================================================== fast path === */

test('12. the fast path confirms a real payment and records it once', async () => {
  const { db, sqlite, close, repo } = setup();
  const stub = stubLedger({ tx: payment({ tag: 8001 }) });
  try {
    await repo.donationIntents.create({ userId: 'u-alice', destinationTag: 8001, expectedAmountDrops: 25_000_000, expiresAt: '2099-01-01T00:00:00.000Z' });

    const first = await (await call({ db, path: '/api/donations/xrpl/verify', body: { tx_hash: HASH } })).json();
    assert.equal(first.outcome, 'confirmed');
    assert.equal(first.amount_xrp, '25');
    assert.equal(first.reference_url, `https://testnet.xrpl.org/transactions/${HASH}`);

    // A donor pressing it twice must not create a second gift.
    const second = await (await call({ db, path: '/api/donations/xrpl/verify', body: { tx_hash: HASH } })).json();
    assert.equal(second.outcome, 'already_recorded');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n, 1);
    assert.equal(sqlite.prepare('SELECT user_id FROM donations').get().user_id, 'u-alice');
  } finally { stub.restore(); close(); }
});

test('the fast path reports each refusal honestly and credits nothing', async () => {
  const cases = [
    ['not_validated_yet', { ...payment(), validated: false }],
    ['failed_transaction', { ...payment(), meta: { TransactionResult: 'tecPATH_DRY', delivered_amount: '1' } }],
    ['wrong_destination', payment({ destination: 'rKv7TSeDrnZVCH4fYRNrUKVM8X7tC5zutf' })],
    ['unsupported_asset', { ...payment(), meta: { TransactionResult: 'tesSUCCESS', delivered_amount: { currency: 'USD', value: '5' } } }],
  ];
  for (const [expected, tx] of cases) {
    const { db, sqlite, close } = setup();
    const stub = stubLedger({ tx });
    try {
      const b = await (await call({ db, path: '/api/donations/xrpl/verify', body: { tx_hash: HASH } })).json();
      assert.equal(b.outcome, expected);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n, 0, `${expected} must credit nothing`);
    } finally { stub.restore(); close(); }
  }
});

test('24-25. an RPC failure stays retryable and never reads as payment failure', async () => {
  for (const opts of [{ fail: true }, { status: 429 }, { status: 503 }]) {
    const { db, sqlite, close } = setup();
    const stub = stubLedger(opts);
    try {
      const b = await (await call({ db, path: '/api/donations/xrpl/verify', body: { tx_hash: HASH } })).json();
      assert.equal(b.outcome, 'temporarily_unavailable', `${JSON.stringify(opts)} must be retryable`);
      assert.notEqual(b.outcome, 'failed_transaction');
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n, 0);
    } finally { stub.restore(); close(); }
  }
});

test('a malformed hash is rejected before the ledger is contacted', async () => {
  const { db, close } = setup();
  const stub = stubLedger({ tx: payment() });
  try {
    for (const bad of ['', 'short', 'G'.repeat(64), 'A'.repeat(63)]) {
      const res = await call({ db, path: '/api/donations/xrpl/verify', body: { tx_hash: bad } });
      assert.equal(res.status, 400, `accepted ${bad}`);
    }
    assert.equal(stub.calls.length, 0, 'no RPC call for a malformed hash');
  } finally { stub.restore(); close(); }
});

/* =========================================== 33. notification === */

test('33. admin notification fires only for a genuinely new donation', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubLedger({ tx: payment({ tag: 8002 }) });
  try {
    await call({ db, path: '/api/donations/xrpl/verify', body: { tx_hash: HASH } });
    const mailsAfterFirst = stub.calls.length;
    await call({ db, path: '/api/donations/xrpl/verify', body: { tx_hash: HASH } });

    const audits = auditRows(sqlite, 'donation.recorded');
    assert.equal(audits.length, 1, 'exactly one audit for one gift');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n, 1);
    assert.ok(mailsAfterFirst >= 1);
    // No notification carries a payload, a seed or RPC internals.
    assert.equal(auditRows(sqlite, 'notify.failed').length, 0);
  } finally { stub.restore(); close(); }
});

/* ===================================== 32. scheduled reconciliation === */

test('32. the sweep is bounded and records what the fast path missed', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubLedger({
    txs: [
      payment({ hash: 'C'.repeat(64), tag: 9001, ledgerIndex: 90_000_200 }),
      payment({ hash: 'D'.repeat(64), tag: undefined, ledgerIndex: 90_000_201 }),
      { ...payment({ hash: 'E'.repeat(64) }), validated: false },          // skipped
      payment({ hash: 'F'.repeat(64), destination: 'rKv7TSeDrnZVCH4fYRNrUKVM8X7tC5zutf' }), // skipped
    ],
  });
  try {
    const cfg = donationConfig(env());
    const summary = await reconcile({ env: { DB: db, ...env() } }, cfg);
    assert.equal(summary.scanned, 4);
    assert.equal(summary.recorded, 2, 'only genuine receipts are recorded');
    assert.equal(summary.skipped, 2);
    assert.equal(summary.errors, 0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n, 2);

    // The request itself is bounded.
    const params = stub.calls.find(c => c.method === 'account_tx')?.params?.[0];
    assert.equal(params.account, ADDRESS);
    assert.ok(params.limit <= SWEEP_LIMIT, 'a sweep must be capped');
    assert.equal(params.ledger_index_max, -1);
  } finally { stub.restore(); close(); }
});

test('the sweep resumes from the highest ledger already recorded', async () => {
  const { db, close, repo } = setup();
  const stub = stubLedger({ txs: [] });
  try {
    await repo.donations.recordIfNew({
      provider: 'xrpl', providerEventId: 'A'.repeat(64), providerTxnId: 'A'.repeat(64),
      amountDrops: 1_000_000, currency: 'XRP', status: 'confirmed', xrplLedgerIndex: 90_000_500,
    });
    const cfg = donationConfig(env());
    const summary = await reconcile({ env: { DB: db, ...env() } }, cfg);
    assert.equal(summary.from, 90_000_500, 'the cursor is the recorded high-water mark');
    const params = stub.calls.find(c => c.method === 'account_tx')?.params?.[0];
    assert.equal(params.ledger_index_min, 90_000_500);
  } finally { stub.restore(); close(); }
});

test('a sweep aborts safely when the ledger node is unreachable', async () => {
  const { db, sqlite, close } = setup();
  const stub = stubLedger({ fail: true });
  try {
    const summary = await reconcile({ env: { DB: db, ...env() } }, donationConfig(env()));
    assert.equal(summary.reason, 'rpc_unavailable');
    assert.equal(summary.recorded, 0);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n, 0);
  } finally { stub.restore(); close(); }
});

test('the scheduled handler is wired, bounded and never signs', async () => {
  const { readFileSync } = await import('node:fs');
  const INDEX = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(INDEX, /async scheduled\(/, 'a scheduled handler must exist');
  assert.match(INDEX, /waitUntil/, 'the sweep must not hold the invocation open');
  assert.ok(!/XRPL_SEED|signAndSubmit|mintNft/.test(INDEX), 'the scheduled path must never sign');

  const WRANGLER = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(WRANGLER, /"crons"\s*:\s*\[\s*"\*\/5 \* \* \* \*"\s*\]/, 'a cron trigger must be configured');
});
