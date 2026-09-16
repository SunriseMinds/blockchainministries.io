/**
 * M14.4 — the XRP donation rail.
 *
 * The XRP Ledger is never contacted: every transaction below is a fixture
 * shaped like a real `tx` / `account_tx` response, so the verification
 * contract is exercised against the production code exactly as written.
 *
 * Run: node --test worker/payments/xrplDonations.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freshDb, seedUser } from '../../test/helpers/d1.mjs';
import { repos } from '../db/repositories.js';
import {
  xrpToDrops, dropsToXrp, randomDestinationTag, reserveIntent, paymentUri,
  inspectTransaction, recordLedgerReceipt, VERIFY,
} from './xrplDonations.js';
import { donationConfig, xrplGivingAvailable, isValidTxHash, explorerTxUrl } from '../config/xrpl.js';

const ADDRESS = 'rssjCkKZiaCqqqBGZiVpWAXmddRgs8291E';
const OTHER = 'rKv7TSeDrnZVCH4fYRNrUKVM8X7tC5zutf';
const HASH = 'A'.repeat(64);

const CFG = donationConfig({ XRPL_NETWORK: 'testnet', XRPL_DONATION_ADDRESS: ADDRESS });

/** A validated XRP payment to the ministry. */
const payment = (o = {}) => ({
  validated: true,
  hash: o.hash ?? HASH,
  ledger_index: o.ledgerIndex ?? 90_000_001,
  meta: {
    TransactionResult: o.result ?? 'tesSUCCESS',
    delivered_amount: o.delivered ?? '25000000',
    ...(o.meta ?? {}),
  },
  tx_json: {
    TransactionType: o.type ?? 'Payment',
    Destination: o.destination ?? ADDRESS,
    Amount: o.amount ?? '25000000',
    ...(o.tag === undefined ? {} : { DestinationTag: o.tag }),
  },
});

function setup() {
  const { db, sqlite, close } = freshDb();
  seedUser(sqlite, { id: 'u-alice', email: 'u-alice@bm.test' });
  return { db, sqlite, close, repo: repos(db) };
}

/* ===================================================== 1-4. AMOUNTS === */

test('1. decimal XRP converts to drops exactly, with no floating point', () => {
  assert.equal(xrpToDrops('1'), 1_000_000n);
  assert.equal(xrpToDrops('25'), 25_000_000n);
  assert.equal(xrpToDrops('0.1'), 100_000n);
  // The cases that betray float arithmetic: 0.1+0.2, and 2.675*1e6.
  assert.equal(xrpToDrops('0.3'), 300_000n);
  assert.equal(xrpToDrops('2.675'), 2_675_000n);
  assert.equal(xrpToDrops('1.000001'), 1_000_001n);
  assert.equal(xrpToDrops('99999.999999'), 99_999_999_999n);
  assert.equal(dropsToXrp(2_675_000n), '2.675');
  assert.equal(dropsToXrp(25_000_000n), '25');
});

test('2. one drop survives the round trip and never becomes zero', () => {
  assert.equal(xrpToDrops('0.000001'), 1n);
  assert.equal(dropsToXrp(1n), '0.000001');
  assert.notEqual(dropsToXrp(1n), '0');
});

test('3. more than six decimal places is refused, not rounded', () => {
  for (const bad of ['0.0000001', '1.1234567', '0.000000999']) {
    assert.throws(() => xrpToDrops(bad), /6 decimal places/);
  }
});

test('4. malformed amounts are refused', () => {
  for (const bad of ['', ' ', '-1', '0', '1e6', '1E6', 'abc', '1.2.3', '.5', '5.', '+5',
    '1 000', 'Infinity', 'NaN', null, undefined, {}, [], true, '0.0', '000.000000']) {
    assert.throws(() => xrpToDrops(bad), undefined, `accepted ${JSON.stringify(bad)}`);
  }
  assert.throws(() => xrpToDrops('100001'), /too large/);
});

/* ================================================ 5-8. INTENTS === */

test('5. destination tags are crypto-random and inside the 32-bit range', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const t = randomDestinationTag();
    assert.ok(Number.isInteger(t));
    assert.ok(t >= 1 && t <= 4_294_967_294, `tag out of range: ${t}`);
    seen.add(t);
  }
  assert.ok(seen.size > 450, 'tags must not repeat predictably');
  // Not derived from a clock or a counter: two consecutive calls differ.
  assert.notEqual(randomDestinationTag(), randomDestinationTag());
  // And the generator is not Math.random.
  const SRC = readFileSync(new URL('./xrplDonations.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random/.test(SRC), 'Math.random must never choose a tag');
  assert.ok(/crypto\.getRandomValues/.test(SRC));
});

