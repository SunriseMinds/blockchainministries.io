/**
 * Audit logging.
 *
 * Every privileged or security-relevant action writes one append-only row.
 * Writes are best-effort: an audit failure must never break the user-facing
 * request, but it is surfaced in Worker logs.
 *
 * NEVER pass passwords, tokens, hashes or full PII in `metadata`.
 */
import { auditLogs } from './audit-repo.js';
import { clientIp, userAgent } from '@reellink/core/http.js';

export const CORE_ACTIONS = Object.freeze({
  AUTH_SIGNUP: 'auth.signup',
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAILURE: 'auth.login.failure',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_LOGOUT_ALL: 'auth.logout_all',
  AUTH_EMAIL_VERIFIED: 'auth.email_verified',
  AUTH_RESET_REQUEST: 'auth.password_reset.request',
  AUTH_RESET_COMPLETE: 'auth.password_reset.complete',
  PROFILE_UPDATE: 'profile.update',
  ROLE_CHANGE: 'profile.role_change',
  FILE_DOWNLOAD: 'file.download',
  FILE_UPLOAD: 'file.upload',
  FILE_DELETE: 'file.delete',
  PAYMENT_RECORDED: 'payment.recorded',
});

/**
 * Applications extend the action vocabulary with their own domain verbs:
 *   export const ACTIONS = defineActions({ SCROLL_PUBLISH: 'scroll.publish' });
 * Platform actions are always included.
 */
export function defineActions(appActions = {}) {
  return Object.freeze({ ...CORE_ACTIONS, ...appActions });
}

/** Back-compat alias so platform code can keep using ACTIONS.*. */
export const ACTIONS = CORE_ACTIONS;

/**
 * @param {object} ctx
 * @param {string} action one of ACTIONS
 * @param {{entityType?:string, entityId?:string, metadata?:object, actorUserId?:string, actorEmail?:string}} [opts]
 */
export async function audit(ctx, action, opts = {}) {
  const write = (async () => {
    try {
      if (!ctx.flags.USE_D1 || !ctx.env.DB) return;
      await auditLogs(ctx.env.DB).record({
        actorUserId: opts.actorUserId ?? ctx.session?.user_id ?? null,
        actorEmail: opts.actorEmail ?? ctx.session?.email ?? null,
        action,
        entityType: opts.entityType ?? null,
        entityId: opts.entityId ?? null,
        metadata: opts.metadata ?? null,
        ip: clientIp(ctx.request),
        userAgent: userAgent(ctx.request),
      });
    } catch (err) {
      console.error('audit write failed', action, err?.message);
    }
  })();

  // Don't block the response on the audit write when we can defer it.
  if (ctx.waitUntil) ctx.waitUntil(write);
  else await write;
}
