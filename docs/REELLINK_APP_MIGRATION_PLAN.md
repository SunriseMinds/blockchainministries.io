# Reellink App Migration Plan

How every current and future Reellink application adopts the shared platform.
Adapters are scaffolded in `apps/`; each contains only domain code.

## The 8-step recipe (any app, new or existing)

1. **Scaffold** — copy `apps/<nearest-adapter>/` or start from `apps/story-writer-hub/`.
2. **Provision**
   ```bash
   wrangler d1 create <app>-db
   wrangler kv namespace create <app>-rate-limit
   wrangler r2 bucket create <app>-public && wrangler r2 bucket create <app>-protected
   ```
   Put the returned ids in `wrangler.jsonc`.
3. **Apply schema — platform first, always**
   ```bash
   wrangler d1 execute <app>-db --file=packages/auth/migrations/0001_identity.sql
   wrangler d1 execute <app>-db --file=packages/security/migrations/0001_audit.sql
   wrangler d1 execute <app>-db --file=apps/<app>/migrations/0002_domain.sql
   ```
4. **Model the domain** — write `migrations/0002_domain.sql` and `src/repositories.js`.
   Domain tables reference `users(id)`; identity is never re-modelled.
5. **Write routes** — `src/routes.js`, using `requireAuth` / `requireAdmin` /
   `requireTurnstile`. **Never** hand-roll authorization.
6. **Add app content** — email templates and `defineActions({...})` audit verbs.
7. **Set secrets** — `wrangler secret put SESSION_PEPPER` (+ Turnstile / email / Stripe as
   needed). Never commit one; never expose one as `VITE_*`.
8. **Enable flags one at a time**, verifying between each:
   `USE_NEW_API` → `USE_D1` → `USE_TURNSTILE` → `USE_R2` → `USE_WORKER_AUTH`.

**What you never write again:** password hashing, session management, cookie flags, role
checks, CSRF, rate limiting, captcha verification, audit plumbing, the router, the error
envelope, D1 helpers, R2 access control, Stripe signature verification, email transport.

## Per-application status

| Application | Existing Cloudflare resources | Migration path | Notes |
|---|---|---|---|
| **Blockchain Ministries** | Worker `blockchainministries-io`, D1 ×2, R2 ×2, KV ×2 | ✅ **Done** — reference implementation | Supabase still live; cutover pending Phase 2E |
| **Story Writer Hub** | D1 `storywriterhub-db`; Supabase project `Storywriterhub` | Adapter ready. Same Supabase→D1 pattern as BM; reuse `scripts/` verbatim | Highest reuse: also has a Supabase backend to retire |
| **One Inch Apart** | Worker `oneinchapart-site` | Adapter ready; add D1/R2/KV then mount routes | Frontend already on Workers |
| **Megaship Express** | Worker `megaship-express`, D1 `megaship-express-leads` | Adapter ready. Point `DB` at the existing leads database; wrap lead capture in a Turnstile route | Immediate win: public form currently unprotected |
| **Born Loyal Records** | Worker `bornloyal-records`, R2 `bornloyalrecords-media` | Adapter ready. Bind the existing bucket as `PUBLIC_FILES` | Heavy `@reellink/files` user |
| **The Original Vault** | Worker `original-vault`, D1 `original-vault`, R2 `original-vault-archive` | Adapter ready. Bind archive as `PROTECTED_FILES` | Best fit for entitlement-checked downloads (404-not-403) |
| **Reellink Command Center** | — | Adapter ready. Provision fresh; put behind **Cloudflare Access** | Admin-only; `requireAdmin` + Access from day one |
| **Language Learning RPG** | — | Adapter ready. Provision fresh; use `@reellink/storage` KV for streaks/progress | Only app needing significant new domain modelling |

## Sequencing recommendation
1. **Megaship Express** first — smallest surface, and it closes a real gap (an unprotected
   public form) with Turnstile + rate limiting on day one.
2. **The Original Vault** — exercises protected R2 end to end.
3. **Story Writer Hub** — second Supabase retirement; proves the migration tooling
   generalises beyond Blockchain Ministries.
4. **Born Loyal Records**, **One Inch Apart** — mostly binding existing resources.
5. **Reellink Command Center**, **Language Learning RPG** — greenfield.

Do not migrate two applications concurrently until one has completed a full cutover and soak.

## Platform versioning
Packages are `0.1.0` and consumed via workspace links, so today every app tracks `main`.
Before the second app reaches production:
- tag platform releases and pin apps to a version,
- treat any change to identity tables, cookie semantics or guard behaviour as **breaking**,
- keep `packages/*/migrations/` strictly additive (new file, never edit an applied one).

## Constraints that still apply
Blockchain Ministries has **not** cut over: Supabase and Firebase remain live, production
data is unmigrated, and all flags are off. Nothing in this plan changes that — see
`docs/PHASE2E_CUTOVER_CHECKLIST.md`, whose blocker gate is unchanged.
