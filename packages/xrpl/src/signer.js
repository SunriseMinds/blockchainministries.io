/**
 * XRPL transaction signing for Cloudflare Workers.
 *
 * Uses the official Ripple libraries (ripple-keypairs / ripple-binary-codec /
 * ripple-address-codec), which are pure JavaScript and bundle into a Worker.
 * The full `xrpl` client package is deliberately NOT used: it assumes Node
 * networking and websockets. Submission here is plain JSON-RPC over fetch().
 *
 * HARD RULES
 *   1. The seed exists only as the Worker secret XRPL_SEED. It is never in the
 *      repo, never sent to the browser, never logged, never returned.
 *   2. Signing is gated by XRPL_SIGNING_ENABLED === 'true' AND a non-mainnet
 *      default, so nothing can touch mainnet by accident.
 *   3. Callers MUST perform the D1 status transition first (which changes 0
 *      rows on a retry) and only then sign, so a retry can never double-mint.
 */
import { deriveKeypair, deriveAddress, sign as signBlob } from 'ripple-keypairs';
import { encode, encodeForSigning } from 'ripple-binary-codec';
import { isValidClassicAddress } from 'ripple-address-codec';
import { HttpError } from '@reellink/core/http.js';

const RPC = {
  mainnet: 'https://xrplcluster.com',
  testnet: 'https://s.altnet.rippletest.net:51234',
  devnet: 'https://s.devnet.rippletest.net:51234',
};

export function network(env) {
  return (env.XRPL_NETWORK || 'testnet').toLowerCase();
}

export function rpcUrl(env) {
  return env.XRPL_RPC_URL || RPC[network(env)] || RPC.testnet;
}

/** Signing is off unless explicitly enabled AND a seed is present. */
export function signingEnabled(env) {
  return env.XRPL_SIGNING_ENABLED === 'true' && Boolean(env.XRPL_SEED);
}

function requireSigner(env) {
  if (!signingEnabled(env)) {
    throw new HttpError(503, 'xrpl_disabled',
      'XRPL signing is disabled. Set XRPL_SEED and XRPL_SIGNING_ENABLED=true.');
  }
  if (network(env) === 'mainnet' && env.XRPL_ALLOW_MAINNET !== 'true') {
    // Deliberate second gate: testnet validation must happen first.
    throw new HttpError(503, 'xrpl_mainnet_blocked',
      'Mainnet signing requires XRPL_ALLOW_MAINNET=true after testnet validation.');
  }
  const keypair = deriveKeypair(env.XRPL_SEED);
  return { keypair, address: deriveAddress(keypair.publicKey) };
}

/** JSON-RPC helper. */
async function rpc(env, method, params = {}) {
  const res = await fetch(rpcUrl(env), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params: [params] }),
  });
  if (!res.ok) throw new HttpError(502, 'xrpl_error', `XRPL node HTTP ${res.status}`);
  const data = await res.json();
  if (data?.result?.error) {
    throw new HttpError(502, 'xrpl_error', data.result.error_message || data.result.error);
  }
  return data.result;
}

/** The account this Worker signs as (derived, never the seed itself). */
export function signerAddress(env) {
  return requireSigner(env).address;
}

/** Current sequence + ledger for building a transaction. */
async function accountState(env, address) {
  const info = await rpc(env, 'account_info', { account: address, ledger_index: 'validated' });
  const ledger = await rpc(env, 'ledger', { ledger_index: 'validated' });
  return {
    sequence: info.account_data.Sequence,
    lastLedgerSequence: (ledger.ledger_index ?? ledger.ledger?.ledger_index ?? 0) + 20,
  };
}

/**
 * Sign and submit a transaction.
 * @param {object} env
 * @param {object} tx unsigned transaction (Account/Sequence/Fee auto-filled)
 * @returns {Promise<{hash:string, engine_result:string, validated:boolean}>}
 */
export async function signAndSubmit(env, tx) {
  const { keypair, address } = requireSigner(env);
  const { sequence, lastLedgerSequence } = await accountState(env, address);

  const prepared = {
    ...tx,
    Account: address,
    Sequence: tx.Sequence ?? sequence,
    Fee: tx.Fee ?? '12',
    LastLedgerSequence: tx.LastLedgerSequence ?? lastLedgerSequence,
    SigningPubKey: keypair.publicKey,
  };

  prepared.TxnSignature = signBlob(encodeForSigning(prepared), keypair.privateKey);
  const blob = encode(prepared);

  const result = await rpc(env, 'submit', { tx_blob: blob });
  return {
    hash: result.tx_json?.hash ?? null,
    engine_result: result.engine_result,
    engine_result_message: result.engine_result_message,
    // tesSUCCESS means accepted for processing, not yet finality.
    accepted: result.engine_result === 'tesSUCCESS',
    validated: false,
    network: network(env),
  };
}

/**
 * Mint an NFT (NFTokenMint, XLS-20). The URI is supplied by the application —
 * the platform has no opinion on what the token represents.
 *
 * IDEMPOTENCY IS THE CALLER'S RESPONSIBILITY: only call this after a D1 status
 * transition that changed exactly one row.
 *
 * @param {object} env
 * @param {{uri:string, taxon?:number, transferable?:boolean}} opts
 */
export async function mintNft(env, { uri, taxon = 0, transferable = false }) {
  if (!uri) throw new HttpError(400, 'bad_request', 'NFT uri is required');
  const hexUri = [...new TextEncoder().encode(uri)]
    .map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  if (hexUri.length > 512) throw new HttpError(400, 'bad_request', 'NFT uri too long');

  return signAndSubmit(env, {
    TransactionType: 'NFTokenMint',
    URI: hexUri,
    NFTokenTaxon: taxon,
    // Flag 8 = tfTransferable. Defaults to non-transferable.
    Flags: transferable ? 8 : 0,
  });
}

/** Verify a destination before any send. */
export function isValidAddress(address) {
  try {
    return isValidClassicAddress(address);
  } catch {
    return false;
  }
}

/** Read-only: confirm a transaction reached a validated ledger. */
export async function getTransaction(env, hash) {
  return rpc(env, 'tx', { transaction: hash, binary: false });
}

/** Read-only health check used by the validation script. */
export async function serverInfo(env) {
  const r = await rpc(env, 'server_info', {});
  return {
    network: network(env),
    rpc: rpcUrl(env),
    build: r?.info?.build_version ?? null,
    ledger: r?.info?.validated_ledger?.seq ?? null,
  };
}
