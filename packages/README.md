# Reellink Cloud Platform packages

Ten workspace packages providing every reusable Cloudflare backend concern.
Start here:
- **`PLATFORM_ARCHITECTURE.md`** — layers, request lifecycle, security model
- **`PLATFORM_BEST_PRACTICES.md`** — rules derived from building two apps
- **`PLATFORM_CHANGELOG.md`** — versions and upgrade policy
- `docs/REELLINK_NEW_APP_GUIDE.md` — create an app in under 30 minutes
- `docs/REELLINK_APP_MIGRATION_PLAN.md` — per-application adoption status

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
