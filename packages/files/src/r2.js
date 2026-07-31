/**
 * R2 helpers for the two buckets.
 *
 *   PUBLIC_FILES    -> bm-public     (published scrolls, minister photos, brand)
 *   PROTECTED_FILES -> bm-protected  (credential PDFs, member-only scrolls)
 *
 * `bm-protected` has no public access. Objects are reachable only by streaming
 * through an authorized Worker route, so authorization is always enforced in
 * code. "Signed access" here means a short-lived HMAC grant minted by the
 * Worker and redeemed at the same Worker — no bucket is ever exposed directly.
 */
import { HttpError, notFound, unavailable } from '@reellink/core/http.js';
import { hmacSha256Hex, timingSafeEqual } from '@reellink/security/crypto.js';

export const BUCKETS = Object.freeze({ PUBLIC: 'PUBLIC_FILES', PROTECTED: 'PROTECTED_FILES' });

function bucket(ctx, binding) {
  if (!ctx.flags.USE_R2) throw unavailable('Object storage is disabled (USE_R2=false)');
  const b = ctx.env[binding];
  if (!b) throw new HttpError(503, 'unavailable', `R2 binding "${binding}" is not configured`);
  return b;
}

/** Reject traversal and absolute keys before touching R2. */
export function assertSafeKey(key) {
  if (typeof key !== 'string' || key.length === 0 || key.length > 512) {
    throw new HttpError(400, 'bad_request', 'Invalid object key');
  }
  if (key.startsWith('/') || key.includes('..') || key.includes('\\')) {
    throw new HttpError(400, 'bad_request', 'Invalid object key');
  }
  return key;
}

/**
 * @param {'PUBLIC_FILES'|'PROTECTED_FILES'} binding
 * @param {string} key
 * @param {ReadableStream|ArrayBuffer|string} body
 */
export async function upload(ctx, binding, key, body, { contentType, cacheControl } = {}) {
  assertSafeKey(key);
  const opts = { httpMetadata: {} };
  if (contentType) opts.httpMetadata.contentType = contentType;
  if (cacheControl) opts.httpMetadata.cacheControl = cacheControl;
  const obj = await bucket(ctx, binding).put(key, body, opts);
  return { key, etag: obj?.etag ?? null, size: obj?.size ?? null };
}

/** Returns an R2ObjectBody or throws 404. */
export async function download(ctx, binding, key) {
  assertSafeKey(key);
  const obj = await bucket(ctx, binding).get(key);
  if (!obj) throw notFound('File not found');
  return obj;
}

export async function head(ctx, binding, key) {
  assertSafeKey(key);
  return bucket(ctx, binding).head(key);
}

export async function remove(ctx, binding, key) {
  assertSafeKey(key);
  await bucket(ctx, binding).delete(key);
  return { key, deleted: true };
}

export async function list(ctx, binding, { prefix, limit = 100, cursor } = {}) {
  const res = await bucket(ctx, binding).list({ prefix, limit, cursor });
  return {
    objects: res.objects.map((o) => ({ key: o.key, size: o.size, uploaded: o.uploaded })),
    truncated: res.truncated,
    cursor: res.truncated ? res.cursor : null,
  };
}

/** Turn an R2 object into a Response with correct caching semantics. */
export function toResponse(obj, { isPublic }) {
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('etag', obj.httpEtag);
  headers.set(
    'Cache-Control',
    isPublic ? 'public, max-age=31536000, immutable' : 'private, no-store',
  );
  headers.set('X-Content-Type-Options', 'nosniff');
  // Protected documents should download rather than execute inline.
  if (!isPublic) headers.set('Content-Disposition', 'attachment');
  return new Response(obj.body, { headers });
}

/* ------------------------------------------------------------ signed access -- */
/**
 * Mint a short-lived signed grant for a protected key. The grant is redeemed
 * at the Worker (which re-checks authorization), so it never becomes a public
 * bucket URL and cannot outlive its expiry.
 *
 * @returns {Promise<{key:string, exp:number, sig:string}>}
 */
export async function signKey(ctx, key, ttlSeconds = 300) {
  assertSafeKey(key);
  const secret = ctx.env.SESSION_PEPPER || ctx.env.FILE_SIGNING_SECRET;
  if (!secret) throw new HttpError(503, 'unavailable', 'File signing secret is not configured');
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = await hmacSha256Hex(secret, `${key}:${exp}`);
  return { key, exp, sig };
}

/** Verify a signed grant. Throws 403 when invalid or expired. */
export async function verifySignedKey(ctx, key, exp, sig) {
  const secret = ctx.env.SESSION_PEPPER || ctx.env.FILE_SIGNING_SECRET;
  if (!secret) throw new HttpError(503, 'unavailable', 'File signing secret is not configured');
  if (!exp || Number(exp) < Math.floor(Date.now() / 1000)) {
    throw new HttpError(403, 'forbidden', 'Link expired');
  }
  const expected = await hmacSha256Hex(secret, `${key}:${exp}`);
  if (!timingSafeEqual(expected, String(sig))) throw new HttpError(403, 'forbidden', 'Invalid signature');
}

/** Canonical key builders — keep layout consistent with R2_FILE_MIGRATION_PLAN.md. */
export const keys = Object.freeze({
  publicScroll: (scrollId) => `scrolls/${scrollId}.pdf`,
  memberScroll: (scrollId) => `scrolls-member/${scrollId}.pdf`,
  credential: (ordinationId) => `credentials/${ordinationId}.pdf`,
  ministerPhoto: (ministerId, ext = 'jpg') => `ministers/${ministerId}.${ext}`,
  brand: (name) => `brand/${name}`,
});
