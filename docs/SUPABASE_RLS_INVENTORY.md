# Supabase RLS & Authorization Inventory

**Retrieval limitation — read this first.** Enumerating RLS policies requires
`SELECT * FROM pg_policies`, and running SQL against Supabase was excluded. What follows is
therefore split into **(A) confirmed** facts from the metadata/advisor APIs and
**(B) NOT RETRIEVED** items with the exact queries to obtain them. Nothing here is guessed.

---

## A. Confirmed

### A.1 RLS is enabled on all 12 tables
`profiles`, `memberships`, `ordinations`, `donations`, `scrolls`, `scroll_requests`,
`contact_inquiries`, `users`, `credentials`, `ministries`, `requests`, `subscriptions`.

RLS *enabled* ≠ RLS *restrictive*. Policy bodies are what matter, and only two are visible (A.2).

### A.2 Policies confirmed (via security advisor)
| Table | Policy | Cmd | Expression | Roles |
|---|---|---|---|---|
| `contact_inquiries` | `Allow public insert for contact inquiries` | INSERT | `WITH CHECK (true)` | `authenticated`, `anon` |
| `scroll_requests` | `Public can insert scroll requests` | INSERT | `WITH CHECK (true)` | `-` (all) |

Both are flagged `rls_policy_always_true`: **unrestricted insert**. Intentional for public forms,
but with **no server-side validation, no rate limiting and no CAPTCHA** today, both endpoints are
directly spammable using the public anon key. This is a primary driver for Turnstile + Worker
validation in the target architecture.

### A.3 Table-level grants — every table is SELECT-able by `anon` and `authenticated`
The advisor reports `pg_graphql_anon_table_exposed` **and**
`pg_graphql_authenticated_table_exposed` for **all 12 tables**, including `profiles`,
`donations`, `memberships`, `ordinations`, `credentials`, `subscriptions`, `users`.

That is a *grant*, not a row filter — RLS policies may still return zero rows. But it means the
schema is fully discoverable (REST + GraphQL) with the public anon key. **Whether row data leaks
depends entirely on the unretrieved SELECT policies.**

> **Highest-value follow-up in this document:** confirm the SELECT policy on `profiles`,
> `donations`, `memberships`, `ordinations` and `users`. If any is `USING (true)`, member PII and
> donation history are publicly readable **today**.

### A.4 SECURITY DEFINER functions callable by `anon`
| Function | Language | Exposed to |
|---|---|---|
| `public.get_user_role(p_user_id uuid)` | plpgsql | `anon`, `authenticated` via `/rest/v1/rpc/get_user_role` |
| `public.handle_new_user()` | plpgsql | `anon`, `authenticated` |
| `public.handle_subscription_update(sub_id uuid)` | plpgsql | `anon`, `authenticated` |

`SECURITY DEFINER` runs with the definer's privileges, bypassing the caller's RLS. Being
`anon`-executable, each is an authorization boundary. `handle_new_user` and
`handle_subscription_update` are trigger-style routines that should almost certainly **not** be
callable over REST.

Additionally `handle_subscription_update` has a **mutable `search_path`**
(`function_search_path_mutable`) — a known privilege-escalation vector for SECURITY DEFINER.

### A.5 Auth setting
**Leaked-password protection is DISABLED** (no HaveIBeenPwned check on signup/reset).

### A.6 Application-layer authorization (from the repo)
| Control | Implementation | Strength |
|---|---|---|
| Member gate `/dashboard` | `ProtectedRoute` — checks `session` client-side | **cosmetic** |
| Admin gate `/admin` | `AdminRoute` — reads `profiles.role`, redirects if ≠ admin | **cosmetic** |
| Admin data reads | `AdminDashboard` selects `*` from 5 tables | relies **entirely** on RLS |
| Admin reject | `.update({status:'rejected'})` direct from browser | relies **entirely** on RLS |
| Admin approve | Edge Functions `admin-approve-*` | `verify_jwt = false` (see Edge Function inventory) |

**The only real authorization for admin reads and the reject action is RLS** — and those policies
are unretrieved. If they are permissive, any authenticated user could read all donations/profiles
or reject applications by calling PostgREST directly.

---

## B. NOT RETRIEVED — exact queries

```sql
-- B.1 All policies (the key gap)
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;

-- B.2 Triggers (expect one on auth.users for handle_new_user)
SELECT c.relname AS table, t.tgname, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
WHERE NOT t.tgisinternal;

-- B.3 Function bodies
SELECT p.proname, p.prosecdef AS security_definer, pg_get_functiondef(p.oid)
FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace;

-- B.4 Explicit grants
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated');

-- B.5 Indexes
SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public';
```

---

## C. Carry-forward into the Cloudflare design
D1 has **no RLS**. Every rule above must be re-implemented as explicit server-side checks in
Worker route handlers. The migration is therefore an *opportunity*: authorization moves from
partially-unknown database policies into reviewable, testable, version-controlled code.

| Supabase mechanism | D1/Workers replacement |
|---|---|
| RLS `USING (auth.uid() = user_id)` | Worker reads session → `WHERE user_id = ?` bound param |
| RLS admin policies | Worker asserts role, **or** Cloudflare Access for `/admin` |
| `WITH CHECK (true)` public insert | Worker route + **Turnstile** + rate limit + validation |
| `SECURITY DEFINER` RPC | ordinary Worker handler with explicit auth checks |
| `handle_new_user` trigger | explicit profile row insert inside the signup transaction |
| Anon SELECT grants / GraphQL exposure | eliminated — no public database surface at all |
