# Backend Inventory — Blockchain Ministries (Phase 2A)

**Status:** INVENTORY ONLY. Nothing was created, altered, or deleted. No SQL was executed
against Supabase (per instruction), so some items below are marked **NOT RETRIEVED** with
the exact query needed to obtain them.

- **Supabase project:** `BlockchainMinistries.io` — ref `ilykpeafezzcrdxorlmb`, region `us-east-2`,
  Postgres 17.6.1.104, status ACTIVE_HEALTHY, created 2025-06-29.
- **Source of truth for this doc:** Supabase metadata APIs (`list_tables`, `list_edge_functions`,
  `list_migrations`, `list_extensions`, `get_advisors`) + static analysis of this repository.

## 1. Summary of what exists

| Layer | Provider | Count / detail |
|---|---|---|
| Relational data | Supabase Postgres | **12 tables** in `public` |
| Auth | Supabase Auth (`auth.users`) | user count **NOT RETRIEVED** |
| Server logic | Supabase Edge Functions | **8 deployed** (frontend calls only 6) |
| DB functions | Postgres plpgsql | **3 known** (all `SECURITY DEFINER`) |
| Triggers | Postgres | **NOT RETRIEVED** (≥1 inferred: `handle_new_user`) |
| Storage | Supabase Storage | **NOT RETRIEVED** — see §7 |
| Ministers directory | Firebase Firestore | collection `ministers` |
| Schema version control | — | **none** — `list_migrations` returned empty |

> **Critical:** `list_migrations` is **empty**. The entire schema was created ad hoc (dashboard /
> SQL editor), so there is no authoritative DDL history in Supabase or in this repo. The D1
> migrations proposed in Phase 2B become the first version-controlled schema this project has had.

## 2. Tables (12)
Full column/type/PK/FK detail: **`docs/SUPABASE_SCHEMA_INVENTORY.md`**.

| Table | RLS | Used by frontend? | Notes |
|---|---|---|---|
| `profiles` | on | ✅ heavily | extends `auth.users`; holds `role` |
| `memberships` | on | ✅ | `user_id` UNIQUE; XRPL `nft_token_id`/`tx_hash` |
| `ordinations` | on | ✅ | `application_json`, `verify_slug` UNIQUE |
| `donations` | on | ✅ | `amount_cents`, provider stripe/coinbase |
| `scrolls` | on | ✅ | `pdf_path`, `verify_slug` UNIQUE |
| `scroll_requests` | on | ✅ insert | public form |
| `contact_inquiries` | on | ✅ insert | public form |
| `users` (public) | on | ⚠️ join only | **separate from `auth.users`** — legacy |
| `credentials` | on | ❌ | orphaned relative to the frontend |
| `ministries` | on | ❌ | legacy prototype (lowercase column names) |
| `requests` | on | ❌ | generic request table, unused |
| `subscriptions` | on | ❌ | Stripe subscriptions; no frontend reads |

**Four tables (`credentials`, `ministries`, `requests`, `subscriptions`) have no frontend
references.** `public.users` is referenced only through PostgREST joins. Decide per table:
migrate, archive, or drop — see the risk register.

## 3. Row counts / existing records
`list_tables` reports **`rows: 0` for all 12 tables**. This is the Postgres planner estimate and is
`0` both for a genuinely empty table *and* for a table that has never been `ANALYZE`d.

**This is NOT confirmed as an empty database.** It materially changes the migration (schema-only
vs. full data migration), so it must be resolved before Phase 2C. Read-only confirmation:

```sql
SELECT 'profiles' t, count(*) FROM public.profiles
UNION ALL SELECT 'memberships', count(*) FROM public.memberships
UNION ALL SELECT 'ordinations', count(*) FROM public.ordinations
UNION ALL SELECT 'donations',   count(*) FROM public.donations
UNION ALL SELECT 'scrolls',     count(*) FROM public.scrolls
UNION ALL SELECT 'scroll_requests',   count(*) FROM public.scroll_requests
UNION ALL SELECT 'contact_inquiries', count(*) FROM public.contact_inquiries
UNION ALL SELECT 'users',        count(*) FROM public.users
UNION ALL SELECT 'credentials',  count(*) FROM public.credentials
UNION ALL SELECT 'ministries',   count(*) FROM public.ministries
UNION ALL SELECT 'requests',     count(*) FROM public.requests
UNION ALL SELECT 'subscriptions',count(*) FROM public.subscriptions;
```

## 4. Auth usage
Supabase Auth, email/password, via `src/contexts/AuthProvider.jsx`:

| Capability | Call | Status |
|---|---|---|
| Sign up | `auth.signUp({ options.data })` | metadata passed at signup |
| Sign in | `auth.signInWithPassword` | ✅ |
| Sign out | `auth.signOut` | ✅ |
| Session | `auth.getSession`, `auth.onAuthStateChange` | ✅ |
| Password reset request | `auth.resetPasswordForEmail(email, { redirectTo: origin + '/update-password' })` | ✅ portable (no hard-coded host) |
| Password update | `auth.updateUser({ password })` | ✅ |
| Current user | `auth.getUser()` (StripeTiers) | ✅ |
| Email verification | Supabase default | **setting NOT RETRIEVED** (dashboard: Auth → Providers → Email → Confirm email) |

**Real user count: NOT RETRIEVED** (`SELECT count(*) FROM auth.users;` — count only, no PII).
**Leaked-password protection is DISABLED** (advisor finding).

