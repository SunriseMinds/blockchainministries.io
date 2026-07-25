# Migration Rollback Plan — Blockchain Ministries

> **Status: DESIGN / PROPOSAL.** Ensures the migration is reversible at every step.
> Supabase and Hostinger remain fully operational until the owner approves cutover.

## Safety invariants
1. Supabase (DB, Auth, Edge Functions, buckets, secrets) is **not modified or
   deleted** during build/validate/cutover-prep.
2. The live Hostinger deployment is **not changed** and stays available as a fallback.
3. DNS is **not changed** until after a tested, approved Cloudflare deployment.

## Feature flag (the core rollback lever)
A single frontend switch selects the backend:
```
VITE_BACKEND = "supabase"   # current production behavior (default)
VITE_BACKEND = "cloudflare" # new D1/Workers backend (preview/testing)
```
- The Supabase client and the new API client both remain in the codebase during
  transition; the flag chooses which one the app uses.
- Testing happens on a temporary `*.pages.dev` domain with `VITE_BACKEND=cloudflare`.
- Production stays on `supabase` until cutover.

## Cutover (Phase 2D — requires explicit approval)
1. Final delta re-sync + full validation pass (see data plan Step 5–6).
2. Flip production build to `VITE_BACKEND=cloudflare`.
3. Smoke-test all critical flows on the production Pages URL **before** any DNS change.
4. Only then consider attaching the custom domain (separate approval).

## Rollback triggers
- Validation mismatch (counts, FKs, slugs, admin set).
- Auth failures (members can't log in / reset).
- Payment or approval (XRPL) flow errors.
- Elevated error rate or data anomaly post-flip.

## Rollback procedure (fast, low-risk)
1. **Flip the flag back:** set `VITE_BACKEND=supabase`, redeploy. The app is
   immediately back on the untouched Supabase backend. (Primary rollback — seconds/minutes.)
2. **If DNS was already switched:** point the domain back to the previous target
   (Hostinger or the Supabase-backed Pages build). Keep TTLs low around cutover.
3. **Data written only to D1 during the incident:** because Supabase was untouched,
   the only at-risk data is whatever was created against D1 after the flip. Export
   those D1 rows and replay them into Supabase if you must return to Supabase as
   source of truth. Keep the cutover window short to minimize this delta.
4. Communicate status; capture root cause before re-attempting.

## Post-cutover retention
- Keep Supabase **and** Hostinger live for a defined soak period (recommend ≥ 2–4
  weeks) after a successful cutover.
- Do **not** delete Supabase tables/users/functions/buckets or decommission
  Hostinger until the owner explicitly signs off after the soak period.

## Why Hostinger must stay active (for now)
It is the current production site and the ultimate fallback. Until the Cloudflare
deployment is tested, approved, and soaked, Hostinger remaining live is what makes
the whole migration safely reversible.
