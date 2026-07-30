# Rollback Plan (Phase 2 — Supabase → Cloudflare)

Supersedes `MIGRATION_ROLLBACK_PLAN.md` (Phase 1 draft) with the real inventory applied.

## Safety invariants
1. **Supabase is never modified.** No DDL, no deletes, no disabled functions, no revoked keys, no
   removed buckets — for the entire build, validation, cutover and soak period.
2. **Firebase is untouched.**
3. **The frontend keeps working against Supabase** until the flag is flipped.
4. **No Cloudflare resource creation deletes anything** — D1/R2/KV are additive.
5. **DNS is not changed** by this phase; the site already serves from Cloudflare Workers.

## Primary rollback lever — the backend feature flag
```
VITE_BACKEND = "supabase"   # current production (default)
VITE_BACKEND = "cloudflare" # new D1/Workers backend
```
Both clients ship in the bundle during transition. Rolling back is a **config change and redeploy**,
not a code revert: set `VITE_BACKEND=supabase`, trigger a Workers Build, done in minutes.

Testing happens on a preview deployment with `VITE_BACKEND=cloudflare` while production stays on
`supabase`.

## Rollback triggers
- Any validation check (V1–V11, R1–R8) fails after cutover.
- Members cannot log in, verify email, or reset passwords.
- Any authorization failure: cross-account data visible, `/api/admin/*` reachable without Access,
  protected R2 object served anonymously.
- Payment or approval (XRPL) errors, or evidence of a double-mint.
- Error rate or latency materially above the pre-cutover baseline.
- Any data anomaly (missing rows, wrong totals, broken `/verify/:slug`).

## Procedure

### Level 1 — Flag flip (minutes; covers almost everything)
1. Set `VITE_BACKEND=supabase` in the Workers Build environment.
2. Redeploy (`npm run build` + `npm run deploy`).
3. Verify home, login, dashboard, contact form, `/verify/:slug` against Supabase.
4. Supabase was never modified, so it is immediately authoritative again.

### Level 2 — Reconcile the divergence window
Any rows written **only to D1** between cutover and rollback would otherwise be lost:
1. Export D1 rows created/updated after the cutover timestamp.
2. Transform D1 → Postgres (reverse of the import mapping).
3. Insert into Supabase, resolving PK conflicts.
4. Highest-value tables: `contact_inquiries`, `scroll_requests`, `donations` (money),
   `membership_applications`, `ordination_applications`.
5. **New accounts created in D1 cannot be replayed with usable passwords** — those users must
   sign up again or be invited. This is the strongest argument for a short cutover window.

### Level 3 — Auth-specific rollback
If the failure is authentication only:
- Under Cutover Option 2 (lazy migration) Supabase Auth is still live → Level 1 fully restores login.
- Under Option 1 (forced reset), users who already set a D1 password have no Supabase equivalent →
  they must use Supabase's own password reset after rollback. **Communicate immediately.**
- Cloudflare Access on `/admin` can remain enabled during rollback (it is independent of the
  backend flag and strictly improves on the current client-side gate).

### Level 4 — Full stop
1. Flag back to `supabase`.
2. Leave D1/R2/KV in place (they cost nothing meaningful and preserve forensic evidence).
3. Do **not** delete migrated data — needed for root-cause analysis.
4. Write an incident note before any re-attempt.

## Cutover window discipline
- Announce a maintenance window; keep it short (target < 60 min).
- Freeze writes during the delta re-sync where practical.
- Record the exact cutover timestamp (UTC) — Level 2 depends on it.
- Have the rollback command staged and tested **before** flipping.
- Assign an owner-side decision maker for a go/no-go call.

## Retention after a successful cutover
| Item | Retention |
|---|---|
| Supabase project (DB, Auth, Functions, buckets, secrets) | **≥ 30 days**, untouched |
| Firebase | until the ministers directory is separately migrated |
| Supabase data export snapshot | ≥ 90 days, secure storage outside git |
| D1 daily backups | ongoing |
| Original file store (pre-R2) | ≥ 30 days |

**Do not delete or downgrade the Supabase project, disable Edge Functions, or rotate its keys until
the owner signs off after the soak period.** Deleting Supabase is the one action in this migration
that is genuinely irreversible.

## Rollback rehearsal (required before cutover)
1. Deploy preview with `VITE_BACKEND=cloudflare`.
2. Exercise the critical flows.
3. Flip to `supabase`, redeploy, confirm full recovery.
4. Time the round trip and record it.
5. Only then request cutover approval.
