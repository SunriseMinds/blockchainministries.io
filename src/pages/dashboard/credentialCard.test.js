/**
 * M11 Phase 7 — member credential UX logic.
 * Run: node --test src/pages/dashboard/credentialCard.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credentialView } from './credentialCard.js';

const AVAILABLE = {
  id: 'o-1', status: 'approved', verify_slug: 'slug-alice',
  credential_available: true, credential_revoked: false, credential_number: 'BM-7K2QX9AZ',
};

test('an available credential offers View Credential pointing at the delivery route', () => {
  const v = credentialView(AVAILABLE);
  assert.equal(v.state, 'available');
  assert.equal(v.canView, true);
  assert.equal(v.href, '/api/ordination/o-1/credential');
  assert.equal(v.verifyPath, '/verify/slug-alice');
  assert.equal(v.credentialNumber, 'BM-7K2QX9AZ');
});

test('a revoked credential offers NO action and says so truthfully', () => {
  const v = credentialView({ ...AVAILABLE, credential_available: false, credential_revoked: true });
  assert.equal(v.state, 'revoked');
  assert.equal(v.canView, false);
  assert.equal(v.href, null);
  assert.equal(v.label, 'Credential revoked');
  assert.match(v.detail, /revoked/i);
});

test('the revocation reason can never surface — it is not in the model', () => {
  const hostile = {
    ...AVAILABLE, credential_available: false, credential_revoked: true,
    revocation_reason: 'PRIVATE REASON', revoked_by: 'u-admin',
  };
  const serialized = JSON.stringify(credentialView(hostile));
  assert.ok(!serialized.includes('PRIVATE REASON'));
  assert.ok(!serialized.includes('u-admin'));
});

test('pending, rejected and never-issued are distinguished and none offer an action', () => {
  const pending = credentialView({ id: 'o-1', status: 'pending', credential_available: false });
  assert.equal(pending.state, 'pending');
  assert.equal(pending.canView, false);

  const rejected = credentialView({ id: 'o-1', status: 'rejected', credential_available: false });
  assert.equal(rejected.state, 'rejected');
  assert.equal(rejected.canView, false);

  // Approved but never issued — every pre-M11 row.
  const legacy = credentialView({ id: 'o-1', status: 'approved', credential_available: false });
  assert.equal(legacy.state, 'unavailable');
  assert.equal(legacy.label, 'Credential unavailable');
  assert.equal(legacy.canView, false);
});

test('availability is taken from the server flag, never re-derived', () => {
  // A row that looks issued but is not flagged available must NOT be viewable.
  const v = credentialView({
    id: 'o-1', status: 'approved', credential_number: 'BM-ABCD1234',
    issued_at: '2026-03-01T00:00:00.000Z', credential_available: false,
  });
  assert.equal(v.canView, false);
  assert.equal(v.href, null);
});

test('fails closed on malformed or missing input', () => {
  for (const input of [null, undefined, {}, { credential_available: 'true' }]) {
    const v = credentialView(input);
    assert.equal(v.canView, false, `must not offer an action for ${JSON.stringify(input)}`);
    assert.equal(v.href, null);
  }
});
