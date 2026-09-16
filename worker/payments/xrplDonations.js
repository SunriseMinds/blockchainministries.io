/**
 * M14.4 — the XRP donation rail.
 *
 * THE CENTRAL RULE: the validated XRP Ledger is the only authority. A donor
 * returning to the site proves nothing; a browser-supplied amount proves
 * nothing. Every figure this module credits is read back from a validated
 * ledger transaction.
 *
 * Nothing here signs anything or touches a key. Receiving XRP needs a public
 * address and read-only RPC, and that is all this uses.
 */
import { badRequest, HttpError } from '@reellink/core/http.js';
import { DROPS_PER_XRP, XRP_MIN_DROPS, XRP_MAX_DROPS, isValidTxHash } from '../config/xrpl.js';

/* ------------------------------------------------------------- amounts -- */

/**
 * Decimal XRP -> integer drops, with NO floating-point arithmetic anywhere.
 *
 * `0.1 + 0.2 !== 0.3`, and `2.675 * 1e6` is 2674999.9999999995. Money cannot
 * be converted that way, so the string is split on the decimal point and the
 * fractional part is padded to exactly six digits — the ledger's own
 * precision — then both halves are combined with BigInt.
 *
 * Deliberately strict about FORM as well as value: scientific notation, a
 * bare ".5", "5." , internal spaces, "+5", NaN and Infinity are all refused
 * rather than guessed at.
 *
 * @param {string|number} input
 * @returns {bigint} drops
 */
export function xrpToDrops(input) {
  if (typeof input === 'bigint') return input;
  const raw = typeof input === 'number' ? String(input) : input;
  if (typeof raw !== 'string') throw badRequest('Invalid XRP amount');

  const s = raw.trim();
  // Optional leading digits, optional fraction — no sign, no exponent.
  if (!/^\d+(\.\d+)?$/.test(s)) throw badRequest('Invalid XRP amount');

  const [whole, frac = ''] = s.split('.');
  if (frac.length > 6) throw badRequest('XRP amounts support at most 6 decimal places');

  const drops = BigInt(whole) * DROPS_PER_XRP + BigInt(frac.padEnd(6, '0') || '0');
  if (drops < XRP_MIN_DROPS) throw badRequest('XRP amount must be greater than zero');
  if (drops > XRP_MAX_DROPS) throw badRequest('XRP amount is too large');
  return drops;
}

