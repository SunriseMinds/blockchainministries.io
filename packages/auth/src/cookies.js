/**
 * Session cookie handling.
 *
 * HttpOnly  — unreadable from JavaScript, so XSS cannot exfiltrate the session.
 * Secure    — HTTPS only.
 * SameSite=Lax — blocks cross-site POST CSRF while keeping normal navigation.
 * Path=/    — sent to every route including /api.
 */

export const SESSION_COOKIE = 'bm_session';

/** Absolute session lifetime. */
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
/** Idle timeout — a session unused for this long is rejected. */
export const SESSION_IDLE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function getSessionToken(request) {
  return parseCookies(request)[SESSION_COOKIE] || null;
}

/**
 * @param {string} token raw token (only its hash is stored server-side)
 * @param {number} maxAge seconds
 */
export function buildSessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
  ].join('; ');
}

/** Expire the cookie immediately (logout). */
export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/**
 * Defence-in-depth CSRF check for state-changing requests. SameSite=Lax
 * already blocks cross-site form POSTs; this rejects mismatched Origin too.
 * @returns {boolean} true when the request origin is acceptable
 */
export function originAllowed(request, url) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // non-browser or same-origin navigation
  try {
    return new URL(origin).host === url.host;
  } catch {
    return false;
  }
}