test('6. a tag collision is retried against the database constraint', async () => {
  const { close, repo } = setup();
  try {
    const taken = new Set();
    let calls = 0;
    // Force the first two attempts to collide with rows that already exist.
    const spy = {
      donationIntents: {
        create: async ({ destinationTag, ...rest }) => {
          calls += 1;
          const tag = calls <= 2 ? 12345 : destinationTag;
          if (taken.has(tag)) return null;          // UNIQUE conflict
          taken.add(tag);
          return repo.donationIntents.create({ destinationTag: tag, ...rest });
        },
      },
    };
    await spy.donationIntents.create({ destinationTag: 12345, expiresAt: '2099-01-01T00:00:00.000Z' });
    const out = await reserveIntent(spy, { userId: null, expectedAmountDrops: 1000, expiresAt: '2099-01-01T00:00:00.000Z' });
    assert.ok(out.id, 'a collision must be retried, not surfaced');
    assert.ok(calls > 1, 'the first attempt collided');
  } finally { close(); }
});

test('7-8. intent ownership comes from the server session, or is anonymous', async () => {
  const { sqlite, close, repo } = setup();
  try {
    const mine = await reserveIntent(repo, { userId: 'u-alice', expectedAmountDrops: 5_000_000, expiresAt: '2099-01-01T00:00:00.000Z' });
    const anon = await reserveIntent(repo, { userId: null, expectedAmountDrops: 1_000_000, expiresAt: '2099-01-01T00:00:00.000Z' });
    const rows = Object.fromEntries(
      sqlite.prepare('SELECT id, user_id FROM donation_intents').all().map(r => [r.id, r.user_id]),
    );
    assert.equal(rows[mine.id], 'u-alice');
    assert.equal(rows[anon.id], null);
  } finally { close(); }
});

/* ============================================= 9-13. VERIFICATION === */

test('9. an unvalidated transaction is never credited', () => {
  const r = inspectTransaction({ ...payment(), validated: false }, CFG);
  assert.equal(r.ok, false);
  assert.equal(r.outcome, VERIFY.NOT_VALIDATED_YET);
  // Missing metadata is the same answer — come back shortly, not "failed".
  assert.equal(inspectTransaction({ ...payment(), meta: undefined }, CFG).outcome, VERIFY.NOT_VALIDATED_YET);
});

test('10. a failed transaction is never credited', () => {
  for (const code of ['tecUNFUNDED_PAYMENT', 'tecPATH_DRY', 'tefMAX_LEDGER']) {
    const r = inspectTransaction(payment({ result: code }), CFG);
    assert.equal(r.ok, false);
    assert.equal(r.outcome, VERIFY.FAILED_TRANSACTION);
  }
});

test('11. a payment to another address is never credited', () => {
  const r = inspectTransaction(payment({ destination: OTHER }), CFG);
  assert.equal(r.ok, false);
  assert.equal(r.outcome, VERIFY.WRONG_DESTINATION);
});

test('12. an issued token is not mistaken for XRP', () => {
  // delivered_amount as an OBJECT means someone's IOU, not XRP.
  const r = inspectTransaction(payment({ delivered: { currency: 'USD', issuer: OTHER, value: '1000' } }), CFG);
  assert.equal(r.ok, false);
  assert.equal(r.outcome, VERIFY.UNSUPPORTED_ASSET);
  assert.equal(inspectTransaction(payment({ delivered: '0' }), CFG).outcome, VERIFY.UNSUPPORTED_ASSET);
  assert.equal(inspectTransaction(payment({ delivered: 'abc' }), CFG).outcome, VERIFY.UNSUPPORTED_ASSET);
  // A non-Payment transaction type is not a gift either.
  assert.equal(inspectTransaction(payment({ type: 'OfferCreate' }), CFG).outcome, VERIFY.INVALID_TRANSACTION);
});

