# Phase 2C — Cloudflare Backend Implementation

**Status: FRAMEWORK COMPLETE, INERT IN PRODUCTION.**
No Cloudflare resources were created, no data migrated, no authentication switched,
Supabase and Firebase untouched. Every flag defaults to **false**, so `/api/*` returns 503
and the live site behaves exactly as before.

## Feature flags (all default false)
| Flag | Effect when true |
|---|---|
| `USE_NEW_API` | master switch — mounts `/api/*` at all |
| `USE_D1` | allows D1 reads/writes |
| `USE_R2` | allows R2 object routes |
| `USE_WORKER_AUTH` | allows Worker-issued sessions |
| `USE_TURNSTILE` | enforces server-side captcha verification |

An unset variable is false. Production `wrangler.jsonc` sets **none** of them.

## Layout
```
worker/
  index.js                 SPA + /api dispatch (SPA logic unchanged)
  config/flags.js          feature flags
  lib/    http, validate, db, crypto, password, cookies, session,
          ratelimit, turnstile, audit, r2, email, stripe, xrpl
  middleware/  auth.js (requireAuth/requireVerifiedEmail/requireAdmin/CSRF)
               turnstile.js
  db/repositories.js       ALL SQL lives here, parameterized
  routes/  router.js, index.js, auth.js, public.js, admin.js, files.js
migrations/0001_initial_schema.sql   16 tables (NOT applied)
wrangler.test.jsonc        local-only testing config (safe worker name)
```

## ⚠️ Platform constraint discovered by testing — Argon2id
**Cloudflare Workers forbids runtime WebAssembly compilation.** A WASM Argon2 library
(`hash-wasm`) verified fine under Node but failed in workerd with:

```
CompileError: WebAssembly.compile(): Wasm code generation disallowed by embedder
```

Workers only accepts WASM as a statically imported module, not compiled from an inlined
binary at runtime. **Node success does not imply Workers success** — this was caught only
by running the real runtime.

**Resolution:** `@noble/hashes` pure-JavaScript Argon2id, same OWASP parameters
(m = 19456 KiB, t = 2, p = 1, 32-byte output, 16-byte salt), PHC-encoded:
`$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`.

**Cost to be aware of:** ~0.8 s CPU per hash (pure JS) vs ~0.2 s (WASM). Fine on paid
Workers (multi-second CPU budget) but it **will exceed the 10 ms free-tier CPU limit**.
Confirm the Workers plan before enabling `USE_WORKER_AUTH`. Lower-memory OWASP variants
(m=9216,t=4) are available if the cost needs tuning; the PHC format lets parameters change
without invalidating existing hashes.

## Security properties implemented
- **Passwords** — Argon2id, per-user random salt, never logged or returned.
- **Sessions** — 256-bit random token; only its SHA-256 is stored, so a database
  disclosure yields no usable sessions. `HttpOnly; Secure; SameSite=Lax; Path=/`,
  absolute (30 d) + idle (7 d) expiry, revocation, and revoke-all on password reset.
- **Authorization** — deny-by-default middleware. Ownership filters bind
  `ctx.session.user_id` into SQL; a client-supplied user id is never trusted.
  `requireAdmin` re-checks `profiles.role` in D1 even behind Cloudflare Access.
  `role` is not accepted by the profile update route (escalation guard).
- **Protected files** — return **404, not 403**, so existence is not confirmed;
  key traversal rejected before any bucket call.
- **Idempotent approvals** — the status transition happens first and changes 0 rows on
  retry, so XRPL minting and notification emails can never run twice (risk R-11).
- **Webhooks** — Stripe signature verified over the raw body with replay tolerance and
  constant-time compare; donations deduped by unique `(provider, provider_id)`.
- **Anti-enumeration** — signup and password-reset return identical responses whether or
  not the address exists; login errors never say which field was wrong.
- **Rate limiting** — KV fixed-window per IP and per account, plus D1 account lockout.
- **Turnstile** — always server-side; **fails closed** if enabled without a secret.
- **Audit** — append-only rows for every privileged action; never logs secrets.

## Verified locally (`wrangler dev --local` + real D1)
| Test | Result |
|---|---|
| `0001_initial_schema.sql` applies | ✅ 45 statements |
| signup → login → session → logout | ✅ |
| cookie flags `HttpOnly; Secure; SameSite=Lax; Max-Age` | ✅ |
| wrong password | ✅ 401, generic message |
| weak password | ✅ 400 |
| duplicate signup | ✅ 202, does not reveal existence |
| unauthenticated `/api/profile` | ✅ 401 |
| member hitting `/api/admin/*` | ✅ 403 |
| anonymous hitting `/api/admin/*` | ✅ 401 |
| protected file, no session | ✅ 401 |
| protected file, non-owner | ✅ 404 (not 403) |
| path traversal | ✅ rejected |
| membership apply with unverified email | ✅ 403 |
| **approve twice** | ✅ 1st ok, 2nd/3rd **409**, DB approved once, **exactly 1 audit row** |
| rate limiter | ✅ tripped at 3 signups/hour/IP |
| session after logout | ✅ `authenticated:false` |
| **production defaults** | ✅ SPA 200, missing asset 404, `/api/*` **503** |

## Known gaps (documented, not guessed)
1. **Email provider not chosen** (R-10). Workers cannot use the existing SMTP settings.
   `send()` returns `{sent:false}` and logs instead of throwing, so flows are testable —
   but **no email is actually delivered**. Verification and reset are unusable until
   `EMAIL_PROVIDER` + `EMAIL_API_KEY` are set.
2. **XRPL minting not implemented.** `mintCredentialNft()` throws 501 by design.
   The `xrpl` npm package assumes Node APIs and is not Worker-compatible as-is; a
   Worker-safe signer is an **open decision**. Approval routes report
   `xrpl_minting: "not_configured"` rather than pretending to mint.
3. **Stripe is framework only.** No keys, no registered webhooks. The frontend's tier
   price IDs (`price_supporter_tier`, …) are placeholders that exist in no Stripe account.
4. **Turnstile** needs a widget + `TURNSTILE_SECRET` before `USE_TURNSTILE` can be enabled.
5. **`/api/ministers` reads D1**, which stays empty until the Firebase directory is
   migrated (a separate, later project). Firebase remains the live source.
6. **Legacy Supabase tables** (`credentials`, `ministries`, `requests`, `subscriptions`)
   have no D1 equivalent pending the disposition decision (R-16/R-09).
7. **Schema unreconciled** against a real Supabase DDL dump (R-05) — `0001` may still change.

## Local testing
```bash
npm ci && npm run build
wrangler d1 migrations apply blockchain-ministries-db --local \
  --config wrangler.test.jsonc --persist-to .wrangler-test
wrangler dev --local --config wrangler.test.jsonc --persist-to .wrangler-test
curl localhost:8788/api/health
```
`wrangler.test.jsonc` uses a **different worker name** (`blockchainministries-io-localtest`)
so an accidental deploy cannot overwrite production. It holds no real secrets.
