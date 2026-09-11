/**
 * M13 Phase 4 — admin operations UI.
 *
 * Run: node --test src/pages/admin/AdminDashboard.test.js
 *
 * HOW THIS PROVES WHAT IT CLAIMS
 * The repository has no DOM harness and Phase 4 may not add one, so these
 * tests do not simulate clicks. They attack the same questions from two sides,
 * and between them the answer is not a matter of opinion:
 *
 *   1. BEHAVIOUR — the load/cache/error machine and the disclosure gate are
 *      plain modules, executed here for real against a recording client.
 *
 *   2. RENDERED CONTENT — the table body renders exactly
 *      `columns.map(col => row[col.key])`, so the set of strings a queue can
 *      put on screen is computable. Every privacy test below feeds a raw API
 *      row carrying an IP, an internal id, private notes and a private
 *      revocation reason through the real projection and asserts on the exact
 *      cell values the component would emit.
 *
 *   3. STRUCTURE — source assertions (comments stripped, so they cannot pass
 *      by matching prose) prove the component has no second path to the data:
 *      the raw audit row is passed whole into the disclosure gate and is never
 *      touched anywhere else.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUEUES, projectRows } from './adminQueues.js';
import { createQueueStore, disclosedDetails, IDLE, LOADING, READY, ERROR } from './adminQueueState.js';

const JSX = readFileSync(new URL('./AdminDashboard.jsx', import.meta.url), 'utf8');

/** Source with every comment removed — an assertion must not pass on prose. */
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

const CODE = strip(JSX);

/** Just the M13 section, so read-only claims are not diluted by legacy code. */
const M13_SECTION = JSX.split('M13 operational queues')[1];
assert.ok(M13_SECTION, 'the M13 section marker must exist');
const M13_CODE = strip(M13_SECTION);

/* ------------------------------------------------------------- fixtures -- */

/** A recording api client. Every request it receives is observable. */
function fakeApi(handler) {
  const calls = [];
  return {
    calls,
    get(path) {
      calls.push(path);
      return handler(path, calls.length);
    },
  };
}

const ok = (items) => (() => Promise.resolve({ items }));
const boom = () => Promise.reject(Object.assign(new Error('D1_ERROR: no such column: secret_internal'), { status: 500, code: 'db_error' }));

const RAW_INQUIRY = {
  id: 'i-1',
  created_at: '2026-09-01T10:00:00.000Z',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  inquiry_type: 'general',
  status: 'new',
  message: 'Is the ministry accepting applications?',
  ip: '203.0.113.42',
};

const RAW_SCROLL_REQUEST = {
  id: 's-1',
  created_at: '2026-09-02T11:30:00.000Z',
  name: 'Grace Hopper',
  email: 'grace@example.com',
  request_type: 'foundational',
  status: 'pending',
  message: 'Requesting the foundational scroll.',
  ip: '198.51.100.7',
};

const RAW_CONSULTATION = {
  id: 'c-1',
  created_at: '2026-09-03T09:15:00.000Z',
  user_id: 'u-private-9f3c',
  name: 'Alan Turing',
  email: 'alan@example.com',
  topic: 'Ordination guidance',
  requested_at: '2026-09-20T00:00:00.000Z',
  status: 'requested',
  notes: 'INTERNAL: prior disciplinary matter, handle privately',
};

const PRIVATE_REASON = 'Misrepresented ministry authority in a civil filing';

const RAW_REVOKE = {
  id: 'a-1',
  created_at: '2026-09-04T14:00:00.000Z',
  actor_user_id: 'u-admin-77',
  actor_email: 'admin@blockchainministries.io',
  action: 'credential.revoke',
  entity_type: 'ordination',
  entity_id: 'ord-9',
  metadata_json: JSON.stringify({
    credential_number: 'BM-7K2QX9AZ',
    credential_version: 2,
    revoked_at: '2026-09-04T14:00:00.000Z',
    reason: PRIVATE_REASON,
  }),
  ip: '192.0.2.55',
  user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
};

const RAW_NOTIFY_FAILED = {
  id: 'a-2',
  created_at: '2026-09-05T08:00:00.000Z',
  actor_user_id: null,
  actor_email: null,
  action: 'notify.failed',
  entity_type: 'ordination',
  entity_id: 'ord-12',
  metadata_json: JSON.stringify({
    audience: 'admin',
    kind: 'ordination_application',
    reason: 'provider returned 500',
  }),
  ip: '192.0.2.88',
  user_agent: 'workerd',
};

