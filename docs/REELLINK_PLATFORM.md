# Reellink Cloud Platform

A Cloudflare-native application framework extracted from Blockchain Ministries, which is now
its reference implementation. Every future Reellink application consumes these packages and
writes **only** business-specific modules.

## Principle
> Platform code is anything two applications would otherwise write twice.
> Business code is anything unique to one application's domain.

Nothing about ministries, scrolls, ordinations or donations exists in `packages/`.
Nothing about password hashing, sessions, routing or rate limiting exists in an app.

## Packages

| Package | Owns | Key exports |
|---|---|---|
| `@reellink/core` | HTTP envelope + error model, input validation, feature flags | `json`, `HttpError`, `errorResponse`, `validate.*`, `getFlags` |
| `@reellink/api` | Router, request context, application bootstrap | `Router`, `createApp`, `createContext`, `isApiRequest` |
| `@reellink/database` | D1 access, parameterized query helpers, pagination | `requireDb`, `q`, `page`, `uuid`, `nowIso` |
| `@reellink/auth` | Argon2id, sessions, cookies, guards, **identity tables** | `hashPassword`, `issueSession`, `requireAuth`, `requireAdmin`, `authRepos` |
| `@reellink/security` | Crypto, Turnstile, rate limiting, **audit tables** | `sha256Hex`, `verifyTurnstile`, `enforce`, `audit`, `defineActions` |
| `@reellink/storage` | KV abstraction (namespaced, read-through cache) | `kv`, `kvAvailable` |
| `@reellink/files` | R2 upload/download/delete/list, signed grants | `upload`, `download`, `remove`, `signKey`, `keys` |
| `@reellink/payments` | Stripe intents, checkout, webhook verification | `createPaymentIntent`, `createCheckoutSession`, `verifyWebhookSignature` |
| `@reellink/email` | Transactional transport (Resend/Postmark/MailChannels) | `send`, `notifyAdmins` |
| `@reellink/xrpl` | XRPL read client + Workers-compatible signer | `config`, `hasEftTrustline`, `signer.signAndSubmit` |

Wired as npm workspaces (`packages/*`), resolved by wrangler's bundler with no extra config.

## The platform/business seam

**Platform owns these tables** (`packages/auth/migrations/0001_identity.sql`,
`packages/security/migrations/0001_audit.sql`): `users`, `sessions`,
`email_verification_tokens`, `password_reset_tokens`, `profiles`, `audit_logs`.
Every app inherits them — identity is not something an app should re-invent.

**Applications own their domain tables** and compose the platform repositories:
```js
export function repos(db) {
  return { ...authRepos(db), auditLogs: auditLogs(db), /* domain repos */ };
}
```

**Audit vocabulary is extensible.** Platform verbs (`auth.*`, `profile.*`, `file.*`,
`payment.*`) merge with app verbs:
```js
export const ACTIONS = defineActions({ SCROLL_PUBLISH: 'scroll.publish' });
```

**Email is split**: the platform owns transport, redaction and provider selection; each app
owns its templates and voice.

## A complete application
```js
import { createApp, createContext, isApiRequest } from '@reellink/api';
import { requireSameOrigin, loadSession } from '@reellink/auth/middleware.js';
import { mountRoutes } from './routes.js';

const app = createApp({ name: 'my-app', routes: mountRoutes,
                        middleware: [requireSameOrigin, loadSession] });

export default {
  async fetch(request, env, executionCtx) {
    const ctx = createContext(request, env, executionCtx);
    if (isApiRequest(ctx.url, app.basePath)) return app.handle(ctx);
    const last = ctx.url.pathname.split('/').pop() || '';
    if (last.includes('.')) return new Response('Not Found', { status: 404 });
    return env.ASSETS.fetch(new Request(new URL('/', ctx.url.origin), request));
  },
};
```
That is the entire backend entry point. Measured: a working adapter bundles to **6.27 KiB
gzipped** including auth, sessions, roles, D1, routing, validation and audit.

## Security properties inherited for free
Argon2id (pure JS — Workers forbids runtime WASM compilation) · session tokens stored only
as SHA-256 · `HttpOnly; Secure; SameSite=Lax` cookies with absolute + idle expiry and
revocation · deny-by-default guards · `role` never self-writable · protected files return
**404 not 403** · key-traversal rejection · Turnstile **fails closed** · rate limiting per IP
and per account · anti-enumeration on signup/reset · webhook signatures verified in constant
time with replay tolerance · append-only audit.

## Feature flags
All default **false**, so a fresh deployment is inert: `USE_NEW_API` (master), `USE_D1`,
`USE_R2`, `USE_KV`, `USE_WORKER_AUTH`, `USE_TURNSTILE`. Apps add their own via
`getFlags(env, ['USE_MY_FEATURE'])`.

## Environment bindings (convention)
`DB` (D1) · `PUBLIC_FILES` / `PROTECTED_FILES` (R2) · `RATE_LIMIT` (KV) · `ASSETS`.
Secrets: `SESSION_PEPPER`, `TURNSTILE_SECRET`, `EMAIL_API_KEY`, `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `XRPL_SEED`. **No secret is ever exposed to the browser.**

## Reference implementation
`worker/` (Blockchain Ministries) now contains only: domain routes, domain repositories,
email templates, and its audit vocabulary. Everything else is platform.