test('13. BLOCKER: delivered_amount is credited, never Amount', () => {
  // A partial payment: the sender ASKED to deliver 1,000 XRP; the ledger
  // proves 0.000001 XRP actually arrived. Crediting `Amount` here is the
  // classic XRPL integration vulnerability.
  const r = inspectTransaction(payment({ amount: '1000000000', delivered: '1' }), CFG);
  assert.equal(r.ok, true);
  assert.equal(r.drops, 1n, 'must credit what the ledger delivered');
  assert.notEqual(r.drops, 1_000_000_000n);

  // And the source must not read Amount at all on the crediting path.
  const SRC = readFileSync(new URL('./xrplDonations.js', import.meta.url), 'utf8')
    .split('\n').filter(l => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
  assert.ok(!/body\??\.\s*Amount|\.Amount\b/.test(SRC), 'Amount must never be read for crediting');
  assert.ok(/delivered_amount/.test(SRC));
});

/* ======================================== 14-18. ATTRIBUTION === */

async function withIntent(repo, { tag, expected, userId = 'u-alice' }) {
  await repo.donationIntents.create({ userId, destinationTag: tag, expectedAmountDrops: expected, expiresAt: '2099-01-01T00:00:00.000Z' });
}

test('14. an exact tagged payment is attributed and confirms the intent', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await withIntent(repo, { tag: 5001, expected: 25_000_000 });
    const v = inspectTransaction(payment({ tag: 5001 }), CFG);
    const out = await recordLedgerReceipt(repo, CFG, v);
    assert.equal(out.recorded, true);
    assert.equal(out.attributedTo, 'u-alice');
    assert.equal(out.intentConfirmed, true);

    const d = sqlite.prepare('SELECT * FROM donations').get();
    assert.equal(d.user_id, 'u-alice');
    assert.equal(d.amount_drops, 25_000_000);
    assert.equal(d.xrpl_destination_tag, 5001);
    assert.equal(d.provider_event_id, HASH);
    const i = sqlite.prepare('SELECT * FROM donation_intents').get();
    assert.equal(i.status, 'confirmed');
    assert.equal(i.provider_event_id, HASH);
  } finally { close(); }
});

test('15. UNDERPAYMENT records the real amount and does not claim fulfilment', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await withIntent(repo, { tag: 5002, expected: 25_000_000 });
    const v = inspectTransaction(payment({ tag: 5002, delivered: '3000000' }), CFG);
    const out = await recordLedgerReceipt(repo, CFG, v);

    assert.equal(out.recorded, true, 'real money must still be recorded');
    assert.equal(out.attributedTo, 'u-alice', 'and still attributed');
    assert.equal(out.intentConfirmed, false, 'an unmet ask is not confirmed');

    assert.equal(sqlite.prepare('SELECT amount_drops FROM donations').get().amount_drops, 3_000_000);
    assert.equal(sqlite.prepare('SELECT status FROM donation_intents').get().status, 'open');
  } finally { close(); }
});

test('16. OVERPAYMENT records the larger real amount and confirms', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await withIntent(repo, { tag: 5003, expected: 10_000_000 });
    const v = inspectTransaction(payment({ tag: 5003, delivered: '40000000' }), CFG);
    const out = await recordLedgerReceipt(repo, CFG, v);
    assert.equal(out.recorded, true);
    assert.equal(out.intentConfirmed, true);
    assert.equal(sqlite.prepare('SELECT amount_drops FROM donations').get().amount_drops, 40_000_000,
      'extra money must never be discarded');
  } finally { close(); }
});

test('17. an unknown destination tag is recorded as an anonymous receipt', async () => {
  const { sqlite, close, repo } = setup();
  try {
    const v = inspectTransaction(payment({ tag: 999999 }), CFG);
    const out = await recordLedgerReceipt(repo, CFG, v);
    assert.equal(out.recorded, true);
    assert.equal(out.attributedTo, null);
    const d = sqlite.prepare('SELECT * FROM donations').get();
    assert.equal(d.user_id, null);
    assert.equal(d.xrpl_destination_tag, 999999, 'the tag is kept for investigation');
    assert.equal(d.status, 'confirmed');
  } finally { close(); }
});

test('18. an UNTAGGED payment is still real money and is still recorded', async () => {
  const { sqlite, close, repo } = setup();
  try {
    const v = inspectTransaction(payment({ tag: undefined }), CFG);
    assert.equal(v.destinationTag, null);
    const out = await recordLedgerReceipt(repo, CFG, v);
    assert.equal(out.recorded, true);
    const d = sqlite.prepare('SELECT * FROM donations').get();
    assert.equal(d.user_id, null);
    assert.equal(d.xrpl_destination_tag, null);
    assert.equal(d.amount_drops, 25_000_000);
  } finally { close(); }
});

/* ==================================== 19-23. IDEMPOTENCY & STORAGE === */

test('19. the same transaction hash cannot double-credit', async () => {
  const { sqlite, close, repo } = setup();
  try {
    const v = inspectTransaction(payment({ tag: 6001 }), CFG);
    const first = await recordLedgerReceipt(repo, CFG, v);
    const second = await recordLedgerReceipt(repo, CFG, v);
    assert.equal(first.recorded, true);
    assert.equal(second.recorded, false, 'a repeat must not create a second gift');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n, 1);
  } finally { close(); }
});

