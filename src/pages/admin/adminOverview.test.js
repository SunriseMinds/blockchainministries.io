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

test('mapAdminRow: ordinations/profiles/donations rows pass through unchanged (already correctly named)', () => {
  const ordinationRow = { id: 'o1', status: 'pending' };
  assert.deepEqual(mapAdminRow('ordinations', ordinationRow), ordinationRow);

  const profileRow = { id: 'u1', role: 'member', display_name: 'Fixture User' };
  assert.deepEqual(mapAdminRow('profiles', profileRow), profileRow);

  const donationRow = { id: 'd1', amount_cents: 500 };
  assert.deepEqual(mapAdminRow('donations', donationRow), donationRow);
});
