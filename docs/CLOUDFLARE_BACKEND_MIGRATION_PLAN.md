# Cloudflare Backend Migration Plan — Blockchain Ministries

> **Status: DESIGN / PROPOSAL.** No backend code has been written and nothing in
> production has been changed. This plan maps every current Supabase (and
> Firebase) dependency onto the target Cloudflare stack for review and approval
> before any implementation (Phase 2C) begins.

## 1. Current architecture (as shipped in the Hostinger export)

| Concern | Current provider | Notes |
|---|---|---|
| Frontend | React 18 + Vite SPA | Static build (`dist/`), no server |
| Auth | Supabase Auth | Email/password, session in browser |
| Relational data | Supabase Postgres | 7 tables (see schema map) |
| Server logic | Supabase Edge Functions | 6 functions (see function map) |
| Ministers directory | Firebase Firestore | `Ministers.jsx`, `MinisterProfile.jsx` |
| Payments | Stripe, PayPal, Coinbase Commerce | Publishable keys in frontend; secrets server-side |
| On-chain | XRP Ledger / Xaman (XUMM) | Trustline + token; signing is server-side only |

## 2. Target architecture (Cloudflare-native)

| Concern | Target | Binding |
|---|---|---|
| Frontend | Cloudflare Pages | — |
| Server APIs | Pages Functions / Workers | route handlers under `/functions` or a Worker |
| Relational data | Cloudflare **D1** | `DB` binding |
| Files (scrolls, PDFs, images, protected docs) | Cloudflare **R2** | `R2` binding |
| Form abuse protection | Cloudflare **Turnstile** | site key (public) + secret (server) |
| Auth | CF Access (admins) + managed/app auth (members) | see `AUTH_MIGRATION_OPTIONS.md` |
| Ministers directory | Firebase (temporary) | unchanged until separately migrated |

## 3. Guiding principles

1. **Parallel, not in-place.** Build the Cloudflare backend alongside the live
   Supabase system. Do not modify or delete Supabase tables, users, functions,
   buckets, or secrets during build/validate.
2. **Feature-flagged frontend.** A single config switch (`VITE_BACKEND=supabase|cloudflare`)
   selects which client the app talks to, so the Cloudflare backend can be tested
   on a temporary `*.pages.dev` domain without affecting production users.
3. **No secret ever reaches the browser.** All signing/keys (Stripe secret, SMTP,
   XRPL seed, Coinbase, service role) live only in Worker secrets.
4. **Reversible at every step.** See `MIGRATION_ROLLBACK_PLAN.md`.
5. **Validate before cutover.** Record counts and relationships must match.

## 4. Workstreams & sequence

1. **Schema** → author D1 migrations from `SUPABASE_TO_D1_SCHEMA_MAP.md`.
2. **Auth** → owner selects an option from `AUTH_MIGRATION_OPTIONS.md` (approval gate).
3. **APIs** → port the 6 Edge Functions per `EDGE_FUNCTION_TO_WORKER_MAP.md`.
4. **Storage** → provision R2 per `R2_STORAGE_PLAN.md`.
5. **Data** → export/transform/import per `DATA_EXPORT_AND_IMPORT_PLAN.md`.
6. **Turnstile** → add to public forms (contact, scroll request, apply/join, auth).
7. **Validate** → counts, relationships, end-to-end flow tests on preview domain.
8. **Cutover** → only on explicit approval (Phase 2D).

## 5. Key risks (summary; details in each sub-doc)

- **Auth is not copy-paste.** Supabase Auth password hashes and JWT model cannot
  simply be moved into D1. This is the highest-risk area — see auth options.
- **On-chain approval side effects.** `admin-approve-*` functions likely mint/record
  XRPL data (`nft_token_id`, `chain_tx_hash`). These must run server-side with the
  real signing seed, never client-side, and must be idempotent.
- **Unknown exact DDL.** Column lists here are **inferred from frontend usage**; the
  authoritative schema must be dumped from the live Supabase project and reconciled.
- **Firestore dependency** remains until the ministers directory is migrated separately.

## 6. What is explicitly NOT in this phase

- No D1/R2/Worker resources created.
- No data exported or imported.
- No Supabase changes.
- No cutover, no DNS change, no Hostinger change.
