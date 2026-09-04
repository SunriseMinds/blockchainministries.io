/**
 * Thin client for the Cloudflare-native Worker API (/api/*).
 *
 * PREVIEW ONLY — gated by VITE_USE_CLOUDFLARE_API, which defaults to false
 * (unset) so production keeps talking to Supabase exactly as before. Every
 * page that wires up this client checks `USE_CLOUDFLARE_API` and falls back
 * to its existing Supabase code path when it's off.
 *
 * Auth is entirely cookie-based (the Worker sets an HttpOnly session cookie
 * on login/signup) — there is no bearer token, and nothing here ever touches
 * localStorage/sessionStorage for a credential.
 */

export const USE_CLOUDFLARE_API = import.meta.env.VITE_USE_CLOUDFLARE_API === 'true';

/** Thrown for any non-2xx response; carries the API's own error code. */
export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code || 'Request failed');
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    // Cookie session, not a bearer token — the Worker reads the HttpOnly
    // cookie itself; nothing here can or should attach an Authorization header.
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // No/invalid JSON body (e.g. a 204) — leave data null.
  }

  if (!res.ok) {
    const err = data?.error || {};
    throw new ApiError(res.status, err.code || 'unknown_error', err.message || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body ?? {} }),
  patch: (path, body) => request(path, { method: 'PATCH', body: body ?? {} }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