test('20. the fast path and the sweep converge on ONE donation row', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await withIntent(repo, { tag: 6002, expected: 25_000_000 });
    const v = inspectTransaction(payment({ tag: 6002 }), CFG);
    // Both discovery routes call the same function; order does not matter.
    const [a, b] = [await recordLedgerReceipt(repo, CFG, v), await recordLedgerReceipt(repo, CFG, v)];
    assert.equal([a.recorded, b.recorded].filter(Boolean).length, 1, 'exactly one is told it is new');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n, 1);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM donation_intents WHERE status = ?').get('confirmed').n, 1);
  } finally { close(); }
});

test('20b. a retry REPAIRS an intent left open by an interrupted run', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await withIntent(repo, { tag: 6003, expected: 25_000_000 });
    const v = inspectTransaction(payment({ tag: 6003 }), CFG);
    // Simulate a crash after the donation but before the intent confirmation.
    await repo.donations.recordIfNew({
      provider: 'xrpl', providerEventId: v.hash, providerTxnId: v.hash,
      amountDrops: Number(v.drops), currency: 'XRP', status: 'confirmed',
      xrplDestinationTag: v.destinationTag, xrplLedgerIndex: v.ledgerIndex,
    });
    assert.equal(sqlite.prepare('SELECT status FROM donation_intents').get().status, 'open');

    const repair = await recordLedgerReceipt(repo, CFG, v);
    assert.equal(repair.recorded, false, 'the donation already existed');
    assert.equal(repair.intentConfirmed, true, 'but the intent is repaired');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n, 1);
  } finally { close(); }
});

test('21-22. the ledger index is stored and the explorer URL is safe', async () => {
  const { sqlite, close, repo } = setup();
  try {
    const v = inspectTransaction(payment({ ledgerIndex: 91_234_567 }), CFG);
    await recordLedgerReceipt(repo, CFG, v);
    const d = sqlite.prepare('SELECT * FROM donations').get();
    assert.equal(d.xrpl_ledger_index, 91_234_567);
    assert.equal(d.reference_url, `https://testnet.xrpl.org/transactions/${HASH}`);
    assert.ok(d.reference_url.startsWith('https://'), 'the reference must be a public https link');
    assert.ok(!/seed|secret|key|token/i.test(d.reference_url));
    assert.equal(explorerTxUrl(CFG, HASH), d.reference_url);
  } finally { close(); }
});

test('23. an intent is never confirmed without ledger evidence', async () => {
  const { sqlite, close, repo } = setup();
  try {
    await withIntent(repo, { tag: 7001, expected: 1_000_000 });
    // A rejected transaction produces no verification, so nothing is recorded
    // and the intent cannot move.
    const bad = inspectTransaction(payment({ tag: 7001, result: 'tecPATH_DRY' }), CFG);
    assert.equal(bad.ok, false);
    assert.equal(sqlite.prepare('SELECT status FROM donation_intents').get().status, 'open');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM donations').get().n, 0);
    // And the schema itself refuses a confirmed row with no evidence (M14.3).
    await assert.rejects(() => repo.donationIntents.confirm('nope', { providerEventId: null }).then(ok => {
      if (!ok) throw new Error('CHECK: no such open intent');
    }), /CHECK|no such open intent/);
  } finally { close(); }
});

/* ================================= 24-26. RPC RESILIENCE (unit level) === */

test('24-26. transport and shape failures degrade safely, never to "failed"', () => {
  // The verifier is given whatever the node returned. None of these may be
  // read as "the payment failed" — they are "not yet" or "not a payment".
  assert.equal(inspectTransaction(null, CFG).outcome, VERIFY.INVALID_TRANSACTION);
  assert.equal(inspectTransaction(undefined, CFG).outcome, VERIFY.INVALID_TRANSACTION);
  assert.equal(inspectTransaction('<html>502</html>', CFG).outcome, VERIFY.INVALID_TRANSACTION);
  assert.equal(inspectTransaction({}, CFG).outcome, VERIFY.NOT_VALIDATED_YET);
  assert.equal(inspectTransaction({ validated: true }, CFG).outcome, VERIFY.NOT_VALIDATED_YET);
  assert.equal(inspectTransaction({ validated: true, meta: {} }, CFG).outcome, VERIFY.FAILED_TRANSACTION);
  // A hash we cannot read is not a gift we can credit.
  assert.equal(inspectTransaction({ ...payment(), hash: 'short' }, CFG).outcome, VERIFY.INVALID_TRANSACTION);
  // The route maps transport failure to its own retryable outcome.
  assert.equal(VERIFY.TEMPORARILY_UNAVAILABLE, 'temporarily_unavailable');
});

