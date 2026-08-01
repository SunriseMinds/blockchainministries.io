# Reellink Cloud Platform — Architecture

Cloudflare-native application framework. Ten packages provide every reusable
backend concern; applications write only domain code.

## Layers
```
┌─ Application ─────────────────────────────────────────────┐
│  routes.js · repositories.js · config.js · email templates │
│  migrations/0002_domain.sql                                │
└───────────────────────┬────────────────────────────────────┘
                        │ imports only
┌───────────────────────▼────────────────────────────────────┐
│  @reellink/api      router · createApp · request context    │
│  @reellink/auth     argon2id · sessions · guards · identity │
│  @reellink/security crypto · turnstile · rate limit · audit │
│  @reellink/core     http envelope · validation · flags · log│
│  @reellink/database D1 access · memoized repositories       │
│  @reellink/files    R2 objects · signed grants              │
│  @reellink/storage  KV · read-through cache                 │
│  @reellink/payments Stripe · webhook verification           │
│  @reellink/email    provider-agnostic transport             │
│  @reellink/xrpl     XRP Ledger client · Workers signer      │
└───────────────────────┬────────────────────────────────────┘
                        │ bindings
        D1 · R2 (public/protected) · KV · Assets · Secrets
```

## Request lifecycle
```
Request
 └─ Worker fetch
     ├─ isApiRequest? ── no ─→ static asset, else SPA fallback (file-like miss = 404)
     └─ yes
         ├─ createContext        requestId, flags, env
         ├─ USE_NEW_API off? ─→ 503 (the whole API is inert)
         ├─ requireSameOrigin    CSRF guard on state-changing methods
         ├─ loadSession          ONE D1 read, memoized per request
         ├─ router match         :param and :param+ patterns
         ├─ route middleware     requireTurnstile / requireAuth / requireAdmin
         └─ handler              validate → repositories → audit → json()
```
Any throw is converted by `errorResponse(err, ctx)` into a typed JSON envelope
carrying `request_id`. Internals are never leaked; 5xx is logged, 4xx is not.

## Platform / application boundary
**Platform owns** the identity and audit tables — `users`, `sessions`,
`email_verification_tokens`, `password_reset_tokens`, `profiles`, `audit_logs` —
shipped as migrations in `@reellink/auth` and `@reellink/security`. Identity is
never re-modelled per app.

**Applications own** their domain tables and compose the platform in:
```js
export const repos = defineRepos((db) => ({
  ...authRepos(db), auditLogs: auditLogs(db), /* domain repos */
}));
```

**The test:** if two applications would write it twice, it belongs in
`packages/`. Nothing in `packages/` references a ministry, a scroll, a quote or
an invoice.

## Security model
Defence in depth, because D1 has no row-level security — every rule is explicit
server-side code.

| Control | Implementation |
|---|---|
| Passwords | Argon2id (pure JS; Workers forbids runtime WASM compilation), OWASP params, PHC-encoded so parameters can be raised without invalidating hashes |
| Sessions | 256-bit token; only its SHA-256 stored, so a DB leak yields no usable sessions |
| Cookies | `HttpOnly; Secure; SameSite=Lax`, absolute + idle expiry, revocation, revoke-all on password reset |
| Authorization | deny-by-default guards; ownership bound to `ctx.session.user_id` in SQL, never client input; `role` not self-writable |
| Admin | Cloudflare Access in front **and** `profiles.role` re-checked in D1 |
| Files | protected objects return **404, not 403**; key traversal rejected before any bucket call |
| Captcha | Turnstile verified server-side; **fails closed** if enabled without a secret |
| Rate limiting | KV fixed window per IP and per account, plus D1 account lockout |
| Webhooks | signature verified over the raw body, constant-time, with replay tolerance |
| Enumeration | signup/reset return identical responses regardless of account existence |
| Audit | append-only; never records secrets |
| Headers | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, HSTS |

## Performance characteristics
- **One session read per request.** `loadSession` is memoized per request.
- **Reads stay reads.** `sessions.touch` writes only when `last_seen_at` is stale.
- **Repositories are memoized** per D1 handle (`defineRepos`), so repeated
  `repos(db)` calls in a handler are free.
- **Bundles pay only for imports.** Megaship ≈ 29 KiB gzipped; Blockchain
  Ministries ≈ 149 KiB because it alone imports the XRPL libraries. An app that
  does not use XRPL never carries it.
- **Argon2id costs ~0.8 s CPU** per hash — fine on paid Workers, **exceeds the
  10 ms free-tier limit**. Confirm the plan before enabling `USE_WORKER_AUTH`.
- **KV read-through caching** (`kv().remember`) for expensive aggregates.

## Feature flags
All default **false**; an unset variable is false, so a fresh deployment is
inert. `USE_NEW_API` (master) · `USE_D1` · `USE_R2` · `USE_KV` ·
`USE_WORKER_AUTH` · `USE_TURNSTILE`. Apps add their own via
`getFlags(env, ['USE_MY_FEATURE'])`.

## Bindings
`DB` (D1) · `PUBLIC_FILES` / `PROTECTED_FILES` (R2) · `RATE_LIMIT` (KV) ·
`ASSETS`. Secrets: `SESSION_PEPPER`, `TURNSTILE_SECRET`, `EMAIL_API_KEY`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, optionally `XRPL_SEED`.
**No secret ever reaches the browser.**

## Reference implementations
| App | Demonstrates |
|---|---|
| **Megaship Express** | greenfield on the platform: quoting, invoicing, Stripe, protected PDFs, KV cache. Adopted an existing production schema unchanged. |
| **Blockchain Ministries** | migration path: domain routes on the platform while Supabase remains live behind a flag. |

## Known constraints
- Workers **forbid runtime WASM compilation** — WASM-based libraries that
  compile from an inlined binary fail at runtime even when they pass under Node.
- Workers **cannot open SMTP sockets** — email must use an HTTP provider.
- The `xrpl` npm package is **not Worker-safe**; `@reellink/xrpl` uses
  ripple-keypairs / ripple-binary-codec with JSON-RPC over fetch.
- D1 has **no row-level security** and no server-side `now()`.
- KV rate limiting is a fixed window and **not atomic** — it can over-count
  under burst, which errs toward blocking, never toward allowing more.