## 5. Profiles & role logic
- `profiles.role text DEFAULT 'member' CHECK (role IN ('member','admin'))`.
- `AdminRoute.jsx` reads `profiles.role` client-side and redirects non-admins → **client-side gate only**.
- `public.users` *also* has `role` and `is_admin` columns — **a second, divergent role system**.
- DB function `public.get_user_role(p_user_id uuid)` (SECURITY DEFINER) exists — body NOT RETRIEVED.
- `public.handle_new_user()` (SECURITY DEFINER) almost certainly backs an `AFTER INSERT ON auth.users`
  trigger creating the `profiles` row from signup metadata. **Trigger definition NOT RETRIEVED.**

## 6. Frontend data operations (complete)
| File | Operation | Table / function |
|---|---|---|
| `contexts/AuthProvider.jsx` | select `*` eq id | `profiles` |
| `components/auth/AdminRoute.jsx` | select `role` eq id | `profiles` |
| `components/layout/DashboardLayout.jsx` | select `*` eq id | `profiles` |
| `pages/dashboard/DashboardHome.jsx` | select `*` eq user_id | `memberships`, `ordinations`, `donations` |
| `pages/Verify.jsx` | select `*, profiles(display_name)` eq verify_slug, status approved | `ordinations` |
| `pages/Verify.jsx` | select `*` eq verify_slug | `scrolls` |
| `pages/Contact/components/ContactForm.jsx` | **insert** | `contact_inquiries` |
| `pages/Scrolls/components/ContactScrollForm.jsx` | **insert** | `scroll_requests` |
| `pages/admin/AdminDashboard.jsx` | select `*` order created_at | `profiles`, `donations`, `scrolls`, `memberships`, `ordinations` |
| `pages/admin/AdminManagement.jsx` | select `*, profiles(display_name), users(email)` eq status pending | `memberships`, `ordinations` |
| `pages/admin/AdminManagement.jsx` | **update** `{status:'rejected'}` eq id | `memberships`, `ordinations` |
| `pages/MembershipApply.jsx` | invoke | `apply-for-membership` |
| `pages/Ordination.jsx` | invoke `{application_json}` | `apply-for-ordination` |
| `pages/Join.jsx` | invoke | `join-membership` |
| `pages/admin/AdminManagement.jsx` | invoke | `admin-approve-membership`, `admin-approve-ordination` |
| `pages/Donate/components/StripeDonateForm.jsx` | invoke `{amount}` | `stripe-create-intent` |
| `pages/Donate/components/StripeTiers.jsx` | invoke | `stripe-create-intent` |

**No `.delete()` anywhere in the frontend.** The only direct writes from the browser are the two
public form inserts and the admin `status:'rejected'` update.

## 7. Storage
**NOT RETRIEVED** — no storage tool in the available MCP toolset and no SQL permitted.
- No Supabase Storage client calls exist anywhere in the frontend.
- But the schema references file paths: `scrolls.pdf_path` (NOT NULL) and
  `ordinations.credential_pdf_path`. Something must be producing/serving those files.
- To retrieve: dashboard → Storage, or `SELECT id, name, public FROM storage.buckets;`
- **Owner input required:** where do scroll PDFs and ordination credential PDFs physically live today?

## 8. Edge Functions
See **`docs/SUPABASE_EDGE_FUNCTION_INVENTORY.md`**. 8 deployed; source code NOT RETRIEVED.

## 9. Firebase
See **`docs/FIREBASE_INVENTORY.md`**. Firestore collection `ministers`, read-only, 2 pages.

## 10. Placeholder payment & blockchain configuration
| Item | Location | State |
|---|---|---|
| Stripe publishable key | `StripeTiers.jsx` via `VITE_STRIPE_PUBLISHABLE_KEY` | env-driven; unset ⇒ Stripe fails |
| Stripe tier price IDs | `StripeTiers.jsx` | **PLACEHOLDERS**: `price_supporter_tier`, `price_guardian_tier`, `price_archangel_tier` (in-code note says replace) |
| PayPal provider client-id | `src/main.jsx` | **hardcoded `"test"`** |
| PayPal client id | `PaypalDonate.jsx` | `VITE_PAYPAL_CLIENT_ID \|\| 'YOUR_PAYPAL_CLIENT_ID'`; self-renders an "unconfigured" notice |
| PayPal subscription plan ID | `PaypalDonate.jsx` | **PLACEHOLDER** (comment says so) |
| XRPL issuer address | `public/.well-known/xrp-ledger.toml` | `rhbwjNN6U6Zy6mzpsjWbnEg5RBy96TgiLw`, ticker EFT |
| XRPL explorer / Xaman links | `Token.jsx`, `XUMMConnect.jsx`, `TrustlineQRCode.jsx` | external links, `rel="noopener noreferrer"` |
| XRPL signing seed | — | **not in the repo** (correct). Server-side only. |
| Coinbase Commerce | `donations.provider` CHECK allows `coinbase` | no frontend integration found |

## 11. Information NOT accessible (no guessing)
| Item | Why | How to obtain |
|---|---|---|
| Full RLS policy set | needs SQL | `SELECT * FROM pg_policies WHERE schemaname='public';` |
| Trigger definitions | needs SQL | `SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE NOT tgisinternal;` |
| DB function bodies | needs SQL | `SELECT proname, pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace='public'::regnamespace;` |
| Indexes beyond PK/unique | needs SQL | `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public';` |
| True row counts | needs SQL | see §3 |
| `auth.users` count | needs SQL | `SELECT count(*) FROM auth.users;` |
| Storage buckets/objects | no tool | dashboard → Storage |
| Edge Function source | no tool | `supabase functions download <slug>` |
| Email confirmation setting | no tool | dashboard → Auth → Providers → Email |
