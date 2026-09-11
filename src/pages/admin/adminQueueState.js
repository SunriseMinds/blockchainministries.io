/**
 * M13 Phase 4 — lazy load/cache/error state for the four operational admin
 * queues, and the gate that guards the Activity details disclosure.
 *
 * WHY THIS IS NOT IN AdminDashboard.jsx
 * Two reasons, both about proof rather than taste:
 *
 *  1. AdminDashboard already fetches its five legacy datasets in parallel at
 *     mount. Adding four more to that pattern would double the page's cold
 *     cost for data most admins never open. The rule "fetch on first
 *     activation, never again" is a real state machine, so it lives somewhere
 *     it can be executed and asserted directly — not tangled in effects.
 *
 *  2. The privacy boundary has to be demonstrable. Keeping the fetch, the
 *     projection hand-off and the disclosure gate here means a test can prove
 *     what the component is able to render, not merely inspect its markup.
 *
 * Framework-free by contract: no React, no DOM, no globals, no timers. The
 * component binds to it; it never reaches back.
 *
 * It deliberately owns NO projections of its own — every field allow-list
 * lives in adminQueues.js (Phase 3) and is imported, never restated.
 */
import { QUEUES, projectRows, projectActivityDetails } from './adminQueues.js';

export const IDLE = 'idle';
export const LOADING = 'loading';
export const READY = 'ready';
export const ERROR = 'error';

const NO_ROWS = Object.freeze([]);
const NO_DETAILS = Object.freeze([]);

/**
 * Shared identity for every untouched queue. A stable reference matters:
 * the component reads this through useSyncExternalStore, which re-renders
 * whenever the snapshot changes identity.
 */
const IDLE_STATE = Object.freeze({
  status: IDLE,
  rows: NO_ROWS,
  sources: NO_ROWS,
  error: null,
});

/**
 * @param {{ get: (path: string) => Promise<any> }} client  the app's api client
 */
export function createQueueStore(client) {
  const states = new Map();
  const listeners = new Set();

  const stateOf = (key) => states.get(key) || IDLE_STATE;

  function set(key, next) {
    states.set(key, Object.freeze(next));
    for (const fn of [...listeners]) fn();
  }

  /**
   * Fetch a queue exactly once, on its first activation.
   *
   * Called on every activation of a tab, so it MUST be idempotent. Only an
   * untouched queue is startable here — `idle`. Everything else is a no-op:
   *
   *   loading  a second request would be a duplicate
   *   ready    the cached rows stand; switching away and back costs nothing
   *   error    the failure is the admin's to see and act on
   *
   * The `error` case matters more than it looks. Silently retrying whenever
   * the admin happens to revisit the tab makes the failure flicker in and out
   * of existence, fires requests nobody asked for, and can resolve the error
   * before the Retry control can even be used — which is how M13 Phase 5's
   * live browser run found this. Recovery is deliberate, through refresh().
   */
  async function load(key) {
    const queue = QUEUES[key];
    if (!queue) return;
    if (stateOf(key).status !== IDLE) return;
    await run(key, queue);
  }

  /** Deliberate re-fetch: the error Retry control, and the ready Refresh control. */
  async function refresh(key) {
    const queue = QUEUES[key];
    if (!queue) return;
    if (stateOf(key).status === LOADING) return;
    await run(key, queue);
  }

  async function run(key, queue) {
    set(key, { status: LOADING, rows: NO_ROWS, sources: NO_ROWS, error: null });
    try {
      const res = await client.get(queue.path);
      const items = Array.isArray(res?.items) ? res.items : [];
      set(key, {
        status: READY,
        rows: projectRows(key, items),
        // Raw rows are retained ONLY for the one queue that has an explicit
        // details disclosure. Inquiries, scroll requests and consultations
        // keep nothing after projection, so the visitor IPs and internal
        // notes in those responses are not merely unrendered — they are not
        // held anywhere the view can reach.
        sources: queue.details ? items : NO_ROWS,
        error: null,
      });
    } catch {
      // The thrown ApiError is swallowed on purpose. Its message is the
      // backend's own text and may carry an internal code or upstream detail;
      // what reaches the screen is the queue's own fixed, human sentence.
      set(key, { status: ERROR, rows: NO_ROWS, sources: NO_ROWS, error: queue.error });
    }
  }

  return {
    state: stateOf,
    load,
    refresh,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/**
 * The Activity details gate.
 *
 * Closed returns an empty list, so a closed row has nothing to render — the
 * private `credential.revoke` reason is absent from the DOM because no markup
 * is produced for it, not because CSS hid it. Open delegates to Phase 3, which
 * is still allow-listed per action: a stray `reason` on any other action stays
 * invisible even here.
 */
export function disclosedDetails(source, isOpen) {
  if (!isOpen) return NO_DETAILS;
  return projectActivityDetails(source);
}
