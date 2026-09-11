/**
 * M13 Phase 3 — admin queue projections and the privacy boundary.
 *
 * The central property under test: a projection can only ever emit fields that
 * were explicitly allow-listed. Raw rows are never spread, so a private field
 * cannot reach a screen by accident — including fields that do not exist yet.
 *
 * Run: node --test src/pages/admin/adminQueues.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  QUEUES, projectRows, projectInquiry, projectScrollRequest, projectConsultation,
  projectActivity, projectActivityDetails, safeMetadata,
  formatWhen, formatDate, formatStatus, formatAction, text, EMPTY,
} from './adminQueues.js';

const ADMIN_ROUTES = readFileSync(new URL('../../../worker/routes/admin.js', import.meta.url), 'utf8');

const REVOCATION_REASON = 'PRIVATE INTERNAL CONDUCT REASON';
const serialize = (v) => JSON.stringify(v);

/* ---------------------------------------------------------- queue config -- */

test('1. all four queues map to endpoints that really exist in admin.js', () => {
  const expected = {
    inquiries: '/admin/contact-inquiries',
    scrollRequests: '/admin/scroll-requests',
    consultations: '/admin/consultations',
    activity: '/admin/audit-logs',
  };
  for (const [key, path] of Object.entries(expected)) {
    assert.equal(QUEUES[key].path, path);
    assert.ok(ADMIN_ROUTES.includes(`'/api${path}'`), `worker has no route for ${path}`);
  }
});

test('2. no endpoint is invented and every queue is fully specified', () => {
  assert.deepEqual(Object.keys(QUEUES).sort(), ['activity', 'consultations', 'inquiries', 'scrollRequests']);
  for (const q of Object.values(QUEUES)) {
    assert.match(q.path, /^\/admin\/[a-z-]+$/);
    assert.equal(typeof q.project, 'function');
    assert.ok(q.columns.length > 0);
    assert.ok(q.empty && q.error, 'empty/error labels required');
  }
});

/* ------------------------------------------------------------- inquiries -- */

const RAW_INQUIRY = {
  id: 'c-1', name: 'Sam Visitor', email: 'sam@example.invalid',
  message: 'Please send information.', inquiry_type: 'General', status: 'new',
  ip: '203.0.113.55', created_at: '2026-09-11T01:00:00.000Z',
};

test('3-4. inquiry projects safe fields and drops ip', () => {
  const p = projectInquiry(RAW_INQUIRY);
  assert.deepEqual(Object.keys(p).sort(), ['email', 'id', 'message', 'name', 'received', 'status', 'type']);
  assert.equal(p.name, 'Sam Visitor');
  assert.equal(p.type, 'General');
  assert.equal(p.status, 'New');
  assert.ok(!serialize(p).includes('203.0.113.55'), 'ip leaked');
  assert.equal(p.ip, undefined);
});

/* -------------------------------------------------------- scroll requests -- */

const RAW_SCROLL = {
  id: 's-1', name: 'Pat Requester', email: 'pat@example.invalid',
  request_type: 'Diplomatic Credentials', message: 'Requesting a copy.',
  status: 'pending', ip: '198.51.100.7', created_at: '2026-09-11T01:00:00.000Z',
};

test('5-6. scroll request projects safe fields and drops ip', () => {
  const p = projectScrollRequest(RAW_SCROLL);
  assert.deepEqual(Object.keys(p).sort(), ['email', 'id', 'message', 'name', 'received', 'requestType', 'status']);
  assert.equal(p.requestType, 'Diplomatic Credentials');
  assert.ok(!serialize(p).includes('198.51.100.7'), 'ip leaked');
});

/* --------------------------------------------------------- consultations -- */

const RAW_CONSULT = {
  id: 'k-1', user_id: 'u-secret-123', name: 'Lee Seeker', email: 'lee@example.invalid',
  topic: 'Guidance', requested_at: '2026-09-20T00:00:00.000Z', scheduled_at: null,
  status: 'requested', notes: 'INTERNAL STAFF NOTE', created_at: '2026-09-11T01:00:00.000Z',
  updated_at: '2026-09-11T01:00:00.000Z',
};

test('7-9. consultation projects safe fields; user_id and notes excluded', () => {
  const p = projectConsultation(RAW_CONSULT);
  assert.deepEqual(Object.keys(p).sort(), ['email', 'id', 'name', 'received', 'requested', 'status', 'topic']);
  const raw = serialize(p);
  assert.ok(!raw.includes('u-secret-123'), 'user_id leaked');
  assert.ok(!raw.includes('INTERNAL STAFF NOTE'), 'internal notes leaked');
});

test('no consultation mutation/scheduling surface is invented', () => {
  assert.equal(QUEUES.consultations.actions, undefined);
  assert.ok(!QUEUES.consultations.columns.some(c => /schedul/i.test(c.label)));
});

/* -------------------------------------------------------------- activity -- */

