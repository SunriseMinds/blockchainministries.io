/**
 * Minimal, dependency-free input validation.
 *
 * D1 has no row-level security, so every value that reaches SQL is validated
 * here first. All validators throw HttpError(400) with a field name.
 */
import { badRequest } from './http.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function str(obj, field, { required = true, min = 1, max = 1000, trim = true } = {}) {
  let v = obj?.[field];
  if (v === undefined || v === null || v === '') {
    if (required) throw badRequest(`Missing field: ${field}`);
    return null;
  }
  if (typeof v !== 'string') throw badRequest(`Field must be a string: ${field}`);
  if (trim) v = v.trim();
  if (v.length < min) throw badRequest(`Field too short: ${field}`);
  if (v.length > max) throw badRequest(`Field too long: ${field}`);
  return v;
}

export function email(obj, field = 'email', { required = true } = {}) {
  const v = str(obj, field, { required, max: 320 });
  if (v === null) return null;
  const lower = v.toLowerCase();
  if (!EMAIL_RE.test(lower)) throw badRequest(`Invalid email: ${field}`);
  return lower; // stored lowercase so uniqueness is case-insensitive
}

export function oneOf(obj, field, allowed, { required = true } = {}) {
  const v = str(obj, field, { required });
  if (v === null) return null;
  if (!allowed.includes(v)) throw badRequest(`Invalid value for ${field}`);
  return v;
}

export function int(obj, field, { required = true, min = -Infinity, max = Infinity } = {}) {
  const v = obj?.[field];
  if (v === undefined || v === null) {
    if (required) throw badRequest(`Missing field: ${field}`);
    return null;
  }
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n)) throw badRequest(`Field must be an integer: ${field}`);
  if (n < min || n > max) throw badRequest(`Field out of range: ${field}`);
  return n;
}

/** Accepts an object/array and returns it serialized for a TEXT column. */
export function jsonField(obj, field, { required = true, maxBytes = 32 * 1024 } = {}) {
  const v = obj?.[field];
  if (v === undefined || v === null) {
    if (required) throw badRequest(`Missing field: ${field}`);
    return null;
  }
  if (typeof v !== 'object') throw badRequest(`Field must be an object: ${field}`);
  const s = JSON.stringify(v);
  if (s.length > maxBytes) throw badRequest(`Field too large: ${field}`);
  return s;
}

/**
 * Password policy. Length is the dominant factor; a 12-char minimum matches
 * current OWASP guidance. Breach checking is applied separately at signup.
 */
export function password(obj, field = 'password') {
  const v = obj?.[field];
  if (typeof v !== 'string') throw badRequest(`Missing field: ${field}`);
  if (v.length < 12) throw badRequest('Password must be at least 12 characters');
  if (v.length > 256) throw badRequest('Password must be at most 256 characters');
  return v;
}

/** Opaque token from a URL/body (verification, password reset). */
export function token(obj, field = 'token') {
  const v = str(obj, field, { min: 16, max: 200 });
  if (!/^[A-Za-z0-9_-]+$/.test(v)) throw badRequest(`Invalid token: ${field}`);
  return v;
}

/** Bounded pagination. */
export function pagination(url) {
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 200);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
  return { limit, offset };
}
