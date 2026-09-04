/**
 * Focused tests for email-verification guard conditions.
 *
 * Tests the exact same guard logic used in routes.js POST /api/auth/verify-email
 * without spinning up a Worker or importing the full dependency chain.
 * Run with: node --test packages/auth/src/verify-email.test.js
 *
 * Scenarios: valid token, invalid (no row), expired, already-consumed,
 * and the concurrent-consume (race) case.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Guard helpers ─────────────────────────────────────────────────────────────
// These mirror routes.js verbatim. If the route logic changes, update here too.

/**
 * Returns {ok:true} or {ok:false, reason} — mirrors the first guard in the
 * POST /api/auth/verify-email handler.
 */
function checkRow(row, now = Date.now()) {
  if (!row || row.consumed_at || new Date(row.expires_at).getTime() <= now) {
    return { ok: false, reason: 'invalid_token' };
  }
  return { ok: true };
}

/**
 * Returns {ok:true} or {ok:false, reason} — mirrors the consume() check.
 * In production, repo.emailVerificationTokens.consume() returns false when
 * a concurrent request already consumed the row (atomic single-use guard).
 */
function checkConsume(consumedRowsAffected) {
  return consumedRowsAffected
    ? { ok: true }
    : { ok: false, reason: 'already_used' };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FUTURE = new Date(Date.now() + 86_400_000).toISOString(); // 24h from now
const PAST   = new Date(Date.now() -         1).toISOString(); // 1ms ago

// ── Tests ─────────────────────────────────────────────────────────────────────

test('valid token — not consumed, not expired', () => {
  const row = { id: '1', user_id: 'u1', expires_at: FUTURE, consumed_at: null };
  assert.deepEqual(checkRow(row), { ok: true });
  assert.deepEqual(checkConsume(true), { ok: true });
});

test('invalid token — no matching row in DB', () => {
  assert.deepEqual(checkRow(null), { ok: false, reason: 'invalid_token' });
});

test('expired token — expires_at is in the past', () => {
  const row = { id: '2', user_id: 'u2', expires_at: PAST, consumed_at: null };
  assert.deepEqual(checkRow(row), { ok: false, reason: 'invalid_token' });
});

test('already-consumed token — consumed_at is set', () => {
  const row = { id: '3', user_id: 'u3', expires_at: FUTURE, consumed_at: '2025-01-01T00:00:00Z' };
  assert.deepEqual(checkRow(row), { ok: false, reason: 'invalid_token' });
});

test('concurrent consume race — row looked fine but consume() returns 0 rows', () => {
  // Row passed the first guard (valid and unconsumed at read time), but a
  // concurrent request consumed it between the read and the UPDATE.
  const row = { id: '4', user_id: 'u4', expires_at: FUTURE, consumed_at: null };
  assert.deepEqual(checkRow(row), { ok: true });
  assert.deepEqual(checkConsume(false), { ok: false, reason: 'already_used' });
});