const RAW_AUDIT = {
  id: 'a-1', actor_user_id: 'u-admin-999', actor_email: 'admin@bm.test',
  action: 'credential.revoke', entity_type: 'ordination', entity_id: 'o-1',
  metadata_json: JSON.stringify({
    credential_number: 'BM-7K2QX9AZ', credential_version: 1,
    revoked_at: '2026-09-11T01:00:00.000Z', reason: REVOCATION_REASON,
  }),
  ip: '203.0.113.9', user_agent: 'Mozilla/5.0 SecretAgent',
  created_at: '2026-09-11T01:00:00.000Z',
};

test('10-14. activity list drops actor_user_id, ip, user_agent and raw metadata', () => {
  const p = projectActivity(RAW_AUDIT);
  assert.deepEqual(Object.keys(p).sort(),
    ['action', 'actionKey', 'actor', 'entity', 'hasDetails', 'id', 'summary', 'when']);

  const raw = serialize(p);
  assert.ok(!raw.includes('u-admin-999'), '11. actor_user_id leaked');
  assert.ok(!raw.includes('203.0.113.9'), '12. ip leaked');
  assert.ok(!raw.includes('SecretAgent'), '13. user_agent leaked');
  assert.equal(p.metadata_json, undefined, '14. raw metadata_json exposed');
  assert.ok(!raw.includes('metadata_json'));

  assert.equal(p.action, 'Credential revoked');
  assert.equal(p.actor, 'admin@bm.test');
  assert.equal(p.entity, 'ordination · o-1');
});

test('activity columns never include a raw metadata column', () => {
  for (const c of QUEUES.activity.columns) {
    assert.ok(!/metadata/i.test(c.key), `metadata column exposed: ${c.key}`);
  }
});

/* -------------------------------------------------------------- metadata -- */

test('15-18. malformed, null, primitive and array metadata are all safe', () => {
  for (const bad of [null, undefined, '', '   ', '{not json', '[1,2,3]', '"a string"', '42', 'true']) {
    assert.doesNotThrow(() => safeMetadata(bad), `threw on ${JSON.stringify(bad)}`);
    assert.deepEqual(safeMetadata(bad), {}, `leaked for ${JSON.stringify(bad)}`);
    const row = { ...RAW_AUDIT, metadata_json: bad };
    assert.doesNotThrow(() => projectActivity(row));
    assert.doesNotThrow(() => projectActivityDetails(row));
    assert.deepEqual(projectActivityDetails(row), []);
  }
});

test('18b. unknown metadata keys never become visible', () => {
  const row = {
    ...RAW_AUDIT,
    action: 'credential.reissue',
    metadata_json: JSON.stringify({
      credential_number: 'BM-ABCD1234',
      secret_token: 'sk_live_SHOULD_NEVER_SHOW',
      internal_note: 'HIDDEN',
      password: 'HIDDEN',
    }),
  };
  const raw = serialize(projectActivity(row)) + serialize(projectActivityDetails(row));
  assert.ok(!raw.includes('sk_live_SHOULD_NEVER_SHOW'));
  assert.ok(!raw.includes('HIDDEN'));
  assert.ok(raw.includes('BM-ABCD1234'), 'allow-listed key should still show');
});

test('nested objects are never rendered', () => {
  const row = {
    ...RAW_AUDIT, action: 'ordination.approve',
    metadata_json: JSON.stringify({ credential_number: 'BM-X', minting: { status: 'error', hash: 'deadbeef' } }),
  };
  const raw = serialize(projectActivity(row)) + serialize(projectActivityDetails(row));
  assert.ok(!raw.includes('deadbeef'));
  assert.ok(!raw.includes('minting'));
});

/* ---------------------------------------------------- REVOCATION PRIVACY -- */

test('19. credential.revoke reason is ABSENT from the list projection', () => {
  const p = projectActivity(RAW_AUDIT);
  const raw = serialize(p);
  assert.ok(!raw.includes(REVOCATION_REASON), 'private revocation reason reached the list');
  assert.ok(!raw.includes('reason'));
  // the list still identifies WHICH credential, which is the useful part
  assert.ok(p.summary.includes('BM-7K2QX9AZ'));
  assert.equal(p.hasDetails, true, 'the row advertises that details exist');
});

test('20. reason is available ONLY through the explicit details projection', () => {
  const details = projectActivityDetails(RAW_AUDIT);
  const reason = details.find(d => d.key === 'reason');
  assert.ok(reason, 'admin must be able to see why, deliberately');
  assert.equal(reason.value, REVOCATION_REASON);
  assert.equal(reason.label, 'Reason');
  // and it required calling a different function than the list
  assert.notEqual(projectActivity, projectActivityDetails);
});

test('21. a "reason" key on an unrelated action cannot surface', () => {
  for (const action of ['credential.view', 'credential.reissue', 'ordination.approve',
                        'donation.recorded', 'auth.login.failure', 'some.unknown.action']) {
    const row = {
      ...RAW_AUDIT, action,
      metadata_json: JSON.stringify({ reason: REVOCATION_REASON, credential_number: 'BM-X' }),
    };
    const raw = serialize(projectActivity(row)) + serialize(projectActivityDetails(row));
    assert.ok(!raw.includes(REVOCATION_REASON),
      `reason surfaced for ${action}, which does not allow it`);
  }
});

