/**
 * M10.4 — static guard against a Supabase import creeping back in.
 * Supabase was fully retired: the SDK dependency and its client module are
 * gone. This walks the app's own source (not node_modules, not the
 * historical docs/ narrative) and fails if either ever reappears.
 *
 * Run: node --test scripts/no-supabase.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SCAN_DIRS = ['src', 'worker', 'packages'];
const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);
const SKIP_DIR_NAMES = new Set(['node_modules', 'dist', '.git']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(path.join(ROOT, d)));

test(`scanned at least one file per source dir (${SCAN_DIRS.join(', ')})`, () => {
  assert.ok(files.length > 100, `expected many source files, found ${files.length}`);
});

test('zero imports of @supabase/supabase-js', () => {
  const offenders = files.filter((f) => /@supabase\/supabase-js/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(offenders.map((f) => path.relative(ROOT, f)), []);
});

test('zero imports/references of customSupabaseClient', () => {
  const offenders = files.filter((f) => /customSupabaseClient/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(offenders.map((f) => path.relative(ROOT, f)), []);
});

test('src/lib/customSupabaseClient.js does not exist', () => {
  assert.equal(fs.existsSync(path.join(ROOT, 'src/lib/customSupabaseClient.js')), false);
});

test('@supabase/supabase-js is not a declared dependency', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal('@supabase/supabase-js' in (pkg.dependencies || {}), false);
  assert.equal('@supabase/supabase-js' in (pkg.devDependencies || {}), false);
});
