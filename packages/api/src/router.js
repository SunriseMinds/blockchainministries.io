/**
 * Tiny dependency-free router.
 *
 * Patterns use `:param` segments, e.g. '/api/ordinations/:id/approve'.
 * Handlers receive a single context object so middleware can enrich it.
 */
import { HttpError, errorResponse, notFound, json } from '@reellink/core/http.js';

/**
 * `:name`  matches one path segment.
 * `:name+` matches the rest of the path, slashes included (e.g. R2 object
 *          keys such as `credentials/abc.pdf`). The `+` is not part of the
 *          parameter name.
 */
function compile(pattern) {
  const names = [];
  const source = pattern
    .split('/')
    .map((seg) => {
      if (!seg.startsWith(':')) return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const raw = seg.slice(1);
      const greedy = raw.endsWith('+');
      names.push(greedy ? raw.slice(0, -1) : raw);
      return greedy ? '(.+)' : '([^/]+)';
    })
    .join('/');
  return { re: new RegExp(`^${source}$`), names };
}

export class Router {
  constructor() {
    /** @type {Array<{method:string, re:RegExp, names:string[], handler:Function, middleware:Function[]}>} */
    this.routes = [];
  }

  /**
   * @param {string} method
   * @param {string} pattern
   * @param {Function[]} middleware runs in order before the handler
   * @param {Function} handler
   */
  add(method, pattern, middleware, handler) {
    const { re, names } = compile(pattern);
    this.routes.push({ method, re, names, middleware, handler });
    return this;
  }

  get(p, mw, h) { return this.add('GET', p, mw, h); }
  post(p, mw, h) { return this.add('POST', p, mw, h); }
  patch(p, mw, h) { return this.add('PATCH', p, mw, h); }
  put(p, mw, h) { return this.add('PUT', p, mw, h); }
  delete(p, mw, h) { return this.add('DELETE', p, mw, h); }

  /**
   * @param {object} ctx base context ({ request, env, url, flags, ... })
   * @returns {Promise<Response>}
   */
  async handle(ctx) {
    const { url, request } = ctx;
    const path = url.pathname.replace(/\/+$/, '') || '/';
    let pathMatched = false;

    for (const route of this.routes) {
      const m = route.re.exec(path);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== request.method) continue;

      ctx.params = Object.fromEntries(route.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
      try {
        for (const mw of route.middleware) {
          const early = await mw(ctx);
          // Middleware may short-circuit by returning a Response.
          if (early instanceof Response) return early;
        }
        return await route.handler(ctx);
      } catch (err) {
        return errorResponse(err);
      }
    }

    if (pathMatched) {
      return errorResponse(new HttpError(405, 'method_not_allowed', 'Method not allowed'));
    }
    return errorResponse(notFound('No such endpoint'));
  }
}

/** CORS preflight is not enabled: the SPA is same-origin with the Worker. */
export function methodNotAllowed() {
  return json({ error: { code: 'method_not_allowed', message: 'Method not allowed' } }, { status: 405 });
}
