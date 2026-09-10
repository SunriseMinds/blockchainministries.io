/**
 * Ordination credential numbers — BUSINESS format, app-local by design.
 *
 * Format `BM-XXXXXXXX`, ratified in docs/M11_CREDENTIAL_POLICY.md (Q2):
 * eight uppercase alphanumerics, non-sequential, opaque, safe to print on a
 * public credential.
 *
 * What this deliberately is NOT:
 *   * NOT sequential — a counter would leak ordination volume and ordering.
 *   * NOT derived from a user id, ordination id, or timestamp — a credential
 *     number is printed publicly and must reveal nothing about its holder.
 *   * NOT Math.random — this is an identifier on a ministry credential.
 *
 * Uniqueness is NOT this module's job. The authority is the D1 partial unique
 * index `idx_ordinations_credential_number` (migrations/0003). This module only
 * has to make collisions astronomically rare; the database makes them
 * impossible. See ordinations.approve() for the bounded retry that closes the
 * loop.
 */

/** 36 symbols. No lowercase — the ratified format is uppercase only. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const LENGTH = 8;

/**
 * Rejection-sampling ceiling. 256 % 36 === 4, so bytes 252..255 would make the
 * first four symbols very slightly more likely under a naive `% 36`. Discarding
 * them makes the distribution exactly uniform. 252/256 acceptance means the
 * loop effectively always finishes on the first buffer.
 */
const ACCEPT_BELOW = 256 - (256 % ALPHABET.length); // 252

/**
 * @returns {string} e.g. "BM-7K2QX9AZ" — always matches /^BM-[A-Z0-9]{8}$/
 */
export function generateCredentialNumber() {
  const out = [];
  // 16 bytes covers 8 symbols with room for rejected draws; the loop refills
  // in the vanishingly unlikely case that it does not.
  const buf = new Uint8Array(16);

  while (out.length < LENGTH) {
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte >= ACCEPT_BELOW) continue; // biased tail — discard
      out.push(ALPHABET[byte % ALPHABET.length]);
      if (out.length === LENGTH) break;
    }
  }

  return `BM-${out.join('')}`;
}

/** The canonical shape, exported so tests and future validators agree on it. */
export const CREDENTIAL_NUMBER_PATTERN = /^BM-[A-Z0-9]{8}$/;
