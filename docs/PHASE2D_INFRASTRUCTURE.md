# Phase 2D — Cloudflare Infrastructure & Migration Tooling

**Status: INFRASTRUCTURE CREATED, PRODUCTION UNTOUCHED.**
No production data migrated, no authentication switched, Supabase and Firebase intact,
all feature flags still off. `/api/*` returns 503 in production.

## 1. Resources created (real, in the live Cloudflare account)

| Resource | Name | Id | Region |
|---|---|---|---|
| D1 (production) | `blockchain-ministries-db` | `1aebe562-6eff-4910-b5c0-450bcc1ea19d` | ENAM |
| D1 (preview) | `blockchain-ministries-db-preview` | `88e30d07-1939-495a-8cf4-3088a2e8ef81` | ENAM |
| R2 (public) | `bm-public` | — | ENAM |
| R2 (protected) | `bm-protected` | — | ENAM |
| KV (production) | `bm-rate-limit` | `572ec235d6c94962aa265295879d837c` | — |
| KV (preview) | `bm-rate-limit-preview` | `c9e5125bf97f47d49c7bf53e1644ef98` | — |

ENAM was chosen to sit near the existing `us-east-2` Supabase project.

### Schema state
- **Preview D1: all 16 tables applied and verified.**
- **Production D1: intentionally left EMPTY.** The schema is not applied there until the
  Supabase DDL is reconciled (risk **R-05**), so `migrations/0001` can still be amended
  before it ever touches a database that will hold real data.

## 2. Bindings (in `wrangler.jsonc`, verified by `wrangler deploy --dry-run`)
```
env.DB              -> D1  blockchain-ministries-db (preview id used by wrangler dev)
env.PUBLIC_FILES    -> R2  bm-public
env.PROTECTED_FILES -> R2  bm-protected
env.RATE_LIMIT      -> KV  bm-rate-limit
env.ASSETS          -> static assets (existing)
```
Bindings only make resources **reachable**. No feature flag is set in `wrangler.jsonc`, and
an absent flag is false — so production still serves the SPA and still uses Supabase.

## 3. Migration tooling (`scripts/`)
All **dry-run by default**; writing requires `--apply`.

| Script | Purpose |
|---|---|
| `export-supabase.mjs` | READ-ONLY export. Without `--apply` it only prints row counts — the safe way to settle **R-01** (does production data exist?). |
| `import-d1.mjs` | Transform + import. Preserves uuids verbatim (no id remapping), splits Supabase's overloaded rows into application tables. |
| `validate-migration.mjs` | V1–V11 checks; exits non-zero so it can gate a cutover. |
| `rollback-d1.mjs` | Deletes only journal-recorded ids, reverse dependency order. |
| `migrate-files-r2.mjs` | Uploads then **re-downloads and re-hashes** every object; a mismatch is never marked done. |

**Resumability & duplicate detection:** an append-only JSONL journal in `.migration/`
records every unit of work. `--resume` skips completed keys; `INSERT OR IGNORE` plus the
journal means a rerun can never double-insert. **Rollback logging** is the same journal, so
a rollback affects exactly what this tooling wrote — never rows created by real users.

`.migration/` is git-ignored: exports contain member PII.

## 4. XRPL signer — implemented and proven to run in Workers
The `xrpl` npm package is not Worker-safe (assumes Node networking/websockets). The signer
uses `ripple-keypairs` + `ripple-binary-codec` + `ripple-address-codec` with JSON-RPC over
`fetch()`.

**Evidence it is correct and runs:**
- Key derivation matches the **official XRPL test vector**
  (`snoPBrXtMeMyMHUVTgbuqAfg1SUTb` → `rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh`).
- The same derivation was executed **inside workerd** via `/api/admin/xrpl/status`,
  returning the expected address — so the libraries genuinely load and run in the runtime.

**Two independent gates before any transaction:**
1. `XRPL_SIGNING_ENABLED=true` **and** an `XRPL_SEED` secret must be present.
2. Mainnet additionally requires `XRPL_ALLOW_MAINNET=true`; the default network is testnet.

**NOT DONE — testnet submission was not validated.** Outbound network is blocked in this
environment, so no transaction was submitted to XRPL testnet. Signing correctness is proven
offline; **on-ledger behaviour is unverified** and must be validated on testnet before
mainnet is ever enabled.

## 5. Validation run (local `wrangler dev` + real D1)
14/14 checks passed: health, login/profile/anon-401, D1 write + admin read, R2 404/401/404
(non-owner gets 404, not 403), KV rate limiting → 429, Turnstile gate, Stripe failing
*closed* with 503 rather than crashing, placeholder tier price rejected with 400, XRPL
diagnostics, and consultation email reporting honestly.

Production defaults re-verified: SPA routes 200, missing assets 404, `/api/*` **503**.

## 6. Secrets still required (set with `wrangler secret put`, never committed)
| Secret | Needed for | Blocking? |
|---|---|---|
| `EMAIL_PROVIDER` + `EMAIL_API_KEY` | verification, reset, notifications | **YES — blocks auth cutover** |
| `SESSION_PEPPER` | password hashing / file signing | **YES — blocks auth cutover** |
| `TURNSTILE_SECRET` (+ site key in frontend) | public form protection | **YES — blocks enabling Turnstile** |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | payments | blocks payment cutover |
| `XRPL_SEED` (+ `XRPL_SIGNING_ENABLED`) | credential minting | blocks minting |
| `XRPL_ISSUER_ADDRESS` | EFT trustline checks | non-blocking |
| `ADMIN_NOTIFY_EMAIL` | admin notifications | non-blocking |
| `SITE_URL` | absolute links in email | non-blocking |

**Turnstile cannot be created from here** — no API/MCP tool exists for it. Create the widget
in the dashboard (Turnstile → Add site → `blockchainministries.io`), then store the secret.

## 7. Not done in this phase (by instruction)
No production data migrated · no authentication switched · Supabase not deleted · Firebase
not deleted · existing storage untouched · no cutover · flags still off.
