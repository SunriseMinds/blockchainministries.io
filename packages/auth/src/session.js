/**
 * Session issuance and resolution.
 *
 * The raw token is returned to the caller once (to be set as a cookie) and is
 * never stored; only its SHA-256 digest goes into `sessions.token_hash`.
 */
import { randomToken, sha256Hex } from '@reellink/security/crypto.js';
import { authRepos } from './repositories.js';
import { SESSION_TTL_SECONDS, SESSION_IDLE_SECONDS } from './cookies.js';
import { clientIp, userAgent } from '@reellink/core/http.js';

/**
 * @returns {Promise<{token:string, sessionId:string, expiresAt:string}>}
 */
export async function issueSession(ctx, db, userId) {
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

  const sessionId = await authRepos(db).sessions.create({
    userId,
    tokenHash,
    expiresAt,
    ip: clientIp(ctx.request),
    userAgent: userAgent(ctx.request),
  });

  return { token, sessionId, expiresAt };
}

/**
 * Resolve a raw token to a live session row, or null.
 * Rejects: unknown, revoked, absolutely expired, idle-expired, and sessions
 * whose user is not active.
 */
export async function resolveSession(db, rawToken) {
  if (!rawToken) return null;
  const tokenHash = await sha256Hex(rawToken);
  const row = await authRepos(db).sessions.byTokenHash(tokenHash);
  if (!row) return null;

  const now = Date.now();
  if (row.revoked_at) return null;
  if (new Date(row.expires_at).getTime() <= now) return null;
  if (row.status !== 'active') return null;

  if (row.last_seen_at) {
    const idleMs = now - new Date(row.last_seen_at).getTime();
    if (idleMs > SESSION_IDLE_SECONDS * 1000) return null;
  }
  return row;
}

export async function revokeSession(db, sessionId) {
  await authRepos(db).sessions.revoke(sessionId);
}

export async function revokeAllSessions(db, userId) {
  await authRepos(db).sessions.revokeAllForUser(userId);
}
