/**
 * Platform authentication routes: signup, login, logout, session, email
 * verification and password reset.
 *
 * Owned by the platform so no application re-implements them. Inert unless
 * USE_WORKER_AUTH is true.
 */
import { json, noContent, readJson, unauthorized, forbidden, conflict, clientIp, HttpError } from '@reellink/core/http.js';
import { requireDb } from '@reellink/database/d1.js';
import { authRepos } from './repositories.js';
import * as v from '@reellink/core/validate.js';
import { hashPassword, verifyPassword, unusablePasswordHash } from './password.js';
import { randomToken, sha256Hex } from '@reellink/security/crypto.js';
import { issueSession, revokeSession, revokeAllSessions } from './session.js';
import { buildSessionCookie, clearSessionCookie, getSessionToken, SESSION_TTL_SECONDS } from './cookies.js';
import { enforce, reset } from '@reellink/security/ratelimit.js';
import { audit, CORE_ACTIONS as ACTIONS } from '@reellink/security/audit.js';
import { send } from '@reellink/email';
import { AUTH_EMAIL_TEMPLATES } from './email-defaults.js';
import { requireAuth } from './middleware.js';
import { requireTurnstile } from '@reellink/security/turnstile-middleware.js';

const RESET_TTL_MS = 60 * 60 * 1000; // 60m
const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_MS = 15 * 60 * 1000;
// M9.8 — magic-link login. Short-lived: unlike VERIFY_TTL_MS (24h, a
// one-time account-setup step), a login link should be usable only in the
// few minutes after the user actually requested it.
const LOGIN_LINK_TTL_MS = 15 * 60 * 1000; // 15m

function requireWorkerAuth(ctx) {
  if (!ctx.flags.USE_WORKER_AUTH) {
    throw new HttpError(503, 'unavailable', 'Worker authentication is disabled (USE_WORKER_AUTH=false)');
  }
  return requireDb(ctx);
}

const siteUrl = (ctx) => ctx.env.SITE_URL || ctx.url.origin;

/** Public view of the signed-in user. Never exposes hashes or internal ids. */
function sessionView(session) {
  return {
    user: {
      id: session.user_id,
      email: session.email,
      email_verified: Boolean(session.email_verified),
      role: session.role || 'member',
      display_name: session.display_name || null,
    },
  };
}

/**
 * Mount the platform authentication routes.
 *
 * @param {import('@reellink/api').Router} r
 * @param {{templates?:object, basePath?:string}} [options]
 *        `templates` lets an application supply its own copy/voice; platform
 *        defaults are used for anything not provided.
 */
