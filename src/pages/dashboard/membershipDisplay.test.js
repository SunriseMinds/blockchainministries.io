/**
 * Regression coverage for the M9.1 /dashboard/membership detail page's
 * field redaction: internal ids and admin-only fields must never reach the
 * displayed membership object, from either the Cloudflare or Supabase path.
 *
 * Run: node --test src/pages/dashboard/membershipDisplay.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toDisplayMembership } from './membershipDisplay.js';

test('no membership row → null', () => {
  assert.equal(toDisplayMembership(null), null);
});

test('Worker /api/membership/mine shape (application_status) maps to status', () => {
  const result = toDisplayMembership({
    id: 'membership-row-id',
    membership_type: 'free',
    application_status: 'pending',
    payment_status: null,
    nft_token_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  });
  assert.deepEqual(result, {
    status: 'pending',
    membershipType: 'free',
    paymentStatus: null,
    nftTokenId: null,
  });
});

test('raw Supabase row (select *) is redacted down to safe fields only', () => {
  const result = toDisplayMembership({
    id: 'membership-row-id',
    user_id: 'user-row-id',
    approved_by: 'admin-row-id',
    application_json: '{"displayName":"Test"}',
    membership_type: 'paid',
    application_status: 'approved',
    payment_status: 'active',
    nft_token_id: '000800001234ABCD',
  });
  assert.deepEqual(result, {
    status: 'approved',
    membershipType: 'paid',
    paymentStatus: 'active',
    nftTokenId: '000800001234ABCD',
  });
  assert.equal('id' in result, false);
  assert.equal('user_id' in result, false);
  assert.equal('approved_by' in result, false);
  assert.equal('application_json' in result, false);
});

test('rejected application_status passes through', () => {
  assert.equal(toDisplayMembership({ application_status: 'rejected' }).status, 'rejected');
});
