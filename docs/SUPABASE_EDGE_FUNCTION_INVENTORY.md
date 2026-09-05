# Supabase Edge Function Inventory

Retrieved from project `ilykpeafezzcrdxorlmb` via `list_edge_functions`. **8 functions deployed,
all ACTIVE.** Source code is **NOT RETRIEVED** (no download tool available in this environment);
retrieve with `supabase functions download <slug> --project-ref ilykpeafezzcrdxorlmb`.

## Deployed functions

| # | Slug | `verify_jwt` | Ver | Called by frontend | Purpose (from call sites) |
|---|---|---|---|---|---|
| 1 | `stripe-create-intent` | **false** | 4 | `StripeDonateForm`, `StripeTiers` | create Stripe PaymentIntent from `{amount}` / tier |
| 2 | `stripe-webhook` | **false** | 4 | — (Stripe calls it) | payment events → `donations` / `subscriptions` |
| 3 | `apply-for-membership` | **false** | 3 | `MembershipApply.jsx` | insert `memberships` (pending) |
| 4 | `apply-for-ordination` | **false** | 3 | `Ordination.jsx` | insert `ordinations` from `{application_json}` |
| 5 | `join-membership` | **false** | 3 | `Join.jsx` | create/advance membership |
| 6 | `admin-approve-membership` | **false** | 3 | `AdminManagement.jsx` | approve `{membership_id}`; likely XRPL mint + email |
| 7 | `admin-approve-ordination` | **false** | 3 | `AdminManagement.jsx` | approve `{ordination_id}`; set `verify_slug`, credential PDF |
| 8 | `clever-processor` | **true** | 4 | **none** | **unknown — not referenced anywhere in the repo** |

Timestamps: `clever-processor` created 2025-07-12 (oldest), Stripe + application functions
2025-08-07, `admin-approve-*` 2025-08-07/08, `join-membership` 2025-08-28. All last updated
2026-04-13 (bulk redeploy).

## Findings

**F-1 — `verify_jwt = false` on both admin approval functions (highest priority).**
`admin-approve-membership` and `admin-approve-ordination` do not verify a JWT at the gateway.
Whether they are safe depends entirely on in-code checks that **could not be inspected**. If they
do not independently verify caller identity *and* admin role, an unauthenticated caller who knows
a membership/ordination UUID could trigger approval — which plausibly mints an XRPL NFT and issues
credentials. **Must be confirmed by reading the source before Phase 2C.** Verify with:
```bash
supabase functions download admin-approve-membership --project-ref ilykpeafezzcrdxorlmb
supabase functions download admin-approve-ordination --project-ref ilykpeafezzcrdxorlmb
# then grep for: getUser, auth.getUser, role, admin, service_role, Authorization
```

**F-2 — application functions are also `verify_jwt = false`.** `apply-for-membership`,
`apply-for-ordination` and `join-membership` create records tied to a user. Without gateway JWT
verification they must derive the user from a verified token in code; otherwise `user_id` may be
attacker-supplied. Same confirmation step.

**F-3 — `clever-processor` is unreferenced.** Not called from this repo. It is the only function
with `verify_jwt = true`. Determine whether it is dead code, an external integration, or a
scheduled job before decommissioning Supabase — **owner input required**.

**F-4 — `stripe-webhook` correctly has `verify_jwt = false`** (Stripe cannot present a Supabase
JWT). It must instead verify the Stripe signature with `STRIPE_WEBHOOK_SECRET`. Unconfirmed.

## Secrets these functions consume
From the Hostinger `.env` export (values never committed): `SUPABASE_SERVICE_ROLE`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_DONATION`,
`COINBASE_COMMERCE_API_KEY`, `COINBASE_COMMERCE_WEBHOOK_SECRET`, `EMAIL_FROM`, `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `XRPL_NETWORK`, `XRPL_ISSUER_ADDRESS`, `XRPL_SEED`.

Actual configured secrets **NOT RETRIEVED** — `supabase secrets list --project-ref ilykpeafezzcrdxorlmb`.

## Target mapping → Cloudflare Workers

| Supabase function | Worker route | Auth | Bindings / secrets |
|---|---|---|---|
| `stripe-create-intent` | `POST /api/payments/stripe/create-intent` | public + **Turnstile** + rate limit | `STRIPE_SECRET_KEY` |
| `stripe-webhook` | `POST /api/webhooks/stripe` | Stripe signature | `STRIPE_WEBHOOK_SECRET`, `DB` |
| `apply-for-membership` | `POST /api/memberships/apply` | **member session** | `DB`, email API |
| `apply-for-ordination` | `POST /api/ordinations/apply` | **member session** | `DB`, email API |
| `join-membership` | `POST /api/memberships/join` | **member session** | `DB`, email API |
| `admin-approve-membership` | `POST /api/admin/memberships/:id/approve` | **Cloudflare Access + role** | `DB`, `XRPL_SEED`, email API |
| `admin-approve-ordination` | `POST /api/admin/ordinations/:id/approve` | **Cloudflare Access + role** | `DB`, `PROTECTED_FILES`, `XRPL_SEED`, email API |
| `clever-processor` | **TBD** | — | pending identification (F-3) |

New routes with no Supabase equivalent: `POST /api/webhooks/coinbase`, `POST /api/contact`,
`POST /api/scroll-requests` (replacing direct browser inserts, Turnstile-protected).

### Porting constraints
1. **No raw SMTP from Workers.** `SMTP_*` cannot be used; switch to an HTTP email API
   (MailChannels / Resend / Postmark). Affects every function that notifies.
2. **XRPL signing stays server-side only**, secret via `wrangler secret put`. Approval must be
   **idempotent** (guard on current `status`) so a retry never double-mints.
3. **Deno → Workers runtime**: replace `Deno.env.get` with `env.*`, `serve()` with
   `export default { fetch }`, and the `supabase-js` service-role client with D1 `env.DB` queries.
4. **Authorization must be explicit** in every handler — there is no RLS backstop in D1.
