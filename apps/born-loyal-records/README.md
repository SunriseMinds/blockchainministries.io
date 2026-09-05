# Born Loyal Records

A Reellink Cloud Platform application. **No backend code is duplicated** — all
platform capability comes from `@reellink/*`.

Label catalogue and media. Heavy R2 use; an existing bucket (bornloyalrecords-media) already exists.

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
wrangler d1 create born-loyal-records-db
wrangler kv namespace create born-loyal-records-rate-limit
wrangler r2 bucket create born-loyal-records-public && wrangler r2 bucket create born-loyal-records-protected
# fill the ids into wrangler.jsonc, then:
wrangler d1 execute born-loyal-records-db --file=../../packages/auth/migrations/0001_identity.sql
wrangler d1 execute born-loyal-records-db --file=../../packages/security/migrations/0001_audit.sql
wrangler d1 execute born-loyal-records-db --file=./migrations/0002_domain.sql
```
Then enable flags one at a time: `USE_NEW_API` → `USE_D1` → `USE_TURNSTILE`
→ `USE_R2` → `USE_WORKER_AUTH`.