export function mountAuthRoutes(r, options = {}) {
  const templates = { ...AUTH_EMAIL_TEMPLATES, ...(options.templates ?? {}) };
  /* ------------------------------------------------------------- signup -- */
  /**
   * M9.8: passwordless. Workers Free's 10ms CPU budget cannot fit any
   * OWASP-defensible password KDF (Argon2id ~220-290ms, PBKDF2-600k
   * ~310-385ms measured in workerd — both ~20-40x over budget), so accounts
   * are never given a real password. `password_hash` stays NOT NULL (schema
   * frozen) and is filled with the same unusable sentinel already used for
   * migrated accounts — no Argon2 call happens here at all.
   *
   * The confirmation email doubles as the account's first login: it's a
   * login-link token (not a separate email-verification token), and
   * consuming it (see /api/auth/login-link/consume) marks the email
   * verified itself — clicking a link only you received IS the proof.
   */
  r.post('/api/auth/signup', [requireTurnstile], async (ctx) => {
    const db = requireWorkerAuth(ctx);
    const ip = clientIp(ctx.request);
    await enforce(ctx, 'signup', ip);

    const body = ctx.body;
    const email = v.email(body);
    const displayName = v.str(body, 'display_name', { required: false, max: 120 });

    const repo = authRepos(db);
    const existing = await repo.users.byEmail(email);
    if (existing) {
      // Do not reveal that the address is registered.
      await audit(ctx, ACTIONS.AUTH_SIGNUP, { actorEmail: email, metadata: { outcome: 'duplicate' } });
      return json({ ok: true, message: 'Check your email to continue.' }, { status: 202 });
    }

    const userId = await repo.users.create({ email, passwordHash: unusablePasswordHash(), displayName });

    const token = randomToken(32);
    await repo.loginTokens.create({
      userId,
      tokenHash: await sha256Hex(token),
      expiresAt: new Date(Date.now() + LOGIN_LINK_TTL_MS).toISOString(),
    });

    const link = `${siteUrl(ctx)}/login/verify?token=${token}`;
    const mail = await send(ctx, { to: email, ...templates.loginLink(link) });

    await audit(ctx, ACTIONS.AUTH_SIGNUP, { actorUserId: userId, actorEmail: email, entityType: 'user', entityId: userId });
    return json({ ok: true, message: 'Check your email to continue.', email_sent: mail.sent }, { status: 201 });
  });

  /* ------------------------------------------------------- login (link) -- */
  /**
   * M9.8: the active login mechanism. Request a link, then consume it via
   * /api/auth/login-link/consume — see that route for why consumption must
   * never happen on a bare GET.
   */
  r.post('/api/auth/login-link/request', [requireTurnstile], async (ctx) => {
    const db = requireWorkerAuth(ctx);
    const ip = clientIp(ctx.request);
    const email = v.email(ctx.body);

    // Same dual dimension as the old password login: neither IP nor account
    // alone is sufficient to rate-limit.
    await enforce(ctx, 'loginLink', ip);
    await enforce(ctx, 'loginLink', `email:${email}`);

    const repo = authRepos(db);
    const user = await repo.users.byEmail(email);

    if (user && user.status === 'active') {
      // Supersede any outstanding link — only the most recently requested
      // one is ever valid, same convention as password_reset_tokens.
      await repo.loginTokens.invalidateAllForUser(user.id);
      const token = randomToken(32);
      await repo.loginTokens.create({
        userId: user.id,
        tokenHash: await sha256Hex(token),
        expiresAt: new Date(Date.now() + LOGIN_LINK_TTL_MS).toISOString(),
      });
      const link = `${siteUrl(ctx)}/login/verify?token=${token}`;
      await send(ctx, { to: email, ...templates.loginLink(link) });
    }

    // Identical response whether or not the address is registered — no
    // account enumeration, same convention as request-password-reset below.
    return json({ ok: true, message: 'If that address has an account, a login link has been sent.' });
  });

  r.post('/api/auth/login-link/consume', [], async (ctx) => {
    const db = requireWorkerAuth(ctx);
    const body = await readJson(ctx.request);
    const token = v.token(body);

    const repo = authRepos(db);
    const row = await repo.loginTokens.byTokenHash(await sha256Hex(token));
    if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) {
      throw new HttpError(400, 'invalid_token', 'This login link is invalid or has expired');
    }
    // Atomic single-use consumption guards against double submission /
    // concurrent requests both trying to use the same link.
    if (!(await repo.loginTokens.consume(row.id))) {
      throw new HttpError(400, 'invalid_token', 'This login link has already been used');
    }

    const user = await repo.users.byId(row.user_id);
    if (!user) throw unauthorized();
    if (user.status !== 'active') throw forbidden('This account is not active');

    // Clicking a link only this address could have received is at least as
    // strong a proof of ownership as the separate email-verification flow.
    if (!user.email_verified) await repo.users.markVerified(user.id);
    await repo.users.resetFailedLogins(user.id);

    const { token: sessionToken } = await issueSession(ctx, db, user.id);
    const session = await repo.sessions.byTokenHash(await sha256Hex(sessionToken));
    await audit(ctx, ACTIONS.AUTH_LOGIN_SUCCESS, { actorUserId: user.id, actorEmail: user.email });

    return json(sessionView(session), {
      headers: { 'Set-Cookie': buildSessionCookie(sessionToken, SESSION_TTL_SECONDS) },
    });
  });

  /* ------------------------------------------------- login (password) -- */
  /**
   * RETIRED as of M9.8 — no frontend path calls this anymore (see
   * src/contexts/AuthProvider.jsx, which now only issues login-link
   * requests). Left in place, unmodified, only for compatibility with any
   * pre-existing password-holding account and as a historical reference —
   * it is not linked from any UI and is not the supported way to log in.
   * password_hash is Argon2id-verified here exactly as before; this is
   * exactly the CPU-expensive path M9.5/M9.6 proved does not fit Workers
   * Free, which is *why* it was retired, not despite it.
   */
  r.post('/api/auth/login', [requireTurnstile], async (ctx) => {
    const db = requireWorkerAuth(ctx);
    const ip = clientIp(ctx.request);
    const body = ctx.body;
    const email = v.email(body);
    const password = v.str(body, 'password', { max: 256 });

    // Rate limit by IP and by account, so neither dimension alone is enough.
    await enforce(ctx, 'login', ip);
    await enforce(ctx, 'login', `email:${email}`);

    const repo = authRepos(db);
    const user = await repo.users.byEmail(email);

    // Always run a verification to keep timing similar for unknown accounts.
    const ok = user
      ? await verifyPassword(password, user.password_hash)
      : await verifyPassword(password, unusablePasswordHash());

    if (!user || !ok) {
      if (user) {
        const attempts = (user.failed_login_count ?? 0) + 1;
        const lockedUntil = attempts >= LOCKOUT_THRESHOLD ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null;
        await repo.users.recordFailedLogin(user.id, lockedUntil);
      }
      await audit(ctx, ACTIONS.AUTH_LOGIN_FAILURE, { actorEmail: email, metadata: { ip } });
      throw unauthorized('Invalid email or password');
    }

    if (user.status !== 'active') throw forbidden('This account is not active');
    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      throw new HttpError(423, 'account_locked', 'Account temporarily locked. Try again later.');
    }

    await repo.users.resetFailedLogins(user.id);
    const { token } = await issueSession(ctx, db, user.id);
    await reset(ctx, 'login', `email:${email}`);

    const session = await repo.sessions.byTokenHash(await sha256Hex(token));
    await audit(ctx, ACTIONS.AUTH_LOGIN_SUCCESS, { actorUserId: user.id, actorEmail: email });

    return json(sessionView(session), {
      headers: { 'Set-Cookie': buildSessionCookie(token, SESSION_TTL_SECONDS) },
    });
  });

  /* ------------------------------------------------------------- logout -- */
  r.post('/api/auth/logout', [], async (ctx) => {
    const db = requireWorkerAuth(ctx);
    const raw = getSessionToken(ctx.request);
    if (raw) {
      const row = await authRepos(db).sessions.byTokenHash(await sha256Hex(raw));
      if (row) {
        await revokeSession(db, row.session_id);
        await audit(ctx, ACTIONS.AUTH_LOGOUT, { actorUserId: row.user_id, actorEmail: row.email });
      }
    }
    // Always clear the cookie, even if the session was already gone.
    return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
  });

  r.post('/api/auth/logout-all', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    await revokeAllSessions(db, ctx.session.user_id);
    await audit(ctx, ACTIONS.AUTH_LOGOUT_ALL);
    return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
  });

  /* ------------------------------------------------------------ session -- */
  r.get('/api/auth/session', [], async (ctx) => {
    if (!ctx.flags.USE_WORKER_AUTH) return json({ authenticated: false, reason: 'worker_auth_disabled' });
    requireDb(ctx);
    const raw = getSessionToken(ctx.request);
    if (!raw) return json({ authenticated: false });
    const { resolveSession } = await import('./session.js');
    const session = await resolveSession(ctx.env.DB, raw);
    if (!session) return json({ authenticated: false });
    await authRepos(ctx.env.DB).sessions.touch(session.session_id);
    return json({ authenticated: true, ...sessionView(session) });
  });

  /* ----------------------------------------------------- verify email -- */
  r.post('/api/auth/verify-email', [], async (ctx) => {
    const db = requireWorkerAuth(ctx);
    await enforce(ctx, 'verifyEmail', clientIp(ctx.request));
    const body = await readJson(ctx.request);
    const token = v.token(body);

    const repo = authRepos(db);
    const row = await repo.emailVerificationTokens.byTokenHash(await sha256Hex(token));
    if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) {
      throw new HttpError(400, 'invalid_token', 'This verification link is invalid or has expired');
    }
    // Atomic single-use consumption guards against double submission.
    if (!(await repo.emailVerificationTokens.consume(row.id))) {
      throw new HttpError(400, 'invalid_token', 'This verification link has already been used');
    }
    await repo.users.markVerified(row.user_id);
    await audit(ctx, ACTIONS.AUTH_EMAIL_VERIFIED, { actorUserId: row.user_id, entityType: 'user', entityId: row.user_id });
    return json({ ok: true, verified: true });
  });

  /* -------------------------------------------------- password reset -- */
  r.post('/api/auth/request-password-reset', [requireTurnstile], async (ctx) => {
    const db = requireWorkerAuth(ctx);
    const email = v.email(ctx.body);
    await enforce(ctx, 'passwordReset', `email:${email}`);

    const repo = authRepos(db);
    const user = await repo.users.byEmail(email);

    if (user) {
      await repo.passwordResetTokens.invalidateAllForUser(user.id);
      const token = randomToken(32);
      await repo.passwordResetTokens.create({
        userId: user.id,
        tokenHash: await sha256Hex(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
      });
      const link = `${siteUrl(ctx)}/update-password?token=${token}`;
      await send(ctx, { to: email, ...templates.passwordReset(link) });
      await audit(ctx, ACTIONS.AUTH_RESET_REQUEST, { actorUserId: user.id, actorEmail: email });
    }

    // Identical response either way — no account enumeration.
    return json({ ok: true, message: 'If that address has an account, a reset link has been sent.' });
  });

  r.post('/api/auth/reset-password', [], async (ctx) => {
    const db = requireWorkerAuth(ctx);
    await enforce(ctx, 'passwordReset', clientIp(ctx.request));
    const body = await readJson(ctx.request);
    const token = v.token(body);
    const password = v.password(body);

    const repo = authRepos(db);
    const row = await repo.passwordResetTokens.byTokenHash(await sha256Hex(token));
    if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) {
      throw new HttpError(400, 'invalid_token', 'This reset link is invalid or has expired');
    }
    if (!(await repo.passwordResetTokens.consume(row.id))) {
      throw new HttpError(400, 'invalid_token', 'This reset link has already been used');
    }

    await repo.users.setPassword(row.user_id, await hashPassword(password));
    await repo.users.resetFailedLogins(row.user_id);
    await repo.passwordResetTokens.invalidateAllForUser(row.user_id);
    // Any session established before the reset is no longer trusted.
    await revokeAllSessions(db, row.user_id);

    const user = await repo.users.byId(row.user_id);
    if (user) await send(ctx, { to: user.email, ...templates.passwordChanged() });

    await audit(ctx, ACTIONS.AUTH_RESET_COMPLETE, { actorUserId: row.user_id, entityType: 'user', entityId: row.user_id });
    return json({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
  });

  return r;
}

