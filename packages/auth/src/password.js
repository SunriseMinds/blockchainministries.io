/**
 * Password hashing — Argon2id.
 *
 * IMPLEMENTATION NOTE (verified by testing, not assumed):
 * Cloudflare Workers forbids runtime WebAssembly compilation
 * ("Wasm code generation disallowed by embedder"), so WASM-based Argon2
 * libraries that compile from an inlined binary at import time — hash-wasm
 * among them — throw in workerd even though they work under Node. This module
 * therefore uses @noble/hashes, a pure-JavaScript Argon2id with no WASM and no
 * Node built-ins, which runs in the Workers runtime unmodified.
 *
 * Parameters follow the OWASP Password Storage Cheat Sheet (Argon2id, first
 * choice): m = 19456 KiB (19 MiB), t = 2, p = 1, 32-byte output, 16-byte salt.
 *
 * Cost: pure JS is slower than WASM (~0.7–1 s per hash vs ~0.2 s). That is
 * acceptable on paid Workers (CPU limit is seconds, not milliseconds) but it
 * WILL exceed the 10 ms free-tier CPU limit. See docs/PHASE2C_IMPLEMENTATION.md.
 *
 * Stored format is the standard PHC string:
 *   $argon2id$v=19$m=19456,t=2,p=1$<salt-b64>$<hash-b64>
 * It is self-describing, so parameters can be raised later while old hashes
 * still verify (see needsRehash).
 */
import { argon2id } from '@noble/hashes/argon2.js';
import { randomBytes } from '@reellink/security/crypto.js';

export const ARGON2_PARAMS = Object.freeze({
  m: 19456, // KiB
  t: 2,     // iterations
  p: 1,     // parallelism
  dkLen: 32,
});

const VERSION = 19; // 0x13

/* PHC uses unpadded standard base64 (not base64url). */
function b64(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, '');
}
function unb64(s) {
  const padded = s + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(padded);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function derive(plain, salt, params) {
  return argon2id(plain, salt, { t: params.t, m: params.m, p: params.p, dkLen: params.dkLen });
}

/**
 * @param {string} plain
 * @returns {Promise<string>} PHC-format hash, safe to store
 */
export async function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length === 0) throw new Error('password required');
  const salt = randomBytes(16);
  const hash = derive(plain, salt, ARGON2_PARAMS);
  const { m, t, p } = ARGON2_PARAMS;
  return `$argon2id$v=${VERSION}$m=${m},t=${t},p=${p}$${b64(salt)}$${b64(hash)}`;
}

/** Parse a PHC string; returns null when it is not a hash we can verify. */
function parse(stored) {
  const m = /^\$argon2id\$v=(\d+)\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/.exec(stored);
  if (!m) return null;
  return {
    version: Number(m[1]),
    params: { m: Number(m[2]), t: Number(m[3]), p: Number(m[4]) },
    salt: unb64(m[5]),
    hash: unb64(m[6]),
  };
}

/** Constant-time byte comparison. */
function equalBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Verify a password against a stored hash.
 * Never throws on malformed or placeholder hashes — returns false, so accounts
 * migrated with an unusable sentinel simply fail to log in.
 *
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plain, storedHash) {
  if (typeof plain !== 'string' || typeof storedHash !== 'string') return false;
  const parsed = parse(storedHash);
  if (!parsed || parsed.version !== VERSION) return false;
  try {
    const candidate = derive(plain, parsed.salt, { ...parsed.params, dkLen: parsed.hash.length });
    return equalBytes(candidate, parsed.hash);
  } catch {
    return false;
  }
}

/** True when a stored hash used weaker parameters than the current policy. */
export function needsRehash(storedHash) {
  const parsed = parse(storedHash);
  if (!parsed) return true;
  return (
    parsed.params.m < ARGON2_PARAMS.m ||
    parsed.params.t < ARGON2_PARAMS.t ||
    parsed.params.p < ARGON2_PARAMS.p
  );
}

/**
 * Placeholder hash for accounts migrated from Supabase. Supabase password
 * hashes cannot be exported, so migrated users get an unusable value and must
 * complete a password reset (see docs/AUTH_CUTOVER_PLAN.md). Deliberately not
 * a valid PHC string, so verifyPassword() always returns false.
 */
export function unusablePasswordHash() {
  return `!migrated:${crypto.randomUUID()}`;
}