/** Integer drops -> a display string, trimmed but never rounded to zero. */
export function dropsToXrp(drops) {
  const d = BigInt(drops);
  const whole = d / DROPS_PER_XRP;
  const frac = (d % DROPS_PER_XRP).toString().padStart(6, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/* -------------------------------------------------------- destination tag -- */

/**
 * A destination tag is a 32-bit UNSIGNED integer. 0 is legal but is also what
 * a wallet sends when it means "no tag", so it is avoided; the top value is
 * avoided as a conventional sentinel. Everything in between is fair game.
 */
const TAG_MIN = 1;
const TAG_MAX = 4_294_967_294;

/** Crypto-random, never derived from a user id, a counter or a clock. */
export function randomDestinationTag() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return TAG_MIN + (buf[0] % (TAG_MAX - TAG_MIN + 1));
}

/**
 * Reserve a tag, retrying on collision.
 *
 * The DATABASE is the authority: `destination_tag` is UNIQUE, and
 * `create()` returns null when the insert conflicts. Checking first and
 * inserting second would race; this lets the constraint decide and simply
 * tries again.
 */
export async function reserveIntent(repo, { userId, expectedAmountDrops, expiresAt, attempts = 5 }) {
  for (let i = 0; i < attempts; i++) {
    const destinationTag = randomDestinationTag();
    const id = await repo.donationIntents.create({
      userId, destinationTag, expectedAmountDrops, expiresAt,
    });
    if (id) return { id, destinationTag };
  }
  throw new HttpError(503, 'unavailable', 'Could not allocate a destination tag, please retry');
}

/* ------------------------------------------------------- payment request -- */

/**
 * A standard XRPL payment URI. Any compatible wallet — Xaman among them, but
 * by no means only Xaman — can read this, which is why the rail does not
 * depend on any single vendor.
 */
export function paymentUri({ address, destinationTag, amountDrops }) {
  return `xrpl:${address}?dt=${destinationTag}&amount=${amountDrops}`;
}

/* ------------------------------------------------------------ verification -- */

/** Outcomes the caller may safely show a donor. No RPC internals escape. */
export const VERIFY = Object.freeze({
  CONFIRMED: 'confirmed',
  ALREADY_RECORDED: 'already_recorded',
  NOT_VALIDATED_YET: 'not_validated_yet',
  WRONG_DESTINATION: 'wrong_destination',
  FAILED_TRANSACTION: 'failed_transaction',
  UNSUPPORTED_ASSET: 'unsupported_asset',
  INVALID_TRANSACTION: 'invalid_transaction',
  TEMPORARILY_UNAVAILABLE: 'temporarily_unavailable',
});

/**
 * THE authoritative check. Both the donor-submitted hash and the scheduled
 * `account_tx` sweep go through this one function, so neither can credit
 * something the other would reject.
 *
 * @param {object} tx   a raw `tx`/`account_tx` entry, already fetched
 * @param {object} cfg  donationConfig()
 * @returns {{ok:true, drops:bigint, hash:string, ledgerIndex:number, destinationTag:number|null}
 *          |{ok:false, outcome:string}}
 */
export function inspectTransaction(tx, cfg) {
  if (!tx || typeof tx !== 'object') return { ok: false, outcome: VERIFY.INVALID_TRANSACTION };

  // account_tx nests the transaction under `tx`/`tx_json`; `tx` returns it flat.
  const body = tx.tx_json ?? tx.tx ?? tx;
  const meta = tx.meta ?? tx.metaData ?? body?.meta;

  // A ledger that has not reached consensus proves nothing yet. This is a
  // "come back shortly", never a failure.
  if (tx.validated !== true) return { ok: false, outcome: VERIFY.NOT_VALIDATED_YET };
  if (!meta || typeof meta !== 'object') return { ok: false, outcome: VERIFY.NOT_VALIDATED_YET };
  if (meta.TransactionResult !== 'tesSUCCESS') return { ok: false, outcome: VERIFY.FAILED_TRANSACTION };
  if (body?.TransactionType !== 'Payment') return { ok: false, outcome: VERIFY.INVALID_TRANSACTION };
  if (body?.Destination !== cfg.address) return { ok: false, outcome: VERIFY.WRONG_DESTINATION };

  // PARTIAL PAYMENT DEFENCE. `Amount` is what the sender ASKED to deliver;
  // with tfPartialPayment set, far less can actually arrive. Crediting
  // `Amount` is the classic XRPL integration vulnerability, so it is never
  // read here. `delivered_amount` is what the ledger proves was received.
  const delivered = meta.delivered_amount ?? meta.DeliveredAmount;
  // A plain string means drops of XRP. An object means an ISSUED TOKEN —
  // someone's IOU, not XRP, and worth nothing to this rail.
  if (typeof delivered !== 'string') return { ok: false, outcome: VERIFY.UNSUPPORTED_ASSET };
  if (!/^\d+$/.test(delivered)) return { ok: false, outcome: VERIFY.UNSUPPORTED_ASSET };

  const drops = BigInt(delivered);
  if (drops <= 0n) return { ok: false, outcome: VERIFY.UNSUPPORTED_ASSET };

  const hash = String(tx.hash ?? body?.hash ?? '').toUpperCase();
  if (!isValidTxHash(hash)) return { ok: false, outcome: VERIFY.INVALID_TRANSACTION };

  const ledgerIndex = Number(tx.ledger_index ?? body?.ledger_index ?? tx.ledger_index_max);
  const rawTag = body?.DestinationTag;
  const destinationTag = Number.isInteger(rawTag) ? rawTag : null;

  return {
    ok: true,
    drops,
    hash,
    ledgerIndex: Number.isFinite(ledgerIndex) ? ledgerIndex : null,
    destinationTag,
  };
}

/* ------------------------------------------------------------ persistence -- */

/**
 * Record one verified ledger receipt, converging with whatever else may have
 * seen it.
 *
 * IDEMPOTENCY is the transaction hash, stored as `provider_event_id` (UNIQUE).
 * The fast path and the cron sweep both land here, so if both discover the
 * same payment exactly one row exists and only one of them is told it is new.
 *
 * ORDERING, and why it is safe without a multi-statement transaction:
 *   1. insert the donation — the money is the fact that matters, and the
 *      UNIQUE hash makes this the single point of truth;
 *   2. only then confirm the intent.
 *
 * If step 2 never happens (a crash, an RPC death), the donation still stands
 * and the intent stays `open`. The next sweep re-reads the same transaction,
 * step 1 returns "already recorded", and step 2 is retried — so a retry
 * REPAIRS the state rather than duplicating it. The reverse order could
 * confirm an intent with no donation behind it, which is the one arrangement
 * that would lie.
 *
 * @returns {{recorded:boolean, donationId:string|null, intentConfirmed:boolean, attributedTo:string|null}}
 */
export async function recordLedgerReceipt(repo, cfg, verified) {
  const { drops, hash, ledgerIndex, destinationTag } = verified;

  // Attribution comes from the SERVER-STORED intent, never from the
  // transaction or the browser. The destination tag is the only correlation.
  let intent = null;
  if (destinationTag !== null) {
    intent = await repo.donationIntents.byDestinationTag(destinationTag);
  }

  const donationId = await repo.donations.recordIfNew({
    userId: intent?.user_id ?? null,
    provider: 'xrpl',
    providerEventId: hash,
    providerTxnId: hash,
    amountDrops: Number(drops),
    currency: 'XRP',
    status: 'confirmed',
    referenceUrl: `${cfg.explorer}/transactions/${hash}`,
    xrplDestinationTag: destinationTag,
    xrplLedgerIndex: ledgerIndex,
  });

  // Confirm the intent whether or not THIS call inserted the row, so a repeat
  // pass repairs an intent left open by an interrupted earlier one.
  let intentConfirmed = false;
  if (intent && intent.status === 'open') {
    const expected = intent.expected_amount_drops;
    // UNDERPAYMENT is not fulfilment. The gift is recorded truthfully at what
    // actually arrived, but an intent for 10 XRP that received 3 is not
    // "confirmed" — it stays open and honest. Exact and over-payment both
    // fulfil the ask, and the donation row carries the real larger figure.
    if (expected === null || expected === undefined || Number(drops) >= Number(expected)) {
      intentConfirmed = await repo.donationIntents.confirm(intent.id, { providerEventId: hash });
    }
  }

  return {
    recorded: Boolean(donationId),
    donationId,
    intentConfirmed,
    attributedTo: intent?.user_id ?? null,
  };
}
