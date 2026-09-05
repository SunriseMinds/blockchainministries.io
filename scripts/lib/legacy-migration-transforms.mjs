/**
 * Pure transforms for the M9.4 legacy-data migration:
 *   Supabase auth.users (+ profiles) -> D1 users
 *   Supabase contact_inquiries       -> D1 contact_inquiries
 *
 * Kept separate from scripts/migrate-legacy-data.mjs so the mapping logic is
 * unit-testable without live Supabase/D1 access (see
 * legacy-migration-transforms.test.js).
 *
 * Schema note: this repo's current migrations/0001_initial_schema.sql has
 * ONE `users` table — there is no separate D1 `profiles` table (see
 * worker/db/repositories.js's own header comment: "There is no `profiles`
 * table — identity, role, and profile fields all live on the single `users`
 * table"). The older Phase-2-draft scripts/import-d1.mjs still targets a
 * two-table users/profiles split and a membership_applications/
 * ordination_applications shape that no longer exists — do not reuse those
 * transforms for this migration; this file targets the actual frozen schema.
 */

/** Postgres timestamptz text -> ISO-8601 UTC text, or null if unparseable. */
export function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * @param {{id:string, email:string, created_at:string, email_confirmed_at?:string|null}} authUser
 *        a Supabase Admin API auth.users row
 * @param {{display_name?:string|null, wallet_xrpl?:string|null, stripe_customer_id?:string|null, role?:string}|null} profile
 *        the matching public.profiles row, or null when none exists (valid —
 *        maps to NULL fields, never fabricated)
 * @returns {object} one D1 `users` row
 */
export function transformUser(authUser, profile) {
  const createdAt = toIso(authUser.created_at) || new Date().toISOString();
  return {
    id: authUser.id,
    email: String(authUser.email).toLowerCase(),
    // Supabase password hashes are never portable — every migrated user gets
    // this unusable sentinel (same format as
    // packages/auth/src/password.js's unusablePasswordHash(), but stable/
    // deterministic per user id rather than random, so a re-run of this
    // migration produces the exact same row and INSERT OR IGNORE is a true
    // no-op) and must complete a password reset before they can log in.
    password_hash: `!migrated:${authUser.id}`,
    // A Supabase-verified email is still verified after migration — this is
    // not a security regression, it reflects an identity already established
    // under the old system.
    email_verified: authUser.email_confirmed_at ? 1 : 0,
    role: profile?.role === 'admin' ? 'admin' : 'member',
    display_name: profile?.display_name ?? null,
    wallet_xrpl: profile?.wallet_xrpl ?? null,
    stripe_customer_id: profile?.stripe_customer_id ?? null,
    status: 'active',
    failed_login_count: 0,
    locked_until: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

/**
 * @param {{id:string, name:string, email?:string|null, message?:string|null, inquiry_type?:string|null, created_at:string}} row
 * @returns {object} one D1 `contact_inquiries` row
 */
export function transformContactInquiry(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? null,
    message: row.message ?? null,
    inquiry_type: row.inquiry_type ?? null,
    status: 'new',
    ip: null,
    created_at: toIso(row.created_at) || new Date().toISOString(),
  };
}
