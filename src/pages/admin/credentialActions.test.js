/**
 * M11 Phase 7 — admin credential lifecycle control logic.
 * Run: node --test src/pages/admin/credentialActions.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credentialAction, validateReason, confirmCopy, REASON_MAX } from './credentialActions.js';

const VALID = {
  id: 'o-1', status: 'approved', credential_number: 'BM-7K2QX9AZ',
  credential_version: 1, issued_at: '2026-03-01T10:00:00.000Z', revoked_at: null,
};
const REVOKED = { ...VALID, credential_version: 1, revoked_at: '2026-04-15T09:00:00.000Z' };

test('a valid credential offers Revoke, and revoking requires a reason', () => {
  const a = credentialAction(VALID);
  assert.equal(a.action, 'revoke');
  assert.equal(a.state, 'valid');
  assert.equal(a.label, 'Valid');
  assert.equal(a.requiresReason, true);
  assert.equal(a.credentialNumber, 'BM-7K2QX9AZ');
});

test('a revoked credential offers Reissue, with no reason required', () => {
  const a = credentialAction(REVOKED);
  assert.equal(a.action, 'reissue');
  assert.equal(a.state, 'revoked');
  assert.equal(a.label, 'Revoked');
  assert.equal(a.requiresReason, false);
});

test('an approved-but-never-issued ordination offers NO lifecycle action', () => {
  const a = credentialAction({ id: 'o-1', status: 'approved', issued_at: null });
  assert.equal(a.action, null);
  assert.equal(a.state, 'not_issued');
  assert.equal(a.label, 'No credential issued');
});

test('exactly one action is ever offered', () => {
  for (const row of [VALID, REVOKED, { issued_at: null }, {}, null]) {
    const a = credentialAction(row);
    assert.ok(a.action === 'revoke' || a.action === 'reissue' || a.action === null);
  }
});

test('a blank, whitespace, missing or oversized reason is rejected before any request', () => {
  for (const bad of ['', '   ', '\n\t ', undefined, null, 42, {}]) {
    const r = validateReason(bad);
    assert.equal(r.ok, false, `should reject ${JSON.stringify(bad)}`);
    assert.ok(r.error);
  }
  assert.equal(validateReason('x'.repeat(REASON_MAX + 1)).ok, false);
  assert.equal(validateReason('x'.repeat(REASON_MAX)).ok, true);
});

test('an accepted reason is trimmed', () => {
  const r = validateReason('  conduct review  ');
  assert.equal(r.ok, true);
  assert.equal(r.value, 'conduct review');
  assert.equal(r.error, null);
});

test('the client bound matches the server bound', () => {
  assert.equal(REASON_MAX, 1000);
});

test('revoke confirmation names the credential and states the reason stays private', () => {
  const c = confirmCopy('revoke', 'BM-7K2QX9AZ');
  assert.match(c.title, /revoke/i);
  assert.ok(c.body.includes('BM-7K2QX9AZ'), 'must name the credential, not "this item"');
  assert.match(c.body, /never shared|never shown/i, 'must state the reason stays internal');
  assert.match(c.body, /REVOKED/, 'must warn about public verification');
  assert.equal(c.confirmLabel, 'Revoke Credential');
});

test('reissue confirmation promises the permanent identifiers are unchanged', () => {
  const c = confirmCopy('reissue', 'BM-7K2QX9AZ');
  assert.match(c.title, /reissue/i);
  assert.ok(c.body.includes('BM-7K2QX9AZ'));
  assert.match(c.body, /unchanged/i);
  assert.match(c.body, /Date of Ordination/i);
  assert.equal(c.confirmLabel, 'Reissue Credential');
});

test('confirmation copy never contains a revocation reason placeholder', () => {
  for (const action of ['revoke', 'reissue']) {
    const c = confirmCopy(action, 'BM-7K2QX9AZ');
    assert.ok(!/\{reason\}|%s/.test(c.body));
  }
});
