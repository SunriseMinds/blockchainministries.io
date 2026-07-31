# Reellink Cloud Platform packages

Ten workspace packages providing every reusable Cloudflare backend concern.
See `docs/REELLINK_PLATFORM.md` for the architecture and
`docs/REELLINK_APP_MIGRATION_PLAN.md` for how applications adopt them.

| Package | Responsibility |
|---|---|
| `core` | HTTP envelope + errors, validation, feature flags |
| `api` | Router, request context, `createApp()` |
| `database` | D1 access + parameterized query helpers |
| `auth` | Argon2id, sessions, cookies, guards, identity tables |
| `security` | Crypto, Turnstile, rate limiting, audit |
| `storage` | KV abstraction |
| `files` | R2 objects + signed access |
| `payments` | Stripe |
| `email` | Transactional transport |
| `xrpl` | XRPL client + Workers signer |

**Rule:** nothing business-specific belongs here. If only one application would
ever use it, it belongs in that application.
