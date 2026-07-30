/**
 * Feature flags for the parallel Cloudflare backend.
 *
 * ALL FLAGS DEFAULT TO FALSE. An unset environment variable is false, so a
 * deployment that does not explicitly opt in keeps the exact production
 * behaviour that exists today: the SPA is served and Supabase remains the
 * live backend. Nothing here can switch production by accident.
 *
 * Set per-environment in the Cloudflare dashboard (Workers Builds → Variables)
 * or in wrangler.jsonc `vars` for a preview environment.
 */

/** Truthy only for explicit opt-in values. */
function on(value) {
  return value === true || value === 'true' || value === '1';
}

/**
 * @param {Record<string, unknown>} env
 * @returns {{USE_D1:boolean, USE_R2:boolean, USE_WORKER_AUTH:boolean,
 *            USE_TURNSTILE:boolean, USE_NEW_API:boolean}}
 */
export function getFlags(env = {}) {
  return {
    // Allow the API layer to read/write D1 at all.
    USE_D1: on(env.USE_D1),
    // Allow R2 object routes.
    USE_R2: on(env.USE_R2),
    // Allow Worker-issued sessions (signup/login/logout/reset).
    USE_WORKER_AUTH: on(env.USE_WORKER_AUTH),
    // Enforce Turnstile on public submissions.
    USE_TURNSTILE: on(env.USE_TURNSTILE),
    // Master switch: mount /api/* at all.
    USE_NEW_API: on(env.USE_NEW_API),
  };
}

/** Human-readable flag state, used by GET /api/health. */
export function describeFlags(env) {
  const f = getFlags(env);
  return Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v ? 'on' : 'off']));
}
