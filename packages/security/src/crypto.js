/**
 * Token and hashing primitives built on the Workers WebCrypto API.
 *
 * Design rule: the database never stores a usable credential. Session and
 * one-time tokens are sent to the user in full but persisted only as SHA-256
 * digests, so a database disclosure does not yield working tokens.
 */

const B64URL = /[+/=]/g;
const B64URL_MAP = { '+': '-', '/': '_', '=': '' };

function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(B64URL, (c) => B64URL_MAP[c]);
}

/** Cryptographically random URL-safe token (default 32 bytes ≈ 256 bits). */
export function randomToken(bytes = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function randomBytes(n = 16) {
  return crypto.getRandomValues(new Uint8Array(n));
}

/** SHA-256 as lowercase hex. Used for token_hash columns. */
export async function sha256Hex(input) {
  const data = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Constant-time string comparison. Always compares a fixed number of bytes so
 * the timing does not reveal the position of the first difference.
 */
export function timingSafeEqual(a, b) {
  const ab = new TextEncoder().encode(String(a));
  const bb = new TextEncoder().encode(String(b));
  if (ab.length !== bb.length) {
    // Still perform work to avoid an early-exit timing signal on length.
    let diff = 1;
    const len = Math.max(ab.length, bb.length);
    for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
    return false;
  }
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/** HMAC-SHA256 hex, for signing values we hand to third parties. */
export async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
