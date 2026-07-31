# One Inch Apart

A Reellink Cloud Platform application. **No backend code is duplicated** — all
platform capability comes from `@reellink/*`.

Uses platform auth, files and email. An existing Worker (oneinchapart-site) is already deployed in the account.

## What this app owns
- `src/routes.js` — domain endpoints
- `src/repositories.js` — domain SQL
- `migrations/0002_domain.sql` — domain schema
- email templates and audit verbs (business content)

## What the platform provides
auth · sessions · roles · D1/R2/KV · Turnstile · rate limiting · audit ·
email transport · Stripe · XRPL · router · validation · feature flags

## Bring-up
```bash
wrangler d1 create one-inch-apart-db
wrangler kv namespace create one-inch-apart-rate-limit
wrangler r2 bucket create one-inch-apart-public && wrangler r2 bucket create one-inch-apart-protected
# fill the ids into wrangler.jsonc, then:
wrangler d1 execute one-inch-apart-db --file=../../packages/auth/migrations/0001_identity.sql
wrangler d1 execute one-inch-apart-db --file=../../packages/security/migrations/0001_audit.sql
wrangler d1 execute one-inch-apart-db --file=./migrations/0002_domain.sql
```
Then enable flags one at a time: `USE_NEW_API` → `USE_D1` → `USE_TURNSTILE`
→ `USE_R2` → `USE_WORKER_AUTH`.
