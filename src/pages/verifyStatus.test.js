/**
 * M11 Phase 6 — Verify page lifecycle presentation.
 *
 * Run: node --test src/pages/verifyStatus.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ordinationPresentation, ordinationFields } from './verifyStatus.js';

const VALID_DATA = {
  verified: true,
  credential_status: 'valid',
  full_name: 'Jordan Alexis Rivers',
  credential_number: 'BM-7K2QX9AZ',
  designation: 'Ordained Minister',
  date_of_ordination: '2026-03-01T10:00:00.000Z',
  verify_slug: 'slug-alice',
};

const REVOKED_DATA = {
  ...VALID_DATA,
  verified: false,
  credential_status: 'revoked',
  revoked_at: '2026-04-15T09:00:00.000Z',
};

test('34. a valid credential displays an explicit "Verified" status', () => {
  const v = ordinationPresentation(VALID_DATA);
  assert.equal(v.isValid, true);
  assert.equal(v.status, 'valid');
  assert.equal(v.label, 'Verified');
  assert.match(v.statement, /is valid/);
  assert.equal(v.showRevokedAt, false);
});

test('35. a revoked credential displays an explicit "REVOKED" status', () => {
  const v = ordinationPresentation(REVOKED_DATA);
  assert.equal(v.isValid, false);
  assert.equal(v.status, 'revoked');
  assert.equal(v.label, 'REVOKED');
  assert.equal(
    v.statement,
    'This Blockchain Ministries ordination credential has been revoked.',
  );
  assert.equal(v.showRevokedAt, true);
});

test('36. revoked never inherits the valid presentation semantics', () => {
  const valid = ordinationPresentation(VALID_DATA);
  const revoked = ordinationPresentation(REVOKED_DATA);

  assert.notEqual(revoked.tone, valid.tone);
  assert.notEqual(revoked.icon, valid.icon);
  assert.notEqual(revoked.label, valid.label);
  assert.equal(revoked.tone, 'negative');
  assert.equal(valid.tone, 'positive');
});

test('36b. anything not explicitly valid fails closed to REVOKED', () => {
  const notValid = [
    {},
    null,
    undefined,
    { credential_status: 'valid' },                       // verified missing
    { verified: true },                                   // status missing
    { verified: true, credential_status: 'REVOKED' },     // mismatched
    { verified: false, credential_status: 'valid' },      // contradictory
    { verified: 'true', credential_status: 'valid' },     // wrong type
    { verified: true, credential_status: 'unknown' },     // unrecognised
  ];
  for (const data of notValid) {
    const v = ordinationPresentation(data);
    assert.equal(v.isValid, false, `must not be valid: ${JSON.stringify(data)}`);
    assert.equal(v.label, 'REVOKED');
  }
});

test('37. a revocation reason can never be displayed', () => {
  // Even if the API were ever to return one, the field allow-list has no row
  // for it, so the page structurally cannot render it.
  const hostile = { ...REVOKED_DATA, revocation_reason: 'PRIVATE REASON', revoked_by: 'u-admin' };
  const view = ordinationPresentation(hostile);
  const rows = ordinationFields(hostile, view);

  const serialized = JSON.stringify(rows);
  assert.ok(!serialized.includes('PRIVATE REASON'));
  assert.ok(!serialized.includes('u-admin'));
  assert.ok(!rows.some(r => r.key === 'revocation_reason' || r.key === 'revoked_by'));
});

test('38. status is carried in text, not by colour alone', () => {
  for (const data of [VALID_DATA, REVOKED_DATA]) {
    const v = ordinationPresentation(data);
    assert.ok(v.label.trim().length > 0, 'a textual status label is required');
    assert.ok(v.statement.trim().length > 0, 'a textual statement is required');
    // tone/icon are secondary cues; removing them must not remove the meaning
    assert.match(v.statement, /credential/i);
  }
  assert.notEqual(
    ordinationPresentation(VALID_DATA).statement,
    ordinationPresentation(REVOKED_DATA).statement,
  );
});

test('displayed fields: valid shows identity, revoked adds the revocation date', () => {
  const validRows = ordinationFields(VALID_DATA, ordinationPresentation(VALID_DATA));
  assert.deepEqual(validRows.map(r => r.key), [
    'full_name', 'designation', 'credential_number', 'date_of_ordination',
  ]);
  assert.equal(validRows.find(r => r.key === 'full_name').value, 'Jordan Alexis Rivers');
  assert.equal(validRows.find(r => r.key === 'designation').value, 'Ordained Minister');

  const revokedRows = ordinationFields(REVOKED_DATA, ordinationPresentation(REVOKED_DATA));
  assert.deepEqual(revokedRows.map(r => r.key), [
    'full_name', 'designation', 'credential_number', 'date_of_ordination', 'revoked_at',
  ]);
});

test('the ordination date shown is date_of_ordination, never a reissue date', () => {
  const rows = ordinationFields(VALID_DATA, ordinationPresentation(VALID_DATA));
  const shown = rows.find(r => r.key === 'date_of_ordination').value;
  assert.equal(shown, new Date('2026-03-01T10:00:00.000Z').toLocaleDateString());
  // there is deliberately no issued_at row at all
  assert.ok(!rows.some(r => r.key === 'issued_at'));
});

test('missing or malformed values are dropped rather than rendered as junk', () => {
  const rows = ordinationFields(
    { credential_status: 'valid', verified: true, full_name: 'A', date_of_ordination: 'not-a-date' },
    ordinationPresentation(VALID_DATA),
  );
  assert.deepEqual(rows.map(r => r.key), ['full_name']);
});
