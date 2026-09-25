# Phase 2E — Production Cutover Checklist

> **HISTORICAL — this cutover completed and Supabase was subsequently retired
> (M10.4).** The data-migration commands below (`scripts/export-supabase.mjs`,
> `scripts/import-d1.mjs`) no longer exist in the repo — the owner ratified a
> no-migration decision (legacy Supabase rows were test data only) instead of
> running this stage. Kept for historical record of the original cutover plan.

## Preview-only prep pass — 2026-09-25 (mission bm-firestore-d1-cutover, RCC job
## 01a0d69c) — DONE
Scope was explicitly preview/local only; no production D1, secret, or Cloudflare
dashboard changes were made or needed.
- [x] Reconciled `migrations/0001..0006` against the docs. Finding: the docs were
      stale, not the schema — `migrations/README.md` still said "NOT APPLIED" and
      listed only `0001`; `SUPABASE_TO_D1_SCHEMA_MAP.md` was the pre-implementation
      proposal. Both updated in place to point at the applied migrations as the
      source of truth (see those files' new status banners). No SQL changed.
- [x] `npm test` — 537/537 pass. `npm run build` — succeeds (Vite build, no errors).
- [x] Verified (read-only `wrangler d1 migrations list ... --remote`, no `--apply`)
      that all 6 migrations are already applied to BOTH
      `blockchain-ministries-db-preview` (`--env preview --remote`) and
      `blockchain-ministries-db` (`--remote`, read-only status check only, no write
      issued against production). Both report "No migrations to apply!". Confirmed
      all 16 application tables exist on the preview DB via
      `SELECT name FROM sqlite_master WHERE type='table'`: `users`, `sessions`,
      `email_verification_tokens`, `password_reset_tokens`, `login_tokens`,
      `memberships`, `ordinations`, `scrolls`, `scroll_requests`, `donations`,
      `donation_intents`, `subscriptions`, `contact_inquiries`, `consultations`,
      `ministers`, `audit_logs`.
- [x] Data import/validation dry-run: **N/A, nothing to run.** `scripts/export-supabase.mjs`
      / `scripts/import-d1.mjs` / `scripts/validate-migration.mjs` referenced by
      Stage 4 below don't exist — confirmed deliberately per this doc's own header
      (no-migration decision, M10.4). The Firestore→D1 `ministers` migration
      (`docs/FIREBASE_INVENTORY.md` "Future migration" section) has no export
      script either; it was explicitly marked "NOT part of Phase 2" and the
      frontend (`src/pages/Ministers.jsx`, `MinisterProfile.jsx`) still reads
      Firestore directly even though the D1 `ministers` table and
      `GET /api/ministers[/:id]` Worker routes already exist and are schema-ready.
      That repoint is real, scoped, low-risk frontend work but is a separate
      feature change outside this prep pass's checklist items — flagged as the
      concrete next task, not done here.

### Remaining production steps (none performed here; each needs the listed approval)
1. **Repoint `Ministers.jsx`/`MinisterProfile.jsx` at `/api/ministers`, drop the
   `firebase` npm dependency and `src/lib/firebase.js`.** Preview/local code change,
   no special approval beyond normal PR review — but out of this job's scope; do
   as its own PR.
2. **Populate the `ministers` D1 table from live Firestore data** (owner must
   export via Firebase Admin SDK or console first — no read access to Firestore
   from this environment). Needs owner-provided export; then a straightforward
   `INSERT` against preview, validated, then production. Production write =
   **prod_migration** approval.
3. **Apply migrations to production D1** — already done (verified, not reapplied
   here). No action needed unless a new migration file is added later, which
   would then need **prod_migration** approval before `--remote` apply.
4. **Remove the `firebase` dependency and Firebase project itself** once (1) and
   (2) ship and soak — **infra_change**/billing approval for deleting the
   Firebase project; simple `npm uninstall firebase` needs none beyond normal PR
   review.
5. Stages 1, 3, 5-12 below remain as originally written and require the
   approvals already called out in each (secrets, XRPL mainnet, Stripe live
   keys, the maintenance-window cutover itself).

---

**Do not begin until every Gate A item is answered.** Each stage is reversible; the flag
flip is the primary rollback lever (`docs/ROLLBACK_PLAN.md`).

---

## Gate A — Blockers that must be resolved first
| # | Item | Why it blocks | Risk |
|---|---|---|---|
| A1 | Row counts + `auth.users` count | Decides schema-only vs full data migration. Run `node scripts/export-supabase.mjs` (read-only, no `--apply`). | R-01 |
| A2 | `supabase db dump --schema public` | No authoritative DDL exists; `migrations/0001` is inferred and must be reconciled **before** it touches production D1. | R-05 |
| A3 | `pg_policies` dump | Unknown whether member PII / donations leak **today** via anon SELECT grants. | R-04 |
| A4 | Audit `admin-approve-*` Edge Functions | Both run `verify_jwt=false`; possible live auth bypass on minting/credentials. | R-03 |
| A5 | Locate scroll & credential PDFs | Blocks all R2 work; `scrolls.pdf_path` is NOT NULL but no storage client exists. | R-08 |
| A6 | Choose email provider | Workers cannot use SMTP. Without it, verification and reset silently do nothing. | R-10 |
| A7 | Choose auth cutover option (1/2/3) | Determines whether every member must reset their password. | R-02 |
| A8 | Confirm Workers plan / CPU limit | Argon2id in pure JS is ~0.8 s CPU; exceeds the 10 ms free-tier limit. | — |
| A9 | Identify `clever-processor` | Unreferenced but ACTIVE Edge Function; may be a live integration. | R-15 |
| A10 | Check Stripe for active subscriptions | `subscriptions` has no D1 equivalent; recurring billing could break silently. | R-09 |
| A11 | Classify scroll visibility | New `visibility` column; guessing could expose member-only documents. | R-19 |
| A12 | Disposition of 4 orphan tables | `credentials`, `ministries`, `requests`, `subscriptions`. | R-16 |

---

## Stage 1 — Configure secrets
```bash
wrangler secret put SESSION_PEPPER          # 32+ random bytes
wrangler secret put EMAIL_API_KEY
wrangler secret put TURNSTILE_SECRET
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
```
Plus vars: `EMAIL_PROVIDER`, `EMAIL_FROM`, `ADMIN_NOTIFY_EMAIL`, `SITE_URL`.
Create the Turnstile widget in the dashboard and put its **site key** in the frontend build.
- [ ] Confirm no secret exists in the repo or in any `VITE_*` variable.

## Stage 2 — Finalize and apply schema
- [ ] Reconcile `migrations/0001_initial_schema.sql` against the A2 dump; amend in place.
- [ ] Apply to preview, re-run the full local suite.
- [ ] `wrangler d1 migrations apply blockchain-ministries-db --remote`
- [ ] Verify all 16 tables exist in production D1.

## Stage 3 — Enable flags one at a time (preview first)
Order matters; verify after each, never enable two at once.
- [ ] `USE_NEW_API=true` → `/api/health` returns flags
- [ ] `USE_D1=true` → public reads work
- [ ] `USE_TURNSTILE=true` → a request without a token is rejected (**fails closed**)
- [ ] `USE_R2=true` → public object serves; protected returns 404 anonymously
- [ ] `USE_WORKER_AUTH=true` → signup → **verification email actually arrives** → login

## Stage 4 — Data migration (dry-run first)
```bash
node scripts/export-supabase.mjs --apply
node scripts/import-d1.mjs --target=preview            # dry-run
node scripts/import-d1.mjs --target=preview --apply
node scripts/validate-migration.mjs --target=preview   # V1..V11 must pass
```
- [ ] All checks pass on preview; investigate any count mismatch before proceeding.
- [ ] Repeat against production D1 only after preview is clean.

## Stage 5 — Files to R2
```bash
node scripts/migrate-files-r2.mjs --source=<dir>          # dry-run
node scripts/migrate-files-r2.mjs --source=<dir> --apply  # hash-verified
```
- [ ] Every object's SHA-256 matches after transfer.
- [ ] **R5**: a protected key is NOT retrievable anonymously.
- [ ] **R6**: a member cannot fetch another member's credential.
- [ ] Backfill `scrolls.r2_key` / `ordinations.credential_r2_key`; original storage untouched.

## Stage 6 — XRPL on testnet (mandatory before mainnet)
- [ ] `XRPL_NETWORK=testnet`, `XRPL_SIGNING_ENABLED=true`, funded testnet seed.
- [ ] `/api/admin/xrpl/status` shows the expected signer address.
- [ ] Approve a test ordination → NFT mints → confirm on a testnet explorer.
- [ ] **Approve twice → second returns 409 and mints nothing** (double-mint guard).
- [ ] Only then consider `XRPL_ALLOW_MAINNET=true`, with a separately funded wallet.

## Stage 7 — Stripe in test mode
- [ ] Test keys; register the webhook at `/api/webhooks/stripe`.
- [ ] Test-card donation → `donations` row created.
- [ ] Replay the same webhook → **no duplicate row** (unique `(provider, provider_id)`).
- [ ] Create real Products/Prices; replace the placeholder tier ids.
- [ ] Switch to live keys only after the above.

## Stage 8 — Frontend integration
- [x] Done, under the actual shipped name `VITE_USE_CLOUDFLARE_API` (this doc originally said
      `VITE_BACKEND` — that name was never implemented; corrected M9.3). Default is unset/false
      (Supabase) for any local/non-CI build; `tools/set-preview-flags.js` now writes it `true`
      deterministically for every Workers Builds CI run, preview and production alike (M9.3 — see
      `docs/ROLLBACK_PLAN.md`).
- [ ] API client mirrors existing call sites. **No visual or route changes.**
- [x] Preview build already runs with `VITE_USE_CLOUDFLARE_API=true` automatically; production build
      now does too as of M9.3 (previously it silently stayed `false` — this was the actual M9.2 gap).

## Stage 9 — Rollback rehearsal (required)
- [ ] Flip preview to Cloudflare mode (automatic), exercise all flows.
- [ ] Roll back — previous Worker version, or `VITE_USE_CLOUDFLARE_API=false` + redeploy — confirm
      full recovery; **record the elapsed time**.
- [ ] `node scripts/rollback-d1.mjs --target=preview --apply` works as expected.

## Stage 10 — Cutover (explicit approval)
- [ ] Announce a maintenance window (< 60 min).
- [ ] Final delta re-sync; re-run validation.
- [ ] **Record the cutover timestamp (UTC)** — rollback reconciliation depends on it.
- [ ] Deploy `main` with production `vars` set (see `wrangler.jsonc` top level, M9.3) — the build
      automatically compiles `VITE_USE_CLOUDFLARE_API=true`, no manual flag step needed.
- [ ] Smoke-test: home, login, dashboard, contact, `/verify/:slug`, donate.
- [ ] Send password-reset emails if Option 1 was chosen.
- [ ] Enable Cloudflare Access on `/admin*`.
- [ ] Monitor error rate; keep the rollback command staged.

## Stage 11 — Soak (≥ 30 days)
Supabase and Firebase stay live and untouched. Monitor auth success rate, form submissions,
webhook delivery, and `audit_logs` growth.

## Stage 12 — Decommission (separate approval)
Only after a clean soak: final Supabase export to cold storage → revoke keys → remove
Supabase code and dependency → pause/delete the project. **This is the only irreversible
step in the migration.** Firebase/ministers is a separate project.

---

## Abort criteria (roll back immediately)
Any validation failure · members unable to log in or reset · cross-account data visible ·
`/api/admin/*` reachable without Access · a protected object served anonymously · any
payment or double-mint anomaly · error rate materially above baseline.