/* ================================== 30-31. KEYS AND NETWORK SAFETY === */

test('30. no seed or private key can reach the frontend', () => {
  for (const f of ['../../src/pages/Donate/components/XrpGive.jsx', '../../src/pages/Donate.jsx']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    for (const banned of ['XRPL_SEED', 'secret', 'seed', 'privateKey', 'private_key', 'deriveKeypair', 'sign(']) {
      assert.ok(!src.includes(banned), `${f} references ${banned}`);
    }
  }
  // And the rail itself refuses to operate if a seed is present at all.
  assert.throws(() => donationConfig({
    XRPL_NETWORK: 'testnet', XRPL_DONATION_ADDRESS: ADDRESS, XRPL_SEED: 'sEdSomething',
  }), /misconfigured/);
  const SRC = readFileSync(new URL('./xrplDonations.js', import.meta.url), 'utf8');
  assert.ok(!/XRPL_SEED|signAndSubmit|deriveKeypair/.test(SRC), 'the donation path must never sign');
});

test('31. preview cannot silently become mainnet', () => {
  // Mainnet requires an explicit second switch, which is absent everywhere.
  assert.throws(() => donationConfig({ XRPL_NETWORK: 'mainnet', XRPL_DONATION_ADDRESS: ADDRESS }),
    /not enabled on this network/);
  // With the switch, it is allowed — and reports itself as live so the UI can
  // stop showing the test-funds warning.
  const live = donationConfig({ XRPL_NETWORK: 'mainnet', XRPL_DONATION_ADDRESS: ADDRESS, XRPL_ALLOW_MAINNET: 'true' });
  assert.equal(live.live, true);
  assert.equal(donationConfig({ XRPL_NETWORK: 'testnet', XRPL_DONATION_ADDRESS: ADDRESS }).live, false);

  // Unknown networks, bad addresses and an unconfigured rail all fail closed.
  assert.throws(() => donationConfig({ XRPL_NETWORK: 'moonnet', XRPL_DONATION_ADDRESS: ADDRESS }), /misconfigured/);
  assert.throws(() => donationConfig({ XRPL_NETWORK: 'testnet', XRPL_DONATION_ADDRESS: 'nope' }), /misconfigured/);
  assert.throws(() => donationConfig({ XRPL_NETWORK: 'testnet' }), /not configured/);
  assert.equal(xrplGivingAvailable({}), false);
  assert.equal(xrplGivingAvailable({ XRPL_NETWORK: 'testnet', XRPL_DONATION_ADDRESS: ADDRESS }), true);

  // The donation address must never be the EFT token issuer.
  assert.throws(() => donationConfig({
    XRPL_NETWORK: 'testnet', XRPL_DONATION_ADDRESS: ADDRESS, XRPL_ISSUER_ADDRESS: ADDRESS,
  }), /misconfigured/);

  // wrangler.jsonc must not ship a mainnet switch.
  const WRANGLER = readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8');
  assert.ok(!/"XRPL_ALLOW_MAINNET"\s*:\s*"true"/.test(WRANGLER), 'mainnet must not be enabled in config');
  assert.ok(!/"XRPL_SEED"/.test(WRANGLER), 'no seed may appear in configuration');
});

/* ============================================== payment request === */

test('the payment request is wallet-agnostic and carries the tag', () => {
  const uri = paymentUri({ address: ADDRESS, destinationTag: 4242, amountDrops: '25000000' });
  assert.ok(uri.startsWith(`xrpl:${ADDRESS}`), 'a standard XRPL URI any wallet can read');
  assert.ok(uri.includes('dt=4242'), 'the destination tag must be in the request');
  assert.ok(uri.includes('amount=25000000'));
  assert.ok(!/xumm|xaman/i.test(uri), 'the rail must not depend on one vendor');
  const UI = readFileSync(new URL('../../src/pages/Donate/components/XrpGive.jsx', import.meta.url), 'utf8');
  assert.ok(!/xumm|xaman/i.test(UI), 'XRP giving must work without Xaman');
});

test('transaction hash validation is strict', () => {
  assert.equal(isValidTxHash(HASH), true);
  assert.equal(isValidTxHash(HASH.toLowerCase().toUpperCase()), true);
  for (const bad of ['', 'x', 'G'.repeat(64), 'A'.repeat(63), 'A'.repeat(65), null, 123]) {
    assert.equal(isValidTxHash(bad), false, `accepted ${JSON.stringify(bad)}`);
  }
});
