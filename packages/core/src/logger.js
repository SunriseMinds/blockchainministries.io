/**
 * Structured logging.
 *
 * Workers logs are ingested by Logpush/Tail, which parse JSON far better than
 * free text. Every line carries a request id so a user-visible error can be
 * traced to the exact log entry.
 *
 * NEVER log: passwords, tokens, session ids, hashes, API keys, seeds, or full
 * PII. `redact()` is provided for the fields that must appear at all.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function emit(level, ctx, message, fields = {}) {
  const min = LEVELS[(ctx?.env?.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;
  if (LEVELS[level] < min) return;

  const line = {
    level,
    msg: message,
    ts: new Date().toISOString(),
    ...(ctx?.requestId ? { request_id: ctx.requestId } : {}),
    ...(ctx?.url ? { path: ctx.url.pathname } : {}),
    ...(ctx?.request ? { method: ctx.request.method } : {}),
    ...(ctx?.session?.user_id ? { user_id: ctx.session.user_id } : {}),
    ...fields,
  };
  // console.* is the Workers logging transport.
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  sink(JSON.stringify(line));
}

export const log = {
  debug: (ctx, msg, fields) => emit('debug', ctx, msg, fields),
  info: (ctx, msg, fields) => emit('info', ctx, msg, fields),
  warn: (ctx, msg, fields) => emit('warn', ctx, msg, fields),
  error: (ctx, msg, fields) => emit('error', ctx, msg, fields),
};

/** Mask an email for logs: `al***@example.com`. */
export function redactEmail(address) {
  const [user, domain] = String(address ?? '').split('@');
  if (!domain) return '***';
  return `${user.slice(0, 2)}***@${domain}`;
}

/** Truncate any value to a safe log length. */
export function redact(value, max = 120) {
  if (value == null) return null;
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * Time an operation and log if it exceeds `slowMs`. Used to surface slow D1
 * queries and third-party calls without instrumenting every call site.
 */
export async function timed(ctx, name, fn, slowMs = 250) {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    const ms = Date.now() - started;
    if (ms >= slowMs) log.warn(ctx, 'slow_operation', { operation: name, duration_ms: ms });
  }
}
