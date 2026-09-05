# APP_TEMPLATE — Reellink application skeleton

The **minimum** files required to start a new Reellink application. Copy this
folder, rename, and write only domain code.

## Files
| File | Edit? | Purpose |
|---|---|---|
| `src/worker.js` | rarely | Entry point. Complete as-is — contains no platform logic. |
| `src/config.js` | yes | App name, extra flags, audit verbs, R2 key layout. |
| `src/routes.js` | **yes** | Your domain endpoints. |
| `src/repositories.js` | **yes** | Your domain SQL (the only place it belongs). |
| `migrations/0002_domain.sql` | **yes** | Your domain schema. |
| `wrangler.jsonc` | yes | Bindings + resource ids. |
| `.env.example` | yes | Variable reference. |

Everything else — auth, sessions, roles, D1/R2/KV, Turnstile, rate limiting,
audit, email, Stripe, routing, validation, flags — comes from `@reellink/*`.

## Never write these again
password hashing · session management · cookie flags · role checks · CSRF ·
rate limiting · captcha verification · audit plumbing · the router · the error
envelope · D1 helpers · R2 access control · Stripe signature verification ·
email transport

## Quick start
See `docs/REELLINK_NEW_APP_GUIDE.md` for the full 30-minute walkthrough.
