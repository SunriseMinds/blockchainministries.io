/**
 * Regression coverage for the M9.1 dashboard "Apply for Membership" CTA:
 * it must appear only when the user has no membership record on file.
 *
 * Run: node --test src/pages/dashboard/membershipCta.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldShowApplyCta } from './membershipCta.js';

test('no membership record → show CTA', () => {
  assert.equal(shouldShowApplyCta(null), true);
});

test('pending application → hide CTA', () => {
  assert.equal(shouldShowApplyCta({ status: 'pending' }), false);
});

test('approved membership → hide CTA', () => {
  assert.equal(shouldShowApplyCta({ status: 'approved' }), false);
});

test('rejected application → hide CTA (resubmission happens on /membership/apply directly, not via a new-application CTA)', () => {
  assert.equal(shouldShowApplyCta({ status: 'rejected' }), false);
});
