/**
 * M14.4 — the XRP donation rail's own configuration and safety gates.
 *
 * SEPARATE FROM THE TOKEN. `packages/xrpl`'s `config()` describes the EFT
 * issuer and defaults its network to 'mainnet'. Neither is appropriate here:
 * the ministry has ratified a DEDICATED donation address, distinct from the
 * issuer, and M14.4 is testnet-only. So the donation rail reads its own
 * variables and refuses to start on assumptions.
 *
 * RECEIVE-ONLY. Accepting XRP requires a public address and nothing else.
 * There is no seed, no key, no signing anywhere in this path — and
 * `donationConfig()` refuses outright if a signing seed is even present
 * alongside the donation address, so the two can never be quietly conflated.
 */
import { HttpError } from '@reellink/core/http.js';

/** Networks this rail will operate on, and whether each is real money. */
const NETWORKS = Object.freeze({
  testnet: { rpc: 'https://s.altnet.rippletest.net:51234', explorer: 'https://testnet.xrpl.org', live: false },
  devnet: { rpc: 'https://s.devnet.rippletest.net:51234', explorer: 'https://devnet.xrpl.org', live: false },
  mainnet: { rpc: 'https://xrplcluster.com', explorer: 'https://livenet.xrpl.org', live: true },
});

/** One XRP. Kept as BigInt so no conversion ever touches a float. */
export const DROPS_PER_XRP = 1_000_000n;

/** Giving bounds, in drops. */
export const XRP_MIN_DROPS = 1n;                 // one drop is a real gift
export const XRP_MAX_DROPS = 100_000_000_000n;   // 100,000 XRP
export const INTENT_TTL_MS = 24 * 60 * 60 * 1000;

/** Address shape check, same rule `packages/xrpl` already applies. */
export const isValidAddress = (a) => typeof a === 'string' && /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a);

/** A 64-character uppercase hex XRPL transaction hash. */
export const TX_HASH_PATTERN = /^[0-9A-F]{64}$/;
export const isValidTxHash = (h) => typeof h === 'string' && TX_HASH_PATTERN.test(h.toUpperCase());

/**
 * Is the XRP rail configured at all? Never throws — the Donate page asks this
 * to decide whether to offer XRP, exactly as it asks whether Stripe tiers are
 * configured.
 */
export function xrplGivingAvailable(env) {
  try {
    donationConfig(env);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve and VALIDATE the donation rail's configuration.
 *
 * Fails closed on every axis that could cost someone real money:
 *
 *   - no XRPL_DONATION_ADDRESS            -> the rail is simply off
 *   - malformed address                   -> refuse rather than publish a
 *                                            destination nobody controls
 *   - unknown network name                -> refuse
 *   - mainnet without XRPL_ALLOW_MAINNET  -> refuse. M14.4 is testnet-only and
 *                                            the default must never silently
 *                                            become real money. `packages/xrpl`
 *                                            defaults its network to mainnet;
 *                                            this rail deliberately does not.
 *   - donation address == EFT issuer      -> refuse. Ratified: donations use a
 *                                            SEPARATE address from the token
 *                                            issuer, for accounting and
 *                                            reconciliation separation.
 *   - a signing seed present              -> refuse. Receiving needs no key;
 *                                            if one is configured here it is a
 *                                            misconfiguration, not a feature.
 */
export function donationConfig(env) {
  const address = env?.XRPL_DONATION_ADDRESS;
  if (!address) throw new HttpError(503, 'unavailable', 'XRP giving is not configured');
  if (!isValidAddress(address)) throw new HttpError(503, 'unavailable', 'XRP giving is misconfigured');

  const name = String(env.XRPL_NETWORK || 'testnet').toLowerCase();
  const net = NETWORKS[name];
  if (!net) throw new HttpError(503, 'unavailable', 'XRP giving is misconfigured');

  if (net.live && env.XRPL_ALLOW_MAINNET !== 'true') {
    throw new HttpError(503, 'unavailable', 'XRP giving is not enabled on this network');
  }
  if (env.XRPL_ISSUER_ADDRESS && env.XRPL_ISSUER_ADDRESS === address) {
    throw new HttpError(503, 'unavailable', 'XRP giving is misconfigured');
  }
  if (env.XRPL_SEED) {
    // Receiving is read-only. A seed on this path can only be a mistake.
    throw new HttpError(503, 'unavailable', 'XRP giving is misconfigured');
  }

  return {
    address,
    network: name,
    live: net.live,
    rpcUrl: env.XRPL_RPC_URL || net.rpc,
    explorer: env.XRPL_EXPLORER || net.explorer,
  };
}

/** Public, donor-safe explorer link for a transaction. */
export const explorerTxUrl = (cfg, hash) =>
  `${cfg.explorer}/transactions/${encodeURIComponent(String(hash).toUpperCase())}`;
