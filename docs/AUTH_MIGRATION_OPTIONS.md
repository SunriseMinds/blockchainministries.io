# Authentication Migration Options — Blockchain Ministries

> **Status: DESIGN / PROPOSAL — DECISION REQUIRED.** No authentication code will
> be written until the owner approves one option. Supabase Auth cannot simply be
> "copied into D1": password hashes, the JWT signing model, email flows, and
> session handling are Supabase-managed and are not portable as raw table rows.

## What the app needs from auth (from the code)
- Email/password **sign-up**, **sign-in**, **sign-out** (`AuthProvider`)
- **Password reset** (`resetPasswordForEmail` → `/update-password`) and **update password**
- A **session** the SPA can read to gate `ProtectedRoute` (`/dashboard`) and `AdminRoute` (`/admin`)
- A **role** claim (`profiles.role === 'admin'`) for admin authorization
- Email verification (implied by Supabase defaults; confirm requirement)

Two distinct populations:
- **Admins/Elders** — small, known, high-privilege set.
- **Members** — public self-service sign-up, potentially large.

---

## Option A — Cloudflare Access (admins) + app-managed member auth
**How:** Put `/admin` (and admin APIs) behind **Cloudflare Access** (Zero Trust) via
email OTP or an IdP. Members use a lightweight app-managed session for `/dashboard`.

- **Cost:** CF Access is free for up to 50 seats — ideal for a handful of admins;
  not intended (and not cost-effective) as a public member login for many users.
- **Complexity:** Low for admin; you still must build *something* for members.
- **UX:** Admins get IdP/OTP login (good). Members need a separate flow.
- **Portability:** Admin side is tied to Cloudflare; member side is yours.
- **Maintenance:** Very low for admin; member auth still to be maintained.
- **Best for:** Locking down admin immediately with near-zero code.

## Option B — External auth provider that runs on Workers
**How:** Adopt a managed auth service/library compatible with Cloudflare Workers —
e.g. **Clerk**, **Auth0**, **Better Auth** (self-hosted on Workers + D1/KV), or
**keep Supabase Auth as the identity provider only** while moving app *data* to D1.

- **Cost:** Managed SaaS (Clerk/Auth0) has free tiers then per-MAU pricing;
  Better Auth is open-source (infra cost only); Supabase-Auth-only stays on
  Supabase's free/pro tier.
- **Complexity:** Low–medium. Provider handles hashing, verification emails,
  reset tokens, sessions, and security best practices.
- **UX:** Polished, familiar flows; social login optional.
- **Portability:** SaaS adds a vendor; Better Auth is fully portable; keeping
  Supabase-Auth-only is the least-change interim but doesn't fully leave Supabase.
- **Maintenance:** Low (provider maintains the hard parts).
- **Best for:** Getting secure member auth without hand-rolling crypto.

## Option C — Custom email/password on Workers + D1
**How:** Build it: password hashing (Argon2id/scrypt via WebCrypto or a WASM lib),
email verification tokens, password-reset tokens, rate limiting, secure `httpOnly`
`Secure` `SameSite` cookies, and server-side session/JWT management.

- **Cost:** Only Cloudflare infra (Workers/D1/KV); no per-user fees.
- **Complexity:** **High.** You own every security detail (timing attacks, token
  entropy, replay, lockout, email deliverability, session revocation).
- **UX:** Fully controllable, but you build every screen and edge case.
- **Portability:** Maximum — no third-party identity vendor.
- **Maintenance:** **Highest** — security patches and audits are on you.
- **Best for:** Teams that must avoid any external identity vendor and can invest
  in ongoing security ownership.

---

## Recommendation
**Recommended: a hybrid of Option A + Option B.**

1. **Admins → Cloudflare Access** now. It is the fastest, safest way to genuinely
   protect `/admin` and admin APIs (today those are only client-side guards). Near
   zero code, free at this scale.
2. **Members → Better Auth on Workers + D1** (Option B, self-hosted flavor). It
   keeps everything Cloudflare-native and portable (no per-MAU SaaS bill), while
   still delegating password hashing, email verification, reset tokens, sessions,
   and rate limiting to a maintained, security-reviewed library — avoiding the
   high risk of Option C's from-scratch build.

**Interim option** if you want the smallest first step: keep **Supabase Auth only**
(Option B variant) as the identity provider while D1 becomes the data store. This
de-risks the data migration and lets auth move last.

**Not recommended as a first move:** Option C (custom auth). Reconsider only if a
managed/library approach is rejected — and only with a dedicated security review.

### Decision needed from owner
- [ ] Approve **A + Better Auth** (recommended), or
- [ ] Approve **Supabase-Auth-only interim**, or
- [ ] Approve a specific SaaS (Clerk/Auth0), or
- [ ] Approve **Option C** (custom) — triggers a separate security-review gate.

### Consequence for existing users (all options)
Supabase password **hashes cannot be exported/reused** by a different auth system.
Whichever option is chosen, plan for either (a) a one-time **password reset email**
to all existing members at cutover, or (b) running Supabase Auth as the IdP so no
reset is needed. This must be decided before cutover (Phase 2D).
