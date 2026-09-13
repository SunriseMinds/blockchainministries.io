/**
 * M10.1 — regression coverage for the AdminDashboard Cloudflare-mode field
 * mapping (D1's own column names -> what the existing render code expects).
 *
 * Run: node --test src/pages/admin/adminOverview.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOUDFLARE_ADMIN_PATH, mapAdminRow } from './adminOverview.js';

test('CLOUDFLARE_ADMIN_PATH: memberships/ordinations request every status, not the pending queue', () => {
  assert.equal(CLOUDFLARE_ADMIN_PATH.memberships, '/admin/memberships?status=all');
  assert.equal(CLOUDFLARE_ADMIN_PATH.ordinations, '/admin/ordinations?status=all');
});

test('CLOUDFLARE_ADMIN_PATH: profiles/donations/scrolls reuse the existing unfiltered endpoints', () => {
  assert.equal(CLOUDFLARE_ADMIN_PATH.profiles, '/admin/profiles');
  assert.equal(CLOUDFLARE_ADMIN_PATH.donations, '/admin/donations');
  assert.equal(CLOUDFLARE_ADMIN_PATH.scrolls, '/admin/scrolls');
});

test('mapAdminRow: memberships row gets a `status` alias of application_status', () => {
  const row = { id: 'm1', application_status: 'pending', membership_type: 'free' };
  const mapped = mapAdminRow('memberships', row);
  assert.equal(mapped.status, 'pending');
  assert.equal(mapped.application_status, 'pending'); // original field preserved too
});

test('mapAdminRow: scrolls row gets a `pdf_path` alias of r2_key', () => {
  const row = { id: 's1', title: 'Fixture Scroll', r2_key: 'scrolls/s1.pdf' };
  const mapped = mapAdminRow('scrolls', row);
  assert.equal(mapped.pdf_path, 'scrolls/s1.pdf');
});

test('M14.3: mapAdminRow projects donations through the privacy boundary', () => {
  // Donations no longer pass through raw. They are provider-neutral and go
  // through the M13 allow-list, which is what removes user_id and the
  // internal provider transaction id before anything reaches a screen.
  const donationRow = {
    id: 'd1', user_id: 'u-private', provider: 'stripe',
    provider_event_id: 'evt_secret', provider_txn_id: 'pi_secret',
    amount_cents: 500, amount_drops: null, currency: 'usd', status: 'succeeded',
    reference_url: 'https://stripe/r/1', created_at: '2026-03-01T00:00:00.000Z',
  };
  const projected = mapAdminRow('donations', donationRow);
  assert.equal(projected.amount, '5.00 USD');
  assert.equal(projected.provider, 'Card');
  assert.equal(projected.donor, 'Member');
  for (const forbidden of ['user_id', 'provider_event_id', 'provider_txn_id']) {
    assert.ok(!(forbidden in projected), `donations row still carries ${forbidden}`);
  }
  assert.ok(!JSON.stringify(projected).includes('u-private'));
});

test('mapAdminRow: ordinations/profiles rows pass through unchanged (already correctly named)', () => {
  const ordinationRow = { id: 'o1', status: 'pending' };
  assert.deepEqual(mapAdminRow('ordinations', ordinationRow), ordinationRow);

  const profileRow = { id: 'u1', role: 'member', display_name: 'Fixture User' };
  assert.deepEqual(mapAdminRow('profiles', profileRow), profileRow);

});
