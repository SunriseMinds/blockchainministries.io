/**
 * In-memory KV shim matching the surface @reellink/security/ratelimit.js uses
 * (get / put with expirationTtl / delete). Test-only; touches no Cloudflare KV.
 */
export function freshKv() {
  const store = new Map();
  return {
    async get(key) {
      const e = store.get(key);
      if (!e) return null;
      if (e.expiresAt && e.expiresAt <= Date.now()) { store.delete(key); return null; }
      return e.value;
    },
    async put(key, value, opts = {}) {
      store.set(key, {
        value: String(value),
        expiresAt: opts.expirationTtl ? Date.now() + opts.expirationTtl * 1000 : null,
      });
    },
    async delete(key) { store.delete(key); },
    _size: () => store.size,
    _keys: () => [...store.keys()],
  };
}
