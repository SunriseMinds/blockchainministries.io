/**
 * XRPL service layer — FRAMEWORK ONLY.
 *
 * Production wallet logic has deliberately NOT been moved here. This module
 * provides read-only helpers plus a clearly-marked seam where signing will
 * live once the owner approves it.
 *
 * Hard rules (see docs/MIGRATION_RISK_REGISTER.md R-11):
 *   1. A signing seed exists ONLY as the Worker secret XRPL_SEED. It is never
 *      in the repo, never in frontend code, never logged, never returned.
 *   2. Signing happens only server-side, inside a Worker.
 *   3. Minting must be idempotent. The caller performs the D1 status
 *      transition FIRST (pending -> approved changes 0 rows on a retry) and
 *      only mints when that transition actually occurred.
 */
import { HttpError } from './http.js';

/** Public, non-secret configuration. */
export function config(ctx) {
  return {
    network: ctx.env.XRPL_NETWORK || 'mainnet',
    issuer: ctx.env.XRPL_ISSUER_ADDRESS || null,
    explorer: ctx.env.XRPL_EXPLORER || 'https://livenet.xrpl.org',
    currency: 'EFT',
  };
}

const RPC = {
  mainnet: 'https://xrplcluster.com',
  testnet: 'https://s.altnet.rippletest.net:51234',
};

function rpcUrl(ctx) {
  const { network } = config(ctx);
  return ctx.env.XRPL_RPC_URL || RPC[network] || RPC.mainnet;
}

/** Minimal JSON-RPC call. Read-only methods only. */
async function rpc(ctx, method, params = {}) {
  const res = await fetch(rpcUrl(ctx), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params: [params] }),
  });
  if (!res.ok) throw new HttpError(502, 'xrpl_error', 'XRPL node error');
  const data = await res.json();
  if (data?.result?.error) {
    throw new HttpError(502, 'xrpl_error', data.result.error_message || data.result.error);
  }
  return data.result;
}

/** Basic address sanity check (not a checksum validation). */
export function isValidAddress(address) {
  return typeof address === 'string' && /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address);
}

/** Account info — read-only, safe. */
export function getAccountInfo(ctx, account) {
  if (!isValidAddress(account)) throw new HttpError(400, 'bad_request', 'Invalid XRPL address');
  return rpc(ctx, 'account_info', { account, ledger_index: 'validated' });
}

/** Trustlines for an account — used to confirm an EFT trustline exists. */
export async function getTrustlines(ctx, account) {
  if (!isValidAddress(account)) throw new HttpError(400, 'bad_request', 'Invalid XRPL address');
  const result = await rpc(ctx, 'account_lines', { account, ledger_index: 'validated' });
  return result?.lines ?? [];
}

/** True when `account` holds a trustline to the configured EFT issuer. */
export async function hasEftTrustline(ctx, account) {
  const { issuer, currency } = config(ctx);
  if (!issuer) return false;
  const lines = await getTrustlines(ctx, account);
  return lines.some((l) => l.account === issuer && (l.currency === currency || l.currency?.startsWith(currency)));
}

/** Deep-link a wallet (Xaman/XUMM) to add the EFT trustline. Client-safe. */
export function trustlineUrl(ctx) {
  const { issuer, currency } = config(ctx);
  if (!issuer) return null;
  return `https://xrpl.services/?issuer=${encodeURIComponent(issuer)}&currency=${encodeURIComponent(currency)}&limit=1000000000`;
}

export function explorerTxUrl(ctx, txHash) {
  return `${config(ctx).explorer}/transactions/${encodeURIComponent(txHash)}`;
}

/* ------------------------------------------------------ signing (DISABLED) -- */
/**
 * Placeholder for credential/NFT minting on approval.
 *
 * NOT IMPLEMENTED ON PURPOSE. Enabling it requires owner approval plus:
 *   - an XRPL transaction signing library that runs in Workers (the `xrpl`
 *     npm package assumes Node APIs and is not Worker-compatible as-is;
 *     a Worker-safe signer must be selected — OPEN DECISION),
 *   - the XRPL_SEED Worker secret,
 *   - testnet validation before any mainnet transaction,
 *   - the idempotency guarantee described at the top of this file.
 *
 * @throws {HttpError} always, until Phase 2D enables it
 */
export async function mintCredentialNft() {
  throw new HttpError(
    501,
    'not_implemented',
    'XRPL minting is not enabled. Production wallet logic has not been migrated.',
  );
}

/** Whether signing could even be attempted (does not reveal the secret). */
export function signingAvailable(ctx) {
  return Boolean(ctx.env.XRPL_SEED) && ctx.env.XRPL_SIGNING_ENABLED === 'true';
}