/** Exactly the strings the table body would place in cells for this queue. */
function cellValues(queueKey, rawRows) {
  const queue = QUEUES[queueKey];
  return projectRows(queueKey, rawRows).flatMap((row) => queue.columns.map((col) => String(row[col.key])));
}

const contains = (values, needle) => values.some((v) => v.includes(needle));

/* =============================================================== TABS === */

test('1. the four new operational tabs exist, driven by the Phase 3 contract', () => {
  for (const key of ['inquiries', 'scrollRequests', 'consultations', 'activity']) {
    assert.ok(QUEUES[key], `${key} missing from the queue contract`);
  }
  assert.match(CODE, /OPERATIONAL_TABS\s*=\s*\[/);
  for (const key of ['QUEUES.inquiries', 'QUEUES.scrollRequests', 'QUEUES.consultations', 'QUEUES.activity']) {
    assert.ok(CODE.includes(key), `tab list must include ${key}`);
  }
  // Rendered from the contract, not hand-written a second time.
  assert.match(CODE, /OPERATIONAL_TABS\.map\(\(\{ queue, Icon \}\)/);
  assert.match(CODE, /value=\{queue\.key\}/);
  assert.match(CODE, /\{queue\.label\}/);
});

test('2. every pre-existing admin tab still exists', () => {
  for (const value of ['profiles', 'memberships', 'ordinations', 'donations', 'scrolls']) {
    assert.ok(CODE.includes(`<TabsTrigger value="${value}"`), `${value} trigger regressed`);
    assert.ok(CODE.includes(`<TabsContent value="${value}"`), `${value} panel regressed`);
  }
  // ...and still fetch and render the way they did before M13.
  for (const fragment of [
    "fetchData('profiles', setProfiles)",
    "fetchData('donations', setDonations)",
    "fetchData('scrolls', setScrolls)",
    "fetchData('memberships', setMemberships)",
    "fetchData('ordinations', setOrdinations)",
    'renderTable(profiles, profileColumns',
    'mapAdminRow',
  ]) {
    assert.ok(CODE.includes(fragment), `legacy behaviour regressed: ${fragment}`);
  }
});

test('3. no operational queue is fetched before its tab is activated', async () => {
  const client = fakeApi(ok([]));
  const store = createQueueStore(client);

  // Creating the dashboard's store issues nothing.
  assert.deepEqual(client.calls, []);
  for (const key of Object.keys(QUEUES)) assert.equal(store.state(key).status, IDLE);

  // And the only load() call site is inside the panel, which Radix mounts
  // only for the active tab — never in the dashboard's own mount effect.
  const mountEffect = CODE.split('useEffect(() => {')[1] || '';
  assert.ok(!mountEffect.slice(0, 400).includes('store.load'),
    'operational queues must not be loaded from the page mount effect');
  assert.equal((CODE.match(/store\.load\(/g) || []).length, 1, 'exactly one load call site');
  assert.match(M13_CODE, /useEffect\(\(\) => \{ store\.load\(queue\.key\); \}, \[store, queue\.key\]\)/);
});

test('4. activating a tab fetches exactly its configured endpoint, once', async () => {
  const expected = {
    inquiries: '/admin/contact-inquiries',
    scrollRequests: '/admin/scroll-requests',
    consultations: '/admin/consultations',
    activity: '/admin/audit-logs',
  };
  for (const [key, path] of Object.entries(expected)) {
    const client = fakeApi(ok([]));
    const store = createQueueStore(client);
    await store.load(key);
    assert.deepEqual(client.calls, [path], `${key} must request ${path} and nothing else`);
    assert.equal(store.state(key).status, READY);
  }
  // The paths are the contract's, not re-typed here or in the component.
  for (const path of Object.values(expected)) {
    assert.ok(!CODE.includes(path), `endpoint ${path} must not be hard-coded in the component`);
  }
});

test('5. returning to a loaded tab does not refetch', async () => {
  const client = fakeApi(ok([RAW_INQUIRY]));
  const store = createQueueStore(client);

  await store.load('inquiries');
  assert.equal(client.calls.length, 1);
  const first = store.state('inquiries');

  await store.load('inquiries');   // switch away and back
  await store.load('inquiries');   // and again
  assert.equal(client.calls.length, 1, 'cached rows must stand');
  assert.equal(store.state('inquiries'), first, 'snapshot identity must be stable');
});

test('5b. concurrent activation cannot issue a duplicate request', async () => {
  let resolve;
  const client = fakeApi(() => new Promise((r) => { resolve = r; }));
  const store = createQueueStore(client);

  const a = store.load('activity');
  const b = store.load('activity');
  assert.equal(client.calls.length, 1);
  assert.equal(store.state('activity').status, LOADING);
  resolve({ items: [] });
  await Promise.all([a, b]);
  assert.equal(client.calls.length, 1);
});

test('5c. one queue loading or failing does not disturb the others', async () => {
  const client = fakeApi((path) => (path === '/admin/audit-logs' ? boom() : Promise.resolve({ items: [RAW_INQUIRY] })));
  const store = createQueueStore(client);

  await store.load('inquiries');
  await store.load('activity');
  assert.equal(store.state('inquiries').status, READY);
  assert.equal(store.state('activity').status, ERROR);
  assert.equal(store.state('consultations').status, IDLE);
  assert.equal(store.state('inquiries').rows.length, 1, 'a failed queue must not clear a loaded one');
});

/* ========================================================= INQUIRIES === */

test('6. inquiry rows render the safe projected fields', () => {
  const values = cellValues('inquiries', [RAW_INQUIRY]);
  assert.equal(values.length, 6);
  assert.ok(contains(values, 'Ada Lovelace'));
  assert.ok(contains(values, 'ada@example.com'));
  assert.ok(contains(values, 'general'));
  assert.ok(contains(values, 'New'));
  assert.ok(contains(values, 'Is the ministry accepting applications?'));
});

test('7. an inquiry IP address cannot reach a cell — or the client at all', async () => {
  const values = cellValues('inquiries', [RAW_INQUIRY]);
  assert.ok(!contains(values, '203.0.113.42'), 'IP rendered');
  assert.ok(!contains(values, '203.0.113'));
  assert.ok(!QUEUES.inquiries.columns.some((c) => c.key === 'ip'));

  // Stronger than "unrendered": the raw response is discarded after
  // projection for every queue without a details disclosure.
  const client = fakeApi(ok([RAW_INQUIRY]));
  const store = createQueueStore(client);
  await store.load('inquiries');
  assert.deepEqual(store.state('inquiries').sources, [], 'raw inquiry rows must not be retained');
  assert.ok(!JSON.stringify(store.state('inquiries')).includes('203.0.113.42'));
});

test('8. an empty inquiry queue states so truthfully', async () => {
  const client = fakeApi(ok([]));
  const store = createQueueStore(client);
  await store.load('inquiries');
  const state = store.state('inquiries');
  assert.equal(state.status, READY);
  assert.deepEqual(state.rows, []);
  assert.equal(QUEUES.inquiries.empty, 'No contact inquiries yet.');
  assert.match(M13_CODE, /state\.rows\.length === 0[\s\S]{0,160}\{queue\.empty\}/);
});

test('9. a failed inquiry request shows a distinct error, never the backend text', async () => {
  const client = fakeApi(boom);
  const store = createQueueStore(client);
  await store.load('inquiries');
  const state = store.state('inquiries');

  assert.equal(state.status, ERROR);
  assert.equal(state.error, 'Could not load contact inquiries.');
  assert.notEqual(state.status, READY, 'a failure must never look like "no records"');
  assert.deepEqual(state.rows, []);

  const serialised = JSON.stringify(state);
  for (const leak of ['D1_ERROR', 'no such column', 'secret_internal', 'db_error', '500']) {
    assert.ok(!serialised.includes(leak), `backend detail leaked: ${leak}`);
  }
});

test('9c. REGRESSION: returning to a FAILED tab does not silently retry', async () => {
  // Found live in M13 Phase 5: load() used to restart an error, so revisiting
  // the tab resolved the failure on its own — the error flickered, an
  // unrequested GET fired, and Retry could become unreachable before use.
  let attempt = 0;
  const client = fakeApi(() => (++attempt === 1 ? boom() : Promise.resolve({ items: [RAW_INQUIRY] })));
  const store = createQueueStore(client);

  await store.load('inquiries');
  assert.equal(store.state('inquiries').status, ERROR);
  const errored = store.state('inquiries');

  await store.load('inquiries');   // switch away and back
  await store.load('inquiries');   // and again
  assert.equal(client.calls.length, 1, 'a failed queue must not refetch on revisit');
  assert.equal(store.state('inquiries'), errored, 'the error state must be stable');

  // Only the explicit control recovers it.
  await store.refresh('inquiries');
  assert.equal(client.calls.length, 2);
  assert.equal(store.state('inquiries').status, READY);
});

test('9b. Retry re-issues the request and recovers', async () => {
  let attempt = 0;
  const client = fakeApi(() => (++attempt === 1 ? boom() : Promise.resolve({ items: [RAW_INQUIRY] })));
  const store = createQueueStore(client);

  await store.load('inquiries');
  assert.equal(store.state('inquiries').status, ERROR);

  await store.refresh('inquiries');
  assert.equal(client.calls.length, 2);
  assert.equal(store.state('inquiries').status, READY);
  assert.equal(store.state('inquiries').rows.length, 1);

  assert.match(M13_CODE, /Retry/);
  assert.match(M13_CODE, /onClick=\{\(\) => store\.refresh\(queue\.key\)\}/);
});

/* ==================================================== SCROLL REQUESTS === */

test('10. scroll request rows render the safe projected fields', () => {
  const values = cellValues('scrollRequests', [RAW_SCROLL_REQUEST]);
  assert.equal(values.length, 6);
  assert.ok(contains(values, 'Grace Hopper'));
  assert.ok(contains(values, 'grace@example.com'));
  assert.ok(contains(values, 'foundational'));
  assert.ok(contains(values, 'Pending'));
  assert.ok(contains(values, 'Requesting the foundational scroll.'));
});

test('11. a scroll request IP cannot reach a cell — or the client at all', async () => {
  const values = cellValues('scrollRequests', [RAW_SCROLL_REQUEST]);
  assert.ok(!contains(values, '198.51.100.7'));
  assert.ok(!QUEUES.scrollRequests.columns.some((c) => c.key === 'ip'));

  const client = fakeApi(ok([RAW_SCROLL_REQUEST]));
  const store = createQueueStore(client);
  await store.load('scrollRequests');
  assert.deepEqual(store.state('scrollRequests').sources, []);
});

test('12. no fulfil / reject / upload / publish action exists anywhere in M13 UI', () => {
  for (const forbidden of [
    'Fulfil', 'Fulfill', 'Reject', 'Approve', 'Archive', 'Mark read', 'Mark as read',
    'Reply', 'Upload', 'Publish', 'Schedule', 'Cancel', 'Complete', 'Resend', 'Send again',
  ]) {
    assert.ok(!M13_CODE.includes(forbidden), `M13 must add no ${forbidden} control`);
  }
  // No mutation verb is reachable from this page at all.
  assert.ok(!/api\.(post|patch|put|delete)\b/.test(CODE), 'the dashboard must issue no mutations');
  assert.ok(!/\bR2\b|\br2_key\b|presigned?\b/i.test(M13_CODE), 'no document/R2 surface in M13');
});

/* ====================================================== CONSULTATIONS === */

test('13. consultation rows render the safe projected fields', () => {
  const values = cellValues('consultations', [RAW_CONSULTATION]);
  assert.equal(values.length, 6);
  assert.ok(contains(values, 'Alan Turing'));
  assert.ok(contains(values, 'alan@example.com'));
  assert.ok(contains(values, 'Ordination guidance'));
  assert.ok(contains(values, 'Requested'));
});

test('14. the internal user_id cannot reach a cell — or the client at all', async () => {
  const values = cellValues('consultations', [RAW_CONSULTATION]);
  assert.ok(!contains(values, 'u-private-9f3c'), 'internal user id rendered');
  assert.ok(!QUEUES.consultations.columns.some((c) => c.key === 'user_id'));

  const client = fakeApi(ok([RAW_CONSULTATION]));
  const store = createQueueStore(client);
  await store.load('consultations');
  assert.ok(!JSON.stringify(store.state('consultations')).includes('u-private-9f3c'));
});

test('15. private consultation notes cannot reach a cell — or the client at all', async () => {
  const values = cellValues('consultations', [RAW_CONSULTATION]);
  assert.ok(!contains(values, 'INTERNAL'), 'private notes rendered');
  assert.ok(!contains(values, 'disciplinary'));
  assert.ok(!QUEUES.consultations.columns.some((c) => c.key === 'notes'));

  const client = fakeApi(ok([RAW_CONSULTATION]));
  const store = createQueueStore(client);
  await store.load('consultations');
  assert.ok(!JSON.stringify(store.state('consultations')).includes('disciplinary'));
});

test('16. no scheduling surface was invented for consultations', () => {
  for (const forbidden of ['calendar', 'Calendar', 'meeting', 'Meeting', 'scheduled_at', 'Book ', 'ics']) {
    assert.ok(!M13_CODE.includes(forbidden), `M13 must not invent ${forbidden}`);
  }
  // `requested` is the member's own stated date, read from the row — not a
  // ministry-side appointment this UI claims to set.
  assert.ok(QUEUES.consultations.columns.some((c) => c.key === 'requested'));
});

/* =========================================================== ACTIVITY === */

test('17. activity rows render the safe list fields', () => {
  const [row] = projectRows('activity', [RAW_REVOKE]);
  assert.equal(row.when.length > 0, true);
  assert.equal(row.action, 'Credential revoked');
  assert.equal(row.actor, 'admin@blockchainministries.io');
  assert.equal(row.entity, 'ordination · ord-9');
  assert.equal(row.summary, 'BM-7K2QX9AZ');
  assert.equal(row.hasDetails, true);
});

test('18. raw metadata_json is never rendered and never reaches a row object', () => {
  const [row] = projectRows('activity', [RAW_REVOKE]);
  assert.ok(!('metadata_json' in row));
  const values = cellValues('activity', [RAW_REVOKE]);
  assert.ok(!contains(values, '{'), 'no JSON fragment in any cell');
  assert.ok(!contains(values, 'credential_version'), 'no raw key names in any cell');
  // And the component has no generic object inspector to fall back on.
  assert.ok(!/JSON\.stringify/.test(CODE), 'no raw object serialisation in the dashboard');
  assert.ok(!/metadata_json/.test(CODE), 'the component must not name metadata_json');
});

test('19-21. actor_user_id, ip and user_agent are absent from activity rows and cells', () => {
  const [row] = projectRows('activity', [RAW_REVOKE]);
  for (const key of ['actor_user_id', 'ip', 'user_agent']) {
    assert.ok(!(key in row), `${key} present on the projected row`);
  }
  const values = cellValues('activity', [RAW_REVOKE]);
  assert.ok(!contains(values, 'u-admin-77'), 'actor_user_id rendered');
  assert.ok(!contains(values, '192.0.2.55'), 'ip rendered');
  assert.ok(!contains(values, 'Mozilla'), 'user_agent rendered');
  assert.ok(!contains(values, 'Macintosh'));

  const stripped = CODE.replace(/\s+/g, ' ');
  for (const forbidden of [/\bactor_user_id\b/, /\buser_agent\b/, /\bip\b/]) {
    assert.ok(!forbidden.test(stripped), `component references ${forbidden}`);
  }
});

/* ============================================================ DETAILS === */

test('22. a row with details exposes a real, accessible, keyboard-reachable control', () => {
  const [row] = projectRows('activity', [RAW_REVOKE]);
  assert.equal(row.hasDetails, true);

  assert.match(M13_CODE, /\{row\.hasDetails && \(/, 'the control is gated on hasDetails');
  assert.match(M13_CODE, /<Button[\s\S]{0,400}aria-expanded=\{open\}/, 'must be a real button with aria-expanded');
  assert.match(M13_CODE, /aria-controls=\{detailsId\}/);
  assert.match(M13_CODE, /type="button"/);
  assert.match(M13_CODE, /'Hide details' : 'View details'/);
  assert.match(M13_CODE, /focus-visible:ring/, 'focus must stay visible');
  assert.match(M13_CODE, /<TableRow id=\{detailsId\}/, 'the disclosure is identified by its control');
});

test('23. details are closed by default, and produce nothing while closed', () => {
  assert.match(M13_CODE, /useState\(false\)/, 'the disclosure must start closed');
  assert.deepEqual(disclosedDetails(RAW_REVOKE, false), [], 'closed must yield no content');
  // Closed renders no markup at all — not markup that is hidden.
  assert.match(M13_CODE, /\{open && details\.length > 0 && \(/);
  // `aria-hidden` on a decorative icon is fine; a `hidden` attribute concealing
  // real content is not.
  assert.ok(!/(?<![-\w])hidden=/.test(M13_CODE), 'the disclosure must not rely on a hidden attribute');
  assert.ok(!/(display:\s*none|\binvisible\b|sr-only[^"]*\{d\.)/.test(M13_CODE),
    'the disclosure must not rely on CSS to conceal content');
});

test('24. opening yields exactly the Phase 3 projected details, nothing derived locally', () => {
  const details = disclosedDetails(RAW_REVOKE, true);
  assert.deepEqual(details.map((d) => d.key), ['credential_number', 'credential_version', 'revoked_at', 'reason']);
  assert.deepEqual(details.map((d) => d.label), ['Credential No.', 'Version', 'Revoked at', 'Reason']);
  assert.equal(details.at(-1).value, PRIVATE_REASON);

  // The component renders that list and computes nothing of its own.
  assert.match(M13_CODE, /disclosedDetails\(source, open\)/);
  assert.match(M13_CODE, /details\.map\(\(d\) =>/);
  assert.match(M13_CODE, /\{d\.label\}[\s\S]{0,120}\{d\.value\}/);
  assert.ok(!/METADATA_KEYS|ACTION_LABELS|safeMetadata|projectMetadata/.test(CODE),
    'the component must not restate any Phase 3 allow-list');
});

test('25. closing removes the disclosure content', () => {
  assert.deepEqual(disclosedDetails(RAW_REVOKE, true).length > 0, true);
  assert.deepEqual(disclosedDetails(RAW_REVOKE, false), []);
  // Toggling is the only thing the control does.
  assert.match(M13_CODE, /onClick=\{\(\) => setOpen\(\(v\) => !v\)\}/);
});

test('25b. the raw audit row is handed whole to the gate and touched nowhere else', () => {
  // Three permitted appearances: the prop passed down, the parameter, the gate.
  assert.equal((M13_CODE.match(/\bsource\b/g) || []).length, 3, 'unexpected use of the raw row');
  assert.match(M13_CODE, /source=\{state\.sources\[i\]\}/);
  assert.match(M13_CODE, /function ActivityRow\(\{ row, source, columns \}\)/);
  assert.match(M13_CODE, /disclosedDetails\(source, open\)/);
  // No property is ever read off it, directly or through the array.
  assert.ok(!/\bsource\./.test(M13_CODE), 'no property access on the raw row');
  assert.ok(!/sources\[[^\]]*\]\./.test(M13_CODE), 'no property access on a raw row in place');
  assert.ok(!/\.\.\.(row|raw|source|item)\b/.test(CODE), 'no raw row may be spread into a view object');
});

/* ================================================= REVOCATION PRIVACY === */

test('26. the revocation reason is absent everywhere before deliberate disclosure', () => {
  // Not in the projected row, in any form.
  const [row] = projectRows('activity', [RAW_REVOKE]);
  assert.ok(!('reason' in row));
  assert.ok(!JSON.stringify(row).includes(PRIVATE_REASON));
  assert.ok(!JSON.stringify(row).includes('Misrepresented'));

  // Not in any cell the table renders — Summary included.
  const values = cellValues('activity', [RAW_REVOKE]);
  assert.ok(!contains(values, PRIVATE_REASON));
  assert.ok(!contains(values, 'Misrepresented'));
  assert.equal(row.summary, 'BM-7K2QX9AZ', 'the summary carries the credential, never the reason');

  // Not through the closed disclosure.
  assert.deepEqual(disclosedDetails(RAW_REVOKE, false), []);

  // And not smuggled through an attribute: the component sets no title or
  // aria-label from row data anywhere in the activity table.
  assert.ok(!/title=\{/.test(M13_CODE), 'no title attribute may carry row data');
  assert.ok(!/aria-label=\{[^}]*row\./.test(M13_CODE), 'no aria-label may carry row data');
});

test('27. the reason appears only after the explicit details action', () => {
  const opened = disclosedDetails(RAW_REVOKE, true);
  const reason = opened.find((d) => d.key === 'reason');
  assert.ok(reason, 'an admin who opens the row must be able to read it');
  assert.equal(reason.value, PRIVATE_REASON);
  assert.equal(reason.label, 'Reason');
});

test('28. an unrelated action carrying a reason key cannot expose it', () => {
  for (const action of ['credential.view', 'credential.reissue', 'ordination.approve', 'donation.recorded', 'auth.login.failure', 'made.up.action']) {
    const row = { ...RAW_REVOKE, action, metadata_json: JSON.stringify({ reason: PRIVATE_REASON, credential_number: 'BM-AAAA1111' }) };
    const values = cellValues('activity', [row]);
    assert.ok(!contains(values, PRIVATE_REASON), `${action} leaked a reason into the list`);
    const opened = disclosedDetails(row, true);
    assert.ok(!opened.some((d) => d.key === 'reason'), `${action} leaked a reason into details`);
    assert.ok(!JSON.stringify(opened).includes(PRIVATE_REASON));
  }
});

test('28b. an auth failure IP cannot surface through the activity table', () => {
  // packages/auth records the caller IP inside this action's metadata.
  const row = {
    ...RAW_REVOKE, action: 'auth.login.failure',
    metadata_json: JSON.stringify({ ip: '203.0.113.9' }),
  };
  assert.ok(!contains(cellValues('activity', [row]), '203.0.113.9'));
  assert.deepEqual(disclosedDetails(row, true), []);
});

/* ====================================================== NOTIFY FAILED === */

test('29. a failed notification is labelled as one', () => {
  const [row] = projectRows('activity', [RAW_NOTIFY_FAILED]);
  assert.equal(row.action, 'Notification failed');
  assert.ok(contains(cellValues('activity', [RAW_NOTIFY_FAILED]), 'Notification failed'));
});

test('30. the list summary names the audience and the notification kind', () => {
  const [row] = projectRows('activity', [RAW_NOTIFY_FAILED]);
  assert.equal(row.summary, 'admin · ordination_application');
  assert.equal(row.hasDetails, true);
});

test('31. the failure reason is details-only', () => {
  const values = cellValues('activity', [RAW_NOTIFY_FAILED]);
  assert.ok(!contains(values, 'provider returned 500'), 'reason must not sit in the list');
  assert.deepEqual(disclosedDetails(RAW_NOTIFY_FAILED, false), []);
  const opened = disclosedDetails(RAW_NOTIFY_FAILED, true);
  assert.deepEqual(opened.map((d) => d.label), ['Audience', 'Notification', 'Reason']);
  assert.equal(opened.at(-1).value, 'provider returned 500');
});

test('32. no recipient address or message body is rendered', () => {
  const row = {
    ...RAW_NOTIFY_FAILED,
    metadata_json: JSON.stringify({
      audience: 'submitter', kind: 'contact_inquiry', reason: 'threw',
      to: 'member@example.com', body: 'Dear friend, your application...',
    }),
  };
  const values = cellValues('activity', [row]);
  const opened = JSON.stringify(disclosedDetails(row, true));
  for (const leak of ['member@example.com', 'Dear friend', 'your application']) {
    assert.ok(!contains(values, leak), `${leak} rendered in the list`);
    assert.ok(!opened.includes(leak), `${leak} rendered in details`);
  }
  // No retry/send control was invented for Phase 4.
  assert.ok(!/Retry send|Resend|retryNotification/.test(M13_CODE));
});

test('32b. a failed notification is not signalled by colour alone', () => {
  assert.match(M13_CODE, /failed = row\.actionKey === 'notify\.failed'/);
  assert.match(M13_CODE, /col\.key === 'action' && failed \? \([\s\S]{0,300}<AlertTriangle/,
    'the failure marker must pair an icon with the textual label');
  assert.match(M13_CODE, /aria-hidden="true"/, 'the decorative icon must not be announced twice');
});

/* ======================================================== RESPONSIVE === */

test('33. the nine-tab list wraps instead of crushing labels or overflowing the page', () => {
  const list = (CODE.match(/<TabsList className="([^"]+)"/) || [])[1] || '';
  assert.ok(list.includes('flex-wrap'), 'the tab list must wrap');
  assert.ok(list.includes('h-auto'), 'wrapped rows need an auto height');
  assert.ok(!list.includes('grid-cols-'), 'the fixed grid must be gone');
  assert.ok(!/min-w-\[/.test(list), 'the tab list must not force a minimum width');
  assert.ok(!/overflow-x-hidden/.test(CODE), 'M13 must not hide page overflow to mask a layout bug');

  // Nine triggers: five legacy plus four rendered from the contract.
  assert.equal((CODE.match(/<TabsTrigger value="/g) || []).length, 5);
  assert.equal((CODE.match(/<TabsTrigger key=\{queue\.key\}/g) || []).length, 1);
  assert.equal(Object.keys(QUEUES).length, 4);
});

test('34. M13 tables keep horizontal scrolling contained, as M12 established', () => {
  assert.match(M13_CODE, /<div className="w-full overflow-x-auto">/);
  assert.match(M13_CODE, /<Table className="min-w-\[\d+px\]">/);
  // The page wrapper is unchanged and still has no horizontal scroll of its own.
  assert.ok(CODE.includes('<div className="p-4 md:p-8">'));
});

/* ===================================================== ACCESSIBILITY === */

test('A1. loading, error and empty states are all readable as text', () => {
  assert.match(M13_CODE, /role="status"/);
  assert.match(M13_CODE, /Loading \{queue\.label\.toLowerCase\(\)\}/);
  assert.match(M13_CODE, /role="alert"/);
  assert.match(M13_CODE, /\{state\.error\}/);
  assert.match(M13_CODE, /\{queue\.empty\}/);
  for (const q of Object.values(QUEUES)) {
    assert.match(q.empty, /^No .+ yet\.$/, `${q.key} needs a truthful empty sentence`);
    assert.match(q.error, /^Could not load .+\.$/, `${q.key} needs a safe error sentence`);
  }
});

test('A2. the details column header and refresh control are labelled for screen readers', () => {
  assert.match(M13_CODE, /<span className="sr-only">Details<\/span>/);
  assert.match(M13_CODE, /aria-label=\{`Refresh \$\{queue\.label\}`\}/);
});

/* ========================================================== CONTRACT === */

test('C1. the component imports the queue contract and adds no projection of its own', () => {
  assert.match(CODE, /import \{ QUEUES \} from '\.\/adminQueues'/);
  assert.match(CODE, /import \{ createQueueStore, disclosedDetails, LOADING, READY, ERROR \} from '\.\/adminQueueState'/);
  // Columns, paths, empty/error copy and projections all come from the contract.
  assert.match(M13_CODE, /queue\.columns\.map/);
  assert.match(M13_CODE, /\{row\[col\.key\]\}/);
  assert.ok(!/project(Inquiry|ScrollRequest|Consultation|Activity)\b/.test(CODE),
    'the component must not call a projector directly; the store does');
});

test('C2. the store holds raw rows only for the queue that discloses details', async () => {
  for (const key of ['inquiries', 'scrollRequests', 'consultations']) {
    assert.ok(!QUEUES[key].details, `${key} must declare no details projector`);
  }
  assert.equal(typeof QUEUES.activity.details, 'function');

  const client = fakeApi(ok([RAW_REVOKE]));
  const store = createQueueStore(client);
  await store.load('activity');
  assert.equal(store.state('activity').sources.length, 1, 'activity needs its sources for disclosure');
});

test('C3. a malformed or hostile response degrades instead of crashing', async () => {
  for (const payload of [{}, { items: null }, { items: 'nope' }, null, { items: [null, 7, 'x', {}] }]) {
    const store = createQueueStore(fakeApi(() => Promise.resolve(payload)));
    await store.load('activity');
    const state = store.state('activity');
    assert.equal(state.status, READY);
    assert.ok(Array.isArray(state.rows));
    for (const row of state.rows) {
      assert.equal(typeof row.when, 'string');
      assert.equal(row.hasDetails, false);
    }
  }
  // Junk metadata on a real row must not break the disclosure either.
  for (const junk of [null, '', '   ', '{not json', '[1,2,3]', '"str"', '42', 'true']) {
    const row = { ...RAW_REVOKE, metadata_json: junk };
    assert.deepEqual(disclosedDetails(row, false), []);
    assert.deepEqual(disclosedDetails(row, true), []);
    assert.ok(Array.isArray(cellValues('activity', [row])));
  }
});

test('C4. the state module is pure: no React, no DOM, no fetch, no timers', () => {
  const src = readFileSync(new URL('./adminQueueState.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  for (const forbidden of [/from 'react'/, /document\./, /window\./, /fetch\(/, /setTimeout|setInterval/, /localStorage/]) {
    assert.ok(!forbidden.test(src), `state module must not use ${forbidden}`);
  }
  assert.match(src, /from '\.\/adminQueues\.js'/, 'projections must be imported, never restated');
  // No background polling was invented.
  assert.ok(!/poll|Interval/i.test(src.replace(/import[^\n]*\n/g, '')));
});
