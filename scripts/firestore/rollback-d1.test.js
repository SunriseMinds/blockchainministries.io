/**
 * Tests for scripts/rollback-d1.mjs — target resolution, the production
 * approval guard, the wrangler arg builder (matching import-ministers.mjs),
 * and the chunked DELETE SQL. No network, no wrangler invocation.
 * Run: node --test scripts/firestore/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTarget, checkProductionGuard, d1ExecuteArgs, buildDeleteChunks,
} from '../rollback-d1.mjs';

test('resolveTarget defaults to preview', () => {
  assert.equal(resolveTarget([]), 'preview');
});

test('resolveTarget accepts local, preview, production', () => {
  assert.equal(resolveTarget(['--target=local']), 'local');
  assert.equal(resolveTarget(['--target=preview']), 'preview');
  assert.equal(resolveTarget(['--target=production']), 'production');
});

test('resolveTarget rejects an unknown target', () => {
  assert.throws(() => resolveTarget(['--target=staging']), /Invalid --target/);
});

test('d1ExecuteArgs maps target -> wrangler flag, matching import-ministers.mjs', () => {
  assert.deepEqual(d1ExecuteArgs('local'), ['--local']);
  assert.deepEqual(d1ExecuteArgs('preview'), ['--remote', '--preview']);
  assert.deepEqual(d1ExecuteArgs('production'), ['--remote']);
});

test('--remote WITHOUT --preview is only ever produced for production', () => {
  for (const target of ['local', 'preview', 'production']) {
    const args = d1ExecuteArgs(target);
    const bareRemote = args.includes('--remote') && !args.includes('--preview');
    assert.equal(bareRemote, target === 'production', `unexpected bare --remote for target=${target}`);
  }
});

test('production guard refuses without --i-have-approval', () => {
  const err = checkProductionGuard('production', []);
  assert.match(err, /requires --i-have-approval/);
});

test('production guard passes with --i-have-approval', () => {
  const err = checkProductionGuard('production', ['--i-have-approval=appr-123']);
  assert.equal(err, null);
});

test('production guard is a no-op for local and preview', () => {
  assert.equal(checkProductionGuard('local', []), null);
  assert.equal(checkProductionGuard('preview', []), null);
});

test('buildDeleteChunks builds a parameterized DELETE and inlines it (no --param, since wrangler 4.114 lacks it)', () => {
  const chunks = buildDeleteChunks('ministers', ['m1', "m'2"]);
  assert.equal(chunks.length, 1);
  const { sql, inlined, ids } = chunks[0];
  assert.equal(sql, 'DELETE FROM ministers WHERE id IN (?,?)');
  assert.deepEqual(ids, ['m1', "m'2"]);
  assert.equal(inlined, "DELETE FROM ministers WHERE id IN ('m1','m''2')");
});

test('buildDeleteChunks splits ids into chunks of 50', () => {
  const ids = Array.from({ length: 120 }, (_, i) => `m${i}`);
  const chunks = buildDeleteChunks('ministers', ids);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].ids.length, 50);
  assert.equal(chunks[1].ids.length, 50);
  assert.equal(chunks[2].ids.length, 20);
});

test('buildDeleteChunks returns nothing for an empty id list', () => {
  assert.deepEqual(buildDeleteChunks('ministers', []), []);
});
