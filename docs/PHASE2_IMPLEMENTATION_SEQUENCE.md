# Phase 2 Implementation Sequence

Ordered plan from today's state (design complete) to Supabase decommission. **Every stage is
additive and reversible; Supabase and Firebase stay live throughout.**

---

## Stage 0 — Unblock (owner + read-only checks) · **CURRENT GATE**
Nothing below can proceed safely until these are answered.

| # | Item | Why it blocks | Ref |
|---|---|---|---|
| 0.1 | Row counts + `auth.users` count | Decides schema-only vs full data migration | R-01 |
| 0.2 | `pg_policies` dump | Unknown whether data leaks **today** | R-04 |
| 0.3 | `supabase db dump --schema public` | No authoritative DDL exists | R-05 |
| 0.4 | Audit `admin-approve-*` source | Possible live auth bypass | R-03 |
| 0.5 | Locate scroll / credential PDFs | Blocks all R2 work | R-08 |
| 0.6 | Identify `clever-processor` | Unknown integration | R-15 |
| 0.7 | Check Stripe for active subscriptions | Silent billing breakage | R-09 |
| 0.8 | Choose auth cutover option (1/2/3) | Determines the whole auth workstream | R-02 |
| 0.9 | Choose HTTP email provider | Workers cannot use SMTP | R-10 |
| 0.10 | Confirm admin list for Cloudflare Access | — | R-07 |
| 0.11 | Classify scroll visibility | Could expose member-only docs | R-19 |
| 0.12 | Disposition of 4 orphan tables | — | R-16 |

**Exit criteria:** 0.1–0.5 answered; 0.8 and 0.9 decided.

---

## Stage 1 — Provision (non-destructive)
1. Create D1 `blockchain-ministries-db`; add `DB` binding.
2. Create R2 `bm-public`, `bm-protected`; add `PUBLIC_FILES`, `PROTECTED_FILES` bindings.
3. Create KV `bm-rate-limit`; add `RATE_LIMIT` binding.
4. Create Turnstile widget; store `TURNSTILE_SECRET` via `wrangler secret put`.
5. Reconcile `migrations/0001_initial_schema.sql` against the Stage 0.3 dump; apply to D1.
6. Verify with `wrangler d1 execute --command "SELECT name FROM sqlite_master WHERE type='table'"`.

*Production impact: none. Frontend untouched.*

---

## Stage 2 — Read-only API (safest first slice)
Build Worker routes that only **read**: `GET /api/verify/:slug`, `/api/scrolls`,
`/api/admin/*` (list endpoints). Establish the shared skeleton now — router, error envelope,
`requireSession()`, `requireAdmin()`, input validation, audit helper, security headers.

**Gate:** routes return correct shapes against seeded test data; deny-by-default proven.

---

## Stage 3 — Authentication (only after 0.8 approval)
Per `AUTH_CUTOVER_PLAN.md`: password hashing → sessions → signup/login/logout → email verification
→ password reset → rate limiting → Turnstile → audit logging. Then enable **Cloudflare Access** on
`/admin*` and `/api/admin/*`, with the Worker re-validating the Access JWT and D1 role.

**Gate:** the full post-cutover verification checklist in `AUTH_CUTOVER_PLAN.md` passes.
**Security review required before proceeding.**

---

## Stage 4 — Write & business-logic routes
Port the Edge Functions per `SUPABASE_EDGE_FUNCTION_INVENTORY.md`:
public forms (Turnstile) → applications → approvals (**idempotent**, XRPL guarded) → Stripe intent
+ webhooks (signature verified, `(provider, provider_id)` unique) → email notifications.

**Gate:** every route has an authorization test; approval proven safe to retry (no double-mint).

---

## Stage 5 — R2 file migration
Per `R2_FILE_MIGRATION_PLAN.md`: manifest → upload → backfill keys → validate **R1–R8**.
R5/R6 (anonymous and cross-account access denied) are mandatory pass conditions.

---

## Stage 6 — Data migration (dry run)
Export → transform → import into D1 → validate **V1–V11**. Repeat until clean. Production Supabase
remains read-only and authoritative.

---

## Stage 7 — Frontend integration behind the flag
1. Add `VITE_BACKEND` (`supabase` | `cloudflare`), default **`supabase`**.
2. Add an API client mirroring the existing Supabase call sites.
3. Keep both paths compiled; **no visual or route changes** — design is frozen.
4. Deploy a preview with `VITE_BACKEND=cloudflare`; production stays on Supabase.

**Gate:** every flow works on the preview; the site looks and behaves identically.

---

## Stage 8 — Rollback rehearsal
Flip preview → `cloudflare`, exercise flows, flip back to `supabase`, confirm recovery, time it.
Per `ROLLBACK_PLAN.md`. **Cutover approval cannot be requested until this succeeds.**

---

## Stage 9 — Cutover (explicit owner approval required)
1. Announce maintenance window.
2. Final delta re-sync; re-run V1–V11.
3. Record the cutover timestamp (UTC).
4. Set production `VITE_BACKEND=cloudflare`; deploy.
5. Smoke-test critical flows.
6. Send password-reset emails if Option 1.
7. Monitor error rates; rollback lever staged.

---

## Stage 10 — Soak (≥ 30 days)
Supabase and Firebase stay live and untouched. Monitor errors, auth success rate, form
submissions, webhook delivery, D1 growth. Reconcile any anomaly against Supabase.

---

## Stage 11 — Decommission (separate approval)
Only after a clean soak: export a final Supabase snapshot to cold storage → revoke Supabase keys →
remove Supabase code and dependency from the frontend → pause/delete the project.
**Deleting Supabase is the only irreversible step in this migration.**

Firebase/ministers migration is a **separate project**, not part of Phase 2.

---

## Dependency graph
```
Stage 0 ─┬─> 1 ─> 2 ─> 3 ─> 4 ─┬─> 7 ─> 8 ─> 9 ─> 10 ─> 11
         ├─> 5 ────────────────┤
         └─> 6 ────────────────┘
```
Stages 5 and 6 can run in parallel with 2–4 once Stage 1 is complete.

## Constraints in force for all stages
- Do not modify, disable, or delete Supabase or Firebase.
- Do not change frontend design, routes, components, or content.
- No secret ever reaches the browser; no XRPL seed anywhere in the repo.
- Every public endpoint: Turnstile + server-side validation + rate limiting.
- Every authenticated route: explicit server-side authorization (no RLS backstop).
- Every privileged action: `audit_logs`.