test('auth.login.failure metadata ip (written by packages/auth) never surfaces', () => {
  const row = {
    ...RAW_AUDIT, action: 'auth.login.failure',
    metadata_json: JSON.stringify({ ip: '203.0.113.77' }),
  };
  const raw = serialize(projectActivity(row)) + serialize(projectActivityDetails(row));
  assert.ok(!raw.includes('203.0.113.77'), 'IP from auth metadata leaked');
});

/* --------------------------------------------------------- notify.failed -- */

const RAW_NOTIFY_FAILED = {
  id: 'a-2', actor_user_id: 'u-alice', actor_email: 'u-alice@bm.test',
  action: 'notify.failed', entity_type: 'ordination', entity_id: 'o-9',
  metadata_json: JSON.stringify({ audience: 'admin', kind: 'ordination_application', reason: 'provider returned 500' }),
  ip: '203.0.113.1', user_agent: 'UA', created_at: '2026-09-11T02:00:00.000Z',
};

test('22. notify.failed is obvious in the list and names audience + kind', () => {
  const p = projectActivity(RAW_NOTIFY_FAILED);
  assert.equal(p.action, 'Notification failed');
  assert.ok(p.summary.includes('admin'));
  assert.ok(p.summary.includes('ordination_application'));
});

test('23. the failure reason is details-only', () => {
  const list = serialize(projectActivity(RAW_NOTIFY_FAILED));
  assert.ok(!list.includes('provider returned 500'), 'reason must not be in the list');
  const details = projectActivityDetails(RAW_NOTIFY_FAILED);
  assert.equal(details.find(d => d.key === 'reason').value, 'provider returned 500');
});

test('24. no arbitrary notify.failed metadata leaks, and no recipient address', () => {
  const row = {
    ...RAW_NOTIFY_FAILED,
    metadata_json: JSON.stringify({
      audience: 'admin', kind: 'ordination_application', reason: 'threw',
      to: 'ops@bm.test', body: 'A new ordination application was submitted.',
    }),
  };
  const raw = serialize(projectActivity(row)) + serialize(projectActivityDetails(row));
  assert.ok(!raw.includes('ops@bm.test'), 'recipient leaked');
  assert.ok(!raw.includes('A new ordination application'), 'email body leaked');
});

/* ------------------------------------------------------------ formatting -- */

test('25. null and malformed dates degrade to a neutral marker', () => {
  for (const bad of [null, undefined, '', 'not-a-date', {}, []]) {
    assert.equal(formatWhen(bad), EMPTY);
    assert.equal(formatDate(bad), EMPTY);
  }
  assert.notEqual(formatWhen('2026-09-11T01:00:00.000Z'), EMPTY);
});

test('26. unknown statuses and actions degrade without invention', () => {
  assert.equal(formatStatus(null), EMPTY);
  assert.equal(formatStatus(''), EMPTY);
  assert.equal(formatStatus('pending_review'), 'Pending review');
  // an unknown action falls back to its own machine name, never a guess
  assert.equal(formatAction('some.brand.new.action'), 'some.brand.new.action');
  assert.equal(formatAction(null), EMPTY);
  assert.equal(formatAction('credential.revoke'), 'Credential revoked');
});

test('missing values never throw and never fabricate', () => {
  for (const project of [projectInquiry, projectScrollRequest, projectConsultation, projectActivity]) {
    assert.doesNotThrow(() => project(undefined));
    assert.doesNotThrow(() => project(null));
    assert.doesNotThrow(() => project({}));
    const p = project({});
    for (const v of Object.values(p)) {
      assert.ok(v === EMPTY || v === false || typeof v === 'string' || typeof v === 'boolean');
    }
  }
  assert.equal(text(undefined), EMPTY);
  assert.equal(text('  '), EMPTY);
  assert.equal(text(0), '0');
});

/* ------------------------------------------------------------ projectRows -- */

test('projectRows projects a whole response and degrades on junk', () => {
  const rows = projectRows('inquiries', [RAW_INQUIRY, RAW_INQUIRY]);
  assert.equal(rows.length, 2);
  assert.ok(!serialize(rows).includes('203.0.113.55'));

  for (const junk of [null, undefined, 'nope', {}, 42]) {
    assert.deepEqual(projectRows('inquiries', junk), []);
  }
  assert.deepEqual(projectRows('nosuchqueue', [RAW_INQUIRY]), []);
});

test('REGRESSION: no projection ever spreads the raw row', () => {
  const src = readFileSync(new URL('./adminQueues.js', import.meta.url), 'utf8');
  assert.ok(!/\.\.\.row/.test(src), 'spreading a raw row would defeat the entire allow-list');
  assert.ok(!/\.\.\.raw/.test(src));
});

test('the module is pure — no React, fetch, DOM, storage or env', () => {
  const src = readFileSync(new URL('./adminQueues.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['react', 'fetch(', 'document.', 'window.', 'localStorage',
                           'sessionStorage', 'import.meta.env', 'process.env', 'useState']) {
    assert.ok(!code.includes(forbidden), `impurity: ${forbidden}`);
  }
});
