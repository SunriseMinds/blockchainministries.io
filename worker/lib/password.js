/**
 * Password hashing — Argon2id.
 *
 * Verified to run in the Workers runtime via hash-wasm (WASM); the Workers
 * WebCrypto API has no native Argon2. Parameters follow the OWASP Password
 * Storage Cheat Sheet's Argon2id recommendation:
 *
 *   m = 19456 KiB (19 MiB), t = 2, p = 1, 32-byte output, 16-byte random salt
 *
 * Measured ≈190 ms per hash in this runtime — acceptable for interactive
 * login and comfortably inside Worker CPU limits and the 128 MB memory cap.
 *
 * The stored value is the standard PHC string:
 *   $argon2id$v=19$m=19456,t=2,p=1$<salt-b64>$<hash-b64>
 * It is self-describing, so parameters can be raised later and old hashes
 * still verify (see needsRehash).
 */
import { argon2id, argon2Verify } from 'hash-wasm';
import { randomBytes } from './crypto.js';

export const ARGON2_PARAMS = Object.freeze({
  parallelism: 1,
  iterations: 2,
  memorySize: 19456, // KiB
  hashLength: 32,
});

/**
 * @param {string} plain
 * @returns {Promise<string>} PHC-format hash, safe to store
 */
export async function hashPassword(plain) {
  if (typeof plain !== 'string' || plain.length === 0) throw new Error('password required');
  return argon2id({
    password: plain,
    salt: randomBytes(16),
    ...ARGON2_PARAMS,
    outputType: 'encoded',
  });
}

/**
 * Verify a password against a stored hash.
 * Never throws on malformed/placeholder hashes — returns false, so accounts
 * migrated with an unusable sentinel hash simply fail to log in.
 *
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(plain, storedHash) {
  if (typeof plain !== 'string' || typeof storedHash !== 'string' || !storedHash.startsWith('$argon2')) {
    return false;
  }
  try {
    return await argon2Verify({ password: plain, hash: storedHash });
  } catch {
    return false;
  }
}

/** True when a stored hash was produced with weaker parameters than current. */
export function needsRehash(storedHash) {
  if (typeof storedHash !== 'string') return true;
  const m = /\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(storedHash);
  if (!m) return true;
  const [, mem, iters, par] = m.map(Number);
  return mem < ARGON2_PARAMS.memorySize || iters < ARGON2_PARAMS.iterations || par < ARGON2_PARAMS.parallelism;
}

/**
 * Placeholder hash for accounts migrated from Supabase. Supabase password
 * hashes cannot be exported, so migrated users get an unusable value and must
 * complete a password reset (see docs/AUTH_CUTOVER_PLAN.md). Deliberately not
 * a valid Argon2 string, so verifyPassword() always returns false.
 */
export function unusablePasswordHash() {
  return `!migrated:${crypto.randomUUID()}`;
}
