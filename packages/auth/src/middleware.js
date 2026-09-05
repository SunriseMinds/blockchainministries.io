/**
 * Authentication & authorization middleware.
 *
 * D1 has no row-level security, so these are the only thing standing between
 * a request and the data. They are deliberately small, deny-by-default, and
 * used by every non-public route.
 *
 * Admin protection is layered:
 *   1. Cloudflare Access sits in front of /admin* and /api/admin/* (configured
 *      in the dashboard) and injects Cf-Access-Jwt-Assertion.
 *   2. requireAdmin ALSO re-checks users.role in D1 — the edge is never
 *      trusted on its own.
 */
import { unauthorized, forbidden, badRequest } from '@reellink/core/http.js';
import { requireDb } from '@reellink/database/d1.js';
import { getSessionToken, originAllowed } from './cookies.js';
import { resolveSession } from './session.js';
import { authRepos } from './repositories.js';

/**
 * Populate ctx.session when a valid cookie is present. Never rejects.
 *
 * Idempotent per request: the application pipeline runs this once, and the
 * route guards call it again. Without the guard below that meant TWO session
 * lookups (a D1 read each) on every authenticated request.
 */
export async function loadSession(ctx) {
  if (ctx.sessionLoaded) return ctx.session;
  ctx.sessionLoaded = true;
  ctx.session = null;
  if (!ctx.flags.USE_WORKER_AUTH || !ctx.flags.USE_D1 || !ctx.env.DB) return null;
  const token = getSessionToken(ctx.request);
  if (!token) return null;
  ctx.session = await resolveSession(ctx.env.DB, token);
  return ctx.session;
}

/** Require a valid session. */
export async function requireAuth(ctx) {
  if (!ctx.flags.USE_WORKER_AUTH) throw unauthorized('Worker authentication is disabled');
  requireDb(ctx);
  await loadSession(ctx);
  if (!ctx.session) throw unauthorized();
}

/** Require a verified email address in addition to a session. */
export async function requireVerifiedEmail(ctx) {
  await requireAuth(ctx);
  if (!ctx.session.email_verified) {
    throw forbidden('Please verify your email address first');
  }
}

/**
 * Require an administrator.
 * Checks the Cloudflare Access assertion when Access is in front, and always
 * re-verifies the role in D1.
 */
export async function requireAdmin(ctx) {
  await requireAuth(ctx);

  const role = ctx.session.role
    ?? (await authRepos(ctx.env.DB).users.byId(ctx.session.user_id))?.role;

  if (role !== 'admin') throw forbidden('Administrator access required');

  // When Cloudflare Access is enforced, demand its assertion header too.
  if (ctx.env.REQUIRE_CF_ACCESS === 'true' && !ctx.request.headers.get('Cf-Access-Jwt-Assertion')) {
    throw forbidden('Cloudflare Access assertion missing');
  }
  ctx.isAdmin = true;
}

/** CSRF guard for state-changing requests (SameSite=Lax is the primary control). */
export async function requireSameOrigin(ctx) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(ctx.request.method)) return;
  if (!originAllowed(ctx.request, ctx.url)) throw badRequest('Cross-origin request rejected');
}
