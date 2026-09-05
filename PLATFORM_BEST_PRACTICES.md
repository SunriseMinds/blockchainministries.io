# Reellink Cloud Platform — Best Practices

Rules derived from building two applications on this platform. Most exist
because something actually went wrong.

## The boundary
**If two applications would write it twice, it belongs in `packages/`.**

Symptoms that something is in the wrong place:
- an app re-implements auth, sessions, hashing or captcha → move to platform
- a package mentions a scroll, a quote or an invoice → move to the app
- copying a file between apps → it was platform code all along

> This is not hypothetical. Authentication routes originally sat in Blockchain
> Ministries' app code; the second application exposed it immediately.

## Authorization
- **Never hand-roll.** Use `requireAuth`, `requireVerifiedEmail`, `requireAdmin`.
- **Bind ownership in SQL** to `ctx.session.user_id`. Never trust a client id.
- **`role` is never self-writable.** Profile updates must not accept it.
- **Return 404, not 403**, when confirming existence leaks information
  (invoice numbers, credential ids, protected object keys).
- Admin endpoints get **two** layers: Cloudflare Access *and* a D1 role check.
  The edge is never trusted alone.

## Database
- All SQL lives in `repositories.js`. Handlers contain none.
- Every query is parameterized. Never build SQL from user input.
- Use `defineRepos()` so repeated `repos(db)` calls are free.
- **Make state transitions idempotent.** Guard on the current state:
  ```sql
  UPDATE invoices SET status='sent' WHERE invoice_number=? AND status='draft'
  ```
  If it changes 0 rows, the caller must not re-run side effects. This is what
  makes approvals safe to retry and prevents double-minting and double-charging.
- Migrations are append-only. Adopting an existing database? Use
  `CREATE TABLE IF NOT EXISTS` so applying to production is a safe no-op.
- **Adopt a real schema rather than imposing a convention on live data.**
  Megaship Express kept its INTEGER autoincrement keys and business identifiers
  because rewriting live records to match a convention is not worth it.

## Performance
- Do not re-resolve the session; `loadSession` is already memoized per request.
- Do not write on a read path. If you must record activity, throttle it.
- Cache expensive aggregates with `kv().remember(key, ttl, fn)`.
- Import only what you need — bundles pay per import. Megaship is ~29 KiB
  gzipped; Blockchain Ministries is ~149 KiB only because it imports XRPL.
- Use `timed(ctx, name, fn)` to surface slow operations rather than guessing.
- Defer non-critical work with `ctx.waitUntil` (audit already does).

## Secrets
- Secrets live in `wrangler secret put`. Never in a config file, never in git.
- **`VITE_*` ends up in the browser.** Only public values may use that prefix.
- Never log, return or echo a secret — not even a public test seed. No seed of
  any kind belongs in a committed file.
- Local test configs use a **different worker name** so an accidental deploy
  cannot overwrite production.

## Error handling
- Throw typed errors (`badRequest`, `notFound`, `conflict`, …). The platform
  shapes the response.
- Never leak internals. Messages are for users; details go to logs.
- Every error response carries `request_id` — ask users for it in support.
- **Fail closed on security controls.** Turnstile enabled without a secret
  returns 503 rather than silently allowing traffic.
- A non-critical failure must not roll back the primary action — record it and
  continue (a failed mint does not un-approve an ordination).

## Public endpoints
Order matters: **captcha → rate limit → validate → write → audit**.
Every public write needs all four. Megaship's quote endpoint previously had
none of them.

## Logging
- Use `log.info/warn/error(ctx, msg, fields)` — structured JSON, not free text.
- Never log passwords, tokens, hashes, keys or full PII. Use `redactEmail`.
- Log decisions and failures, not successful routine traffic.

## Audit
- Every privileged or security-relevant action writes a row.
- Verbs are `entity.action`; app verbs come from `defineActions()`.
- Audit is append-only and best-effort — it must never break a user request.

## Feature flags
- Everything new ships behind a flag, default **false**.
- Enable **one at a time**, verifying between each.
- An unset variable is false, so a fresh deployment is inert by construction.

## Testing
Before any platform deploy, for **every** consuming app:
```
npm run build && wrangler deploy --dry-run && <app suite>
```
then confirm production defaults: flags off, `/api/*` → 503, SPA 200, missing
asset 404.

Test the **negative** cases — they are where security lives: anonymous → 401,
wrong role → 403, non-owner → 404, replayed webhook → no duplicate, repeated
transition → 409, traversal → rejected.

## Platform constraints to design around
| Constraint | Consequence |
|---|---|
| Workers forbid runtime WASM compilation | A library that works under Node can still fail in workerd. **Test in the real runtime.** |
| Workers cannot open SMTP sockets | Email must use an HTTP provider |
| D1 has no row-level security | Authorization is explicit code, every time |
| D1 has no server-side `now()` | Timestamps are set in the Worker as ISO-8601 UTC |
| KV rate limiting is not atomic | May over-count under burst — errs toward blocking |
| Argon2id ≈ 0.8 s CPU (pure JS) | Exceeds the 10 ms free-tier limit; confirm the plan |

## The meta-rule
**Verify in the real environment; do not infer from a similar one.** Two of the
most consequential findings in this platform — WASM being disallowed in
workerd, and a production database that reported `num_tables: 0` while holding
live records — would have been missed by reasoning alone.
