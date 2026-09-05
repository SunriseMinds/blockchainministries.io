# Creating a Reellink Application

The permanent standard for every Reellink project. Target: a working, secured
backend in **under 30 minutes**.

## Folder structure
```
<repo>/
├── packages/                 # THE PLATFORM — shared, never app-specific
│   ├── core api database auth security storage files payments email xrpl
│   └── */migrations/         # platform-owned schema (identity, audit)
├── APP_TEMPLATE/             # minimum skeleton for a new application
├── apps/<app-slug>/          # one folder per application
│   ├── src/
│   │   ├── worker.js         # entry — needs no edits
│   │   ├── config.js         # name, flags, audit verbs, R2 keys
│   │   ├── routes.js         # DOMAIN endpoints
│   │   ├── repositories.js   # DOMAIN SQL
│   │   └── email-templates.js# DOMAIN copy
│   ├── migrations/0002_domain.sql
│   ├── wrangler.jsonc
│   └── dist/                 # frontend build output (git-ignored)
└── docs/
```

**The rule:** if two applications would write it twice, it belongs in `packages/`.

## Naming conventions
| Thing | Convention | Example |
|---|---|---|
| App slug | kebab-case, matches the Worker name | `megaship-express` |
| D1 database | `<slug>-db` (or an existing name, adopted) | `megaship-express-leads` |
| D1 preview | `<slug>-db-preview` | `megaship-express-db-preview` |
| R2 buckets | `<slug>-public`, `<slug>-protected` | `megaship-express-public` |
| KV namespace | `<slug>-rate-limit` | `megaship-express-rate-limit` |
| Bindings | fixed platform names | `DB`, `PUBLIC_FILES`, `PROTECTED_FILES`, `RATE_LIMIT`, `ASSETS` |
| Migrations | `0001` platform, `0002+` domain | `0002_domain.sql` |
| Audit verbs | `entity.action`, lower snake | `invoice.created` |
| API routes | `/api/<plural-noun>`; admin under `/api/admin/*` | `/api/quotes` |
| Table names | plural snake_case | `scroll_requests` |
| Money | integer minor units in APIs (`amount_cents`) | — |

## Environment variables
Full reference: `APP_TEMPLATE/.env.example`.

**Flags** (Worker vars; unset === false): `USE_NEW_API` (master), `USE_D1`,
`USE_R2`, `USE_KV`, `USE_WORKER_AUTH`, `USE_TURNSTILE`.

**Config vars:** `SITE_URL`, `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_FROM_NAME`,
`ADMIN_NOTIFY_EMAIL`, `REQUIRE_CF_ACCESS`.

**Secrets** (`wrangler secret put`): `SESSION_PEPPER`, `TURNSTILE_SECRET`,
`EMAIL_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and for XRPL apps
`XRPL_SEED` (+ `XRPL_SIGNING_ENABLED`, `XRPL_ALLOW_MAINNET`).

**Public frontend:** `VITE_TURNSTILE_SITE_KEY`, `VITE_STRIPE_PUBLISHABLE_KEY`.
Anything `VITE_*` ends up in the browser bundle — **never** put a secret there.

## Migration process
Order is fixed. Platform schema always precedes domain schema:
```bash
wrangler d1 execute <db> --file=packages/auth/migrations/0001_identity.sql
wrangler d1 execute <db> --file=packages/security/migrations/0001_audit.sql
wrangler d1 execute <db> --file=apps/<slug>/migrations/0002_domain.sql
```
Rules:
- Domain tables reference `users(id)`. Never re-model identity.
- Migrations are **append-only**: add `0003_*.sql`, never edit an applied file.
- Adopting an existing database? Write the domain migration with
  `CREATE TABLE IF NOT EXISTS` so applying it to production is a safe no-op —
  this is exactly how Megaship Express kept its live records.
- Apply to preview first, run the suite, then production.

---

## New application in under 30 minutes

**1. Scaffold (2 min)**
```bash
cp -r APP_TEMPLATE apps/<slug> && cd apps/<slug>
# replace <APP_NAME> and <app-slug> in src/ and wrangler.jsonc
```

**2. Provision (5 min)**
```bash
wrangler d1 create <slug>-db
wrangler d1 create <slug>-db-preview
wrangler kv namespace create <slug>-rate-limit
wrangler r2 bucket create <slug>-public
wrangler r2 bucket create <slug>-protected
```
Paste the returned ids into `wrangler.jsonc`.

**3. Schema (5 min)** — run the three migrations above against the preview db.

**4. Domain code (10 min)** — edit `migrations/0002_domain.sql`,
`repositories.js`, `routes.js`, `config.js`. Mount platform auth in
`mountRoutes`:
```js
mountAuthRoutes(r, { templates: authTemplates });
```

**5. Secrets (3 min)**
```bash
wrangler secret put SESSION_PEPPER   # 32+ random bytes
```

**6. Verify (5 min)**
```bash
wrangler dev --local --config wrangler.test.jsonc --persist-to .wrangler-test
curl localhost:8787/api/health
```

**7. Deploy** — `wrangler deploy`, then enable flags **one at a time**:
`USE_NEW_API` → `USE_D1` → `USE_TURNSTILE` → `USE_R2` → `USE_WORKER_AUTH`,
verifying between each.

You get for free, without writing a line: signup, login, logout, sessions,
email verification, password reset, roles, CSRF, rate limiting, captcha
verification, audit logging, R2 access control, Stripe, email transport,
routing, validation, feature flags.

---

## Upgrading platform packages safely

Because packages are workspace-linked, a platform change reaches every app on
the next deploy. Treat it like any shared library:

1. **Change the platform** and run the full suite of **every** app that consumes
   it — currently Blockchain Ministries and Megaship Express.
2. **Deploy one app first** and soak it before deploying the rest.
3. **Breaking changes** — anything that alters identity tables, cookie
   semantics, guard behaviour, the error envelope, or a route contract:
   - bump the **minor** version while pre-1.0,
   - write a migration note in `docs/PLATFORM_CHANGELOG.md`,
   - update every app in the same commit so the workspace is never inconsistent.
4. **Never edit an applied migration.** Add a new numbered file.
5. **Security-relevant changes** (hashing parameters, session TTL, rate limits)
   need an explicit review before deploy. Password hashes are self-describing
   PHC strings, so hashing parameters can be raised without invalidating
   existing credentials.

### Regression gate before any platform deploy
```
For each app:  npm run build && wrangler deploy --dry-run && <app test suite>
Then:          confirm production defaults — flags off, /api/* returns 503
```

## Versioning strategy
Packages are `0.1.0`, consumed via workspace links, so every app tracks `main`.
That is fine while one team ships everything, and it is exactly why the
regression gate above is mandatory.

**Move to pinned versions when either becomes true:** a third application
reaches production, or two applications need to deploy on independent
schedules.

At that point:
- adopt semver per package and tag releases (`@reellink/auth@0.2.0`),
- pin apps to exact versions in their own `package.json`,
- publish to a private registry (or consume via git tags),
- keep the workspace for local development, pins for deploys.

Pre-1.0 rules: **minor** = breaking, **patch** = additive or fix. Reaching
`1.0.0` should mean the identity schema and guard contracts are considered
stable.
