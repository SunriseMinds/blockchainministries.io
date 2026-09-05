# Authentication Cutover Plan

**Status: DESIGN — NOT IMPLEMENTED.** No authentication code has been written. Implementation
begins only after the owner approves the model below.

## The non-negotiable constraint
**Supabase password hashes cannot be exported or reused.** They live in `auth.users.encrypted_password`,
are not exposed by the API, and are bound to Supabase's GoTrue configuration. Any move off Supabase
Auth means existing members cannot carry their passwords across.

Therefore **every existing member must set a new password at cutover** (or keep Supabase as the
identity provider). There is no third option. How many people this affects is currently
**unknown** — `auth.users` count was not retrieved (see `BACKEND_INVENTORY.md` §11). If the
project is genuinely pre-launch with zero users, this risk evaporates entirely; that must be
confirmed first.

## Model (per owner instruction)
- **Administrators → Cloudflare Access** on `/admin*` and `/api/admin/*`.
- **Members → Worker + D1 custom authentication** with the hardening below.

### Why Access for admins
Today `/admin` is protected only by a client-side `role` check (`AdminRoute.jsx`) — trivially
bypassed — and the `admin-approve-*` Edge Functions run with `verify_jwt = false`. Cloudflare
Access puts identity verification **in front of the Worker**, requires no custom code, and is free
at this scale. The Worker still re-validates the `Cf-Access-Jwt-Assertion` header and re-checks
`profiles.role = 'admin'` in D1 — defence in depth, never trusting the edge alone.

## Member authentication specification

### Password storage
- **Argon2id** (preferred) or **scrypt**, run inside the Worker.
- Per-user random salt + a server-side **pepper** (`SESSION_PEPPER`, a Worker secret).
- Never log, return, or store plaintext. `password_hash` never leaves the Worker.
- Minimum length 12; reject known-breached passwords (note: Supabase's leaked-password protection
  is currently **disabled**, so this is an improvement).

### Sessions
- On login: generate 32 bytes of CSPRNG entropy → the cookie token; store **only its SHA-256** in
  `sessions.token_hash`. A database leak must not yield usable session tokens.
- Cookie: `HttpOnly; Secure; SameSite=Lax; Path=/` + `Max-Age`.
- Absolute expiry (e.g. 30 days), idle expiry via `last_seen_at` (e.g. 7 days), sliding refresh.
- **Revocation:** `revoked_at` per session; `POST /api/auth/logout-all` revokes every session for
  the user. All sessions are revoked automatically on password reset/change.
- Validate on every authenticated request: exists, not expired, not revoked, user active.

### Email verification
Single-use token (hash stored), 24 h expiry, consumed atomically. Unverified accounts may sign in
but are blocked from applying for membership/ordination.

### Password reset
Single-use token (hash stored), 15–60 min expiry. **Always return the same response whether or not
the email exists** (no account enumeration). On success: consume the token, invalidate all other
outstanding reset tokens, revoke all sessions, notify the user by email.

### Rate limiting (KV `RATE_LIMIT`)
| Endpoint | Limit |
|---|---|
| `POST /api/auth/login` | 5 / 15 min per IP **and** per email |
| `POST /api/auth/signup` | 3 / hour per IP |
| `POST /api/auth/request-password-reset` | 3 / hour per email |
| public forms | 5 / hour per IP |

Plus per-account lockout via `failed_login_count` / `locked_until` with exponential backoff.
All auth endpoints additionally require **Turnstile**, verified server-side.

### Audit logging
`auth.login.success`, `auth.login.failure`, `auth.logout`, `auth.signup`,
`auth.password_reset.request`, `auth.password_reset.complete`, `auth.email_verified`,
`admin.*` → `audit_logs`. Never log passwords, tokens, or hashes.

### Additional rules
- Constant-time comparison for all token/secret checks.
- Generic error messages ("invalid email or password") — never reveal which was wrong.
- CSRF: `SameSite=Lax` plus an origin check on state-changing requests.
- No secret of any kind reaches the browser.

## Cutover options

### Option 1 — Forced password reset (recommended if real users exist)
1. Migrate users (email, verification status, role, timestamps) to D1 with a **random unusable**
   `password_hash`.
2. Announce the change in advance.
3. At cutover, email every user a password-reset link.
4. Login attempts with no valid hash are routed to "set your password".

*Pros:* clean break, no dual-auth complexity, strongest security posture.
*Cons:* every member must act; expect support load and some attrition.

### Option 2 — Lazy migration / dual-read (lower friction, more complexity)
Keep Supabase Auth reachable during a transition window: on login, try D1 first; on miss, verify
against Supabase, and on success **hash the just-supplied plaintext into D1** and never consult
Supabase for that user again. Users migrate silently as they log in.
*Pros:* no forced reset, invisible to users. *Cons:* the Worker briefly handles a plaintext
password against a third party; two auth paths to secure and test; Supabase must stay live for the
whole window; remaining stragglers still need a reset at the end.

### Option 3 — Pre-launch clean start (best case)
If `auth.users` is empty, simply create the schema and go. **Confirm the user count before
choosing anything else.**

## Decision required
- [ ] Confirm `SELECT count(*) FROM auth.users;`
- [ ] Choose Option 1, 2, or 3
- [ ] Choose the HTTP email provider (MailChannels / Resend / Postmark) — required for verification
      and reset mail; Workers cannot use the existing SMTP settings
- [ ] Confirm the admin list for Cloudflare Access
- [ ] Approve Argon2id and the session/expiry parameters above

**No authentication code will be written until these are answered.**

## Post-cutover verification
Signup → verification email → verify → login → session cookie set (HttpOnly/Secure/SameSite) →
protected route reachable → logout → cookie cleared → session revoked in D1 → password reset
end-to-end → all sessions revoked after reset → rate limits trip → Turnstile rejects an absent
token → admin route unreachable without Access → non-admin with a valid session gets 403 on
`/api/admin/*` → audit rows written for each of the above.
