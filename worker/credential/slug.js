/**
 * Public verification slugs.
 *
 * `verify_slug` is the most hostile-environment string this product produces:
 * it is printed on a certificate, encoded into a QR, decoded by arbitrary
 * phone apps, auto-detected by link parsers, copied out of PDFs, and typed by
 * hand. It therefore uses the most conservative alphabet possible.
 *
 * WHY THIS EXISTS (M11 phone-scan defect):
 * slugs were previously `randomToken(12).toLowerCase()` - base64url, whose
 * alphabet includes `-` and `_`. That produced real slugs such as
 * `-ot6njmwjgsq_4rz`, which START WITH A HYPHEN. The QR encoded that URL
 * correctly and the Worker served it correctly, but a URL auto-detector that
 * will not begin a path segment with punctuation truncates
 * `/verify/-ot6njmwjgsq_4rz` to `/verify/`, dropping the slug entirely - the
 * exact failure observed on a real phone scan.
 *
 * Lowercase alphanumerics only:
 *   * no leading or trailing punctuation, so nothing can be trimmed off
 *   * no `-`/`_`, so no linkifier has to make a judgement call
 *   * unambiguous when read aloud or typed from print
 *
 * 16 chars over 36 symbols is ~82 bits - unguessable, and comfortably more
 * entropy than the 12-byte base64url token it replaces (which lost entropy to
 * the .toLowerCase() case-fold anyway).
 */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const LENGTH = 16;
/** Rejection ceiling: 256 % 36 === 4, so bytes >= 252 would bias the first four symbols. */
const ACCEPT_BELOW = 256 - (256 % ALPHABET.length); // 252

/** @returns {string} e.g. "k3d9wq2p7fa1m8zv" - always matches /^[a-z0-9]{16}$/ */
export function generateVerifySlug() {
  const out = [];
  const buf = new Uint8Array(24);
  while (out.length < LENGTH) {
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte >= ACCEPT_BELOW) continue;
      out.push(ALPHABET[byte % ALPHABET.length]);
      if (out.length === LENGTH) break;
    }
  }
  return out.join('');
}

/** The canonical shape, shared with tests and any future validator. */
export const VERIFY_SLUG_PATTERN = /^[a-z0-9]{16}$/;
