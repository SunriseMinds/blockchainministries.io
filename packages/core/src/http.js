import { log, redact } from './logger.js';
/**
 * HTTP helpers: one consistent JSON envelope and error model for every
 * /api/* response, so no handler hand-rolls its own shape.
 */

/**
 * Default security headers on every API response.
 *
 * No CSP here: an API returns JSON, and a CSP that is right for one app's
 * frontend is wrong for another's. Frontend CSP belongs in each app's
 * `public/_headers`.
 */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // API responses are never a legitimate frame target.
  'X-Frame-Options': 'DENY',
  // Deny powerful features by default; a frontend route can re-grant them.
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=()',
  // Two years, subdomains included — Cloudflare terminates TLS for us.
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
};

/** Error carrying an HTTP status. Anything else thrown becomes a 500. */
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} code    stable machine-readable code, e.g. 'not_found'
   * @param {string} [message] safe for the client; never include internals
   * @param {object} [details]
   */
  constructor(status, code, message, details) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, 'bad_request', msg, details);
export const unauthorized = (msg = 'Authentication required') => new HttpError(401, 'unauthorized', msg);
export const forbidden = (msg = 'Not permitted') => new HttpError(403, 'forbidden', msg);
/** Prefer 404 over 403 when confirming existence would itself leak information. */
export const notFound = (msg = 'Not found') => new HttpError(404, 'not_found', msg);
export const conflict = (msg) => new HttpError(409, 'conflict', msg);
export const tooManyRequests = (msg = 'Too many requests', retryAfter) =>
  new HttpError(429, 'rate_limited', msg, retryAfter ? { retry_after: retryAfter } : undefined);
export const unavailable = (msg = 'Feature disabled') => new HttpError(503, 'unavailable', msg);

/**
 * @param {unknown} data
 * @param {{status?:number, headers?:Record<string,string>, private?:boolean}} [opts]
 */
export function json(data, opts = {}) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...SECURITY_HEADERS,
    // Authenticated payloads must never be cached by a shared cache.
    'Cache-Control': opts.private === false ? 'public, max-age=60' : 'private, no-store',
    ...opts.headers,
  };
  return new Response(JSON.stringify(data), { status: opts.status ?? 200, headers });
}

/** Convert any thrown value into a safe JSON error response. */
export function errorResponse(err, ctx) {
  const requestId = ctx?.requestId;
  if (err instanceof HttpError) {
    // 5xx from a typed error is still worth logging; 4xx is normal traffic.
    if (err.status >= 500) log.error(ctx, 'request_failed', { code: err.code, status: err.status });
    return json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details ? { details: err.details } : {}),
          ...(requestId ? { request_id: requestId } : {}),
        },
      },
      { status: err.status },
    );
  }
  // Log server-side for diagnosis, but never leak internals to the client.
  log.error(ctx, 'unhandled_error', { error: redact(err?.stack || err?.message || String(err), 500) });
  return json(
    { error: { code: 'internal_error', message: 'Internal error', ...(requestId ? { request_id: requestId } : {}) } },
    { status: 500 },
  );
}

export function noContent() {
  return new Response(null, { status: 204, headers: SECURITY_HEADERS });
}

/** Parse a JSON body defensively; throws 400 rather than crashing the Worker. */
export async function readJson(request, { maxBytes = 64 * 1024 } = {}) {
  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw badRequest('Expected application/json');
  const raw = await request.text();
  if (raw.length > maxBytes) throw badRequest('Payload too large');
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw badRequest('Body must be a JSON object');
    }
    return parsed;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw badRequest('Malformed JSON');
  }
}

/** Best-effort client IP, used for rate limiting and audit rows. */
export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
}

export function userAgent(request) {
  return (request.headers.get('User-Agent') || '').slice(0, 300);
}
