/**
 * Regression coverage for the M9.4 legacy-data migration transforms.
 *
 * All fixtures below are synthetic test data, not real Supabase rows — this
 * repo/environment has no Supabase credentials, so the transform LOGIC is
 * what's verified here; the actual migration still requires someone with
 * Supabase access to run scripts/migrate-legacy-data.mjs --export first.
 *
 * Run: node --test scripts/lib/legacy-migration-transforms.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformUser, transformContactInquiry, toIso } from './legacy-migration-transforms.mjs';

test('transformUser: verified user with a full profile', () => {
  const authUser = {
    id: 'fixture-user-1',
    email: 'Fixture.User1@Example.COM',
    created_at: '2026-01-15T10:00:00.000Z',
    email_confirmed_at: '2026-01-15T10:05:00.000Z',
  };
  const profile = { display_name: 'Fixture Minister', wallet_xrpl: 'rFixtureAddress', stripe_customer_id: 'cus_fixture', role: 'member' };
  const row = transformUser(authUser, profile);

  assert.equal(row.id, 'fixture-user-1');
  assert.equal(row.email, 'fixture.user1@example.com'); // lowercased
  assert.equal(row.password_hash, '!migrated:fixture-user-1');
  assert.equal(row.email_verified, 1);
  assert.equal(row.role, 'member');
  assert.equal(row.display_name, 'Fixture Minister');
  assert.equal(row.wallet_xrpl, 'rFixtureAddress');
  assert.equal(row.stripe_customer_id, 'cus_fixture');
  assert.equal(row.status, 'active');
  assert.equal(row.failed_login_count, 0);
  assert.equal(row.locked_until, null);
  assert.equal(row.created_at, '2026-01-15T10:00:00.000Z');
  assert.equal(row.updated_at, '2026-01-15T10:00:00.000Z');
});

test('transformUser: no matching profile -> valid NULL fields, never fabricated', () => {
  const authUser = {
    id: 'fixture-user-2',
    email: 'fixture.user2@example.com',
    created_at: '2026-02-01T00:00:00.000Z',
    email_confirmed_at: null,
  };
  const row = transformUser(authUser, null);

  assert.equal(row.role, 'member');
  assert.equal(row.display_name, null);
  assert.equal(row.wallet_xrpl, null);
  assert.equal(row.stripe_customer_id, null);
  assert.equal(row.email_verified, 0); // never confirmed in Supabase
});

test('transformUser: admin role is preserved from the profile', () => {
  const row = transformUser(
    { id: 'fixture-admin', email: 'admin@example.com', created_at: '2026-01-01T00:00:00.000Z' },
    { role: 'admin' },
  );
  assert.equal(row.role, 'admin');
});

test('transformUser: unparseable created_at falls back to "now", not a fabricated past date', () => {
  const before = Date.now();
  const row = transformUser({ id: 'fixture-3', email: 'x@example.com', created_at: 'not-a-date' }, null);
  const parsed = new Date(row.created_at).getTime();
  assert.ok(parsed >= before, 'created_at should fall back to the current time, not an invented one');
});

test('transformUser: two calls with the same input produce byte-identical output (idempotency)', () => {
  const authUser = { id: 'fixture-4', email: 'idempotent@example.com', created_at: '2026-03-01T00:00:00.000Z', email_confirmed_at: '2026-03-01T00:00:00.000Z' };
  const a = transformUser(authUser, { display_name: 'Same Every Time' });
  const b = transformUser(authUser, { display_name: 'Same Every Time' });
  assert.deepEqual(a, b);
});

test('transformContactInquiry: preserves source content and timestamp verbatim', () => {
  const row = transformContactInquiry({
    id: 'fixture-inquiry-1',
    name: 'Fixture Sender',
    email: 'sender@example.com',
    message: 'Fixture message body',
    inquiry_type: 'general',
    created_at: '2026-01-10T12:00:00.000Z',
  });
  assert.deepEqual(row, {
    id: 'fixture-inquiry-1',
    name: 'Fixture Sender',
    email: 'sender@example.com',
    message: 'Fixture message body',
    inquiry_type: 'general',
    status: 'new',
    ip: null,
    created_at: '2026-01-10T12:00:00.000Z',
  });
});

test('transformContactInquiry: missing optional fields map to NULL, not synthetic values', () => {
  const row = transformContactInquiry({ id: 'fixture-inquiry-2', name: 'No Extras', created_at: '2026-01-11T00:00:00.000Z' });
  assert.equal(row.email, null);
  assert.equal(row.message, null);
  assert.equal(row.inquiry_type, null);
  assert.equal(row.ip, null);
});

test('toIso: passes through a valid ISO string', () => {
  assert.equal(toIso('2026-01-01T00:00:00.000Z'), '2026-01-01T00:00:00.000Z');
});

test('toIso: null/undefined/unparseable all return null', () => {
  assert.equal(toIso(null), null);
  assert.equal(toIso(undefined), null);
  assert.equal(toIso('garbage'), null);
});
