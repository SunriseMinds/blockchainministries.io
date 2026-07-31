/**
 * KV abstraction.
 *
 * A thin, namespaced wrapper so applications never touch a raw KV binding.
 * Namespacing keeps unrelated concerns (rate limits, caches, feature state)
 * from colliding inside a single shared namespace.
 *
 * Fails soft on read: a KV outage degrades a cache, it must not break a
 * request. Writes surface their failure to the caller.
 */
import { HttpError } from '@reellink/core/http.js';

function binding(env, name = 'RATE_LIMIT') {
  const kv = env[name];
  if (!kv) throw new HttpError(503, 'unavailable', `KV binding "${name}" is not configured`);
  return kv;
}

/**
 * @param {object} env
 * @param {{namespace?:string, binding?:string}} [opts]
 */
export function kv(env, { namespace = 'app', binding: bindingName = 'RATE_LIMIT' } = {}) {
  const key = (k) => `${namespace}:${k}`;
  const store = () => binding(env, bindingName);

  return {
    async get(k, { type = 'text' } = {}) {
      try {
        return await store().get(key(k), type);
      } catch {
        return null; // degrade, never throw on a read path
      }
    },

    async getJson(k) {
      const raw = await this.get(k, { type: 'json' });
      return raw ?? null;
    },

    /** @param {{ttl?:number}} [opts] ttl in seconds (KV minimum is 60) */
    put(k, value, { ttl } = {}) {
      const body = typeof value === 'string' ? value : JSON.stringify(value);
      const options = ttl ? { expirationTtl: Math.max(60, ttl) } : undefined;
      return store().put(key(k), body, options);
    },

    delete(k) {
      return store().delete(key(k));
    },

    async list({ prefix = '', limit = 100, cursor } = {}) {
      const res = await store().list({ prefix: key(prefix), limit, cursor });
      return {
        keys: res.keys.map((entry) => ({ name: entry.name.slice(namespace.length + 1), expiration: entry.expiration })),
        complete: res.list_complete,
        cursor: res.list_complete ? null : res.cursor,
      };
    },

    /** Read-through cache helper. */
    async remember(k, ttl, produce) {
      const hit = await this.getJson(k);
      if (hit !== null && hit !== undefined) return hit;
      const value = await produce();
      // Cache failures must not fail the request that produced the value.
      try {
        await this.put(k, value, { ttl });
      } catch { /* ignore */ }
      return value;
    },
  };
}

/** True when a usable KV binding is present. */
export function kvAvailable(env, name = 'RATE_LIMIT') {
  return Boolean(env?.[name]);
}
