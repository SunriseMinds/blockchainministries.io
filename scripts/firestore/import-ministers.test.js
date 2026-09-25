/**
 * Tests for scripts/firestore/import-ministers.mjs — journal format
 * compatibility with rollback-d1.mjs, target resolution, and the production
 * approval guard. No network, no wrangler invocation.
 * Run: node --test scripts/firestore/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveTarget, checkProductionGuard, d1ExecuteArgs, sqlLiteral, inlineParams } from './import-ministers.mjs';
import { Journal, buildInsert } from '../lib/migrate-common.mjs';

test('resolveTarget defaults to local', () => {
  assert.equal(resolveTarget([]), 'local');
});

test('resolveTarget accepts local, preview, production', () => {
  assert.equal(resolveTarget(['--target=preview']), 'preview');
  assert.equal(resolveTarget(['--target=production']), 'production');
  assert.equal(resolveTarget(['--target=local']), 'local');
});

test('resolveTarget rejects an unknown target', () => {
  assert.throws(() => resolveTarget(['--target=staging']), /Invalid --target/);
});

test('d1ExecuteArgs maps target -> wrangler flag (wrangler 4.x defaults to LOCAL, so preview/production need --remote)', () => {
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

test('buildInsert produces an INSERT OR IGNORE with parameterized values (never interpolated)', () => {
  const { sql, params } = buildInsert('ministers', {
    id: 'm1', display_name: 'Rev. X', title: null, bio: null,
    photo_key: null, ordination_id: null, is_published: 1,
    created_at: '2024-01-01T00:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z',
  });
  assert.match(sql, /^INSERT OR IGNORE INTO ministers/);
  assert.equal(sql.match(/\?/g).length, 9);
  assert.equal(params[0], 'm1');
  assert.equal(params[6], 1);
});

test('sqlLiteral escapes single quotes and renders null/number correctly', () => {
  assert.equal(sqlLiteral(null), 'NULL');
  assert.equal(sqlLiteral(undefined), 'NULL');
  assert.equal(sqlLiteral(1), '1');
  assert.equal(sqlLiteral("Rev. O'Brien"), "'Rev. O''Brien'");
});

test('inlineParams substitutes ? placeholders in order, escaping each value', () => {
  const { sql, params } = buildInsert('ministers', { id: "m'1", is_published: 1, bio: null });
  const inlined = inlineParams(sql, params);
  assert.equal(inlined, "INSERT OR IGNORE INTO ministers (id, is_published, bio) VALUES ('m''1', 1, NULL)");
});

test('journal lines written by the importer are exactly what rollback-d1.mjs reads: {status:"ok", table, id}', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ministers-import-test-'));
  try {
    const journal = new Journal('import-local', dir);
    journal.record('ministers:m1', 'ok', { table: 'ministers', id: 'm1' });
    journal.record('ministers:m2', 'error', { table: 'ministers', id: 'm2', error: 'boom' });

    const lines = fs.readFileSync(path.join(dir, 'import-local.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(lines.length, 2);

    // Re-implement rollback-d1.mjs's own parsing rule to prove compatibility.
    const byTable = new Map();
    for (const rec of lines) {
      if (rec.status !== 'ok' || !rec.table || !rec.id) continue;
      if (!byTable.has(rec.table)) byTable.set(rec.table, new Set());
      byTable.get(rec.table).add(rec.id);
    }
    assert.deepEqual([...byTable.get('ministers')], ['m1']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Journal.has() makes --resume skip a row already recorded ok', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ministers-import-test-'));
  try {
    let journal = new Journal('import-local', dir);
    journal.record('ministers:m1', 'ok', { table: 'ministers', id: 'm1' });

    // Reload, as a fresh CLI invocation would.
    journal = new Journal('import-local', dir);
    assert.equal(journal.has('ministers:m1'), true);
    assert.equal(journal.has('ministers:m2'), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
