# Reellink Cloud Platform — Changelog

Pre-1.0 semantics: **minor** = breaking, **patch** = additive or fix.
All packages are versioned and released together.

---

## [0.2.0] — Production hardening

### Performance
- **`loadSession` is now idempotent per request.** It previously ran twice on
  every authenticated request — once in the application pipeline, again inside
  `requireAuth` — costing **two D1 reads per request**. Now one.
- **`sessions.touch` no longer writes on every session check.** It updates
  `last_seen_at` only when already stale (default 5 min), so the session-check
  path is a read again rather than a read+write.
- **`defineRepos()` memoizes repositories per D1 handle** (WeakMap). Route
  files called `repos(db)` 13–18 times per request, rebuilding every repository
  object each time. The call signature is unchanged.

### Observability
- **Structured JSON logging** (`@reellink/core/logger.js`) with levels honouring
  `LOG_LEVEL`, plus `redactEmail`, `redact` and `timed` for slow-operation
  warnings. Never log secrets.
- **Request-id correlation.** Every context carries a `requestId` (CF-Ray when
  present) that appears in logs *and* in error responses, so a user-reported
  failure maps to an exact log line.
- `errorResponse(err, ctx)` logs 5xx and leaves 4xx unlogged as normal traffic.

### Security
- Default API headers hardened: added `X-Frame-Options: DENY`,
  `Permissions-Policy` and `Strict-Transport-Security` alongside the existing
  `X-Content-Type-Options` and `Referrer-Policy`.
- **No CSP on API responses by design** — an API returns JSON, and a CSP correct
  for one app's frontend is wrong for another's. Frontend CSP belongs in each
  application's `public/_headers`.

### Developer experience
- `validate.statusFilter()` and `validate.listQuery()` replace a status-filter
  pattern that was duplicated across both applications.

### Compatibility
**No breaking changes.** Both applications pass unchanged.
`errorResponse(err)` still works without a context; `repos(db)` keeps its
signature; `touch(id)` keeps its signature with a new optional argument.

---

## [0.1.0] — Initial extraction

- Ten packages extracted from Blockchain Ministries: `core`, `api`, `database`,
  `auth`, `security`, `storage`, `files`, `payments`, `email`, `xrpl`.
- **Platform owns identity and audit schema** (`users`, `sessions`, token
  tables, `profiles`, `audit_logs`) via package-shipped migrations.
- `createApp()` / `createContext()` application bootstrap; dependency-free
  router with `:param` and `:param+` patterns.
- Argon2id password hashing — switched from a WASM library to pure JS after
  discovering **Workers forbid runtime WASM compilation**; the WASM build
  passed under Node and failed in workerd.
- Sessions store only a SHA-256 of the token; `HttpOnly; Secure; SameSite=Lax`
  cookies with absolute + idle expiry and revocation.
- Deny-by-default guards; protected R2 objects return 404 rather than 403.
- Turnstile fails closed; KV rate limiting per IP and per account.
- Extensible audit vocabulary via `defineActions()`.
- Email transport is platform; templates are application content.
- XRPL signer using ripple-keypairs / ripple-binary-codec (the `xrpl` package is
  not Worker-safe), verified against the official XRPL test vector and confirmed
  to execute inside workerd. Double-gated; mainnet blocked by default.
- **Auth routes moved into `@reellink/auth`** after Megaship Express revealed
  they lived in application code and would have been duplicated by every new app.
- `APP_TEMPLATE/` — seven files that constitute a complete application.

---

## Upgrade policy
1. Change the platform, then run **every** consuming application's suite.
2. Deploy one application first and soak before the rest.
3. Breaking changes (identity tables, cookie semantics, guard behaviour, error
   envelope, route contracts) require a changelog entry here and updating every
   app in the same commit.
4. Never edit an applied migration — add a new numbered file.
5. Security-relevant changes (hashing parameters, session TTL, rate limits) need
   explicit review. Password hashes are self-describing PHC strings, so hashing
   parameters can be raised without invalidating existing credentials.
