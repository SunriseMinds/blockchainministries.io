#!/usr/bin/env node
/**
 * Migrate uploaded files into R2, verifying SHA-256 before and after transfer.
 *
 *   node scripts/migrate-files-r2.mjs [--apply] [--resume] --source=<dir>
 *
 * Behaviour:
 *  - DRY-RUN by default: builds the manifest, hashes sources, reports, uploads
 *    nothing.
 *  - --resume skips objects already recorded as ok in the journal.
 *  - After each upload the remote object is re-hashed and compared to the
 *    source digest. A mismatch is recorded as an error and the object is NOT
 *    marked done, so a rerun retries it.
 *  - Source storage is never modified or deleted.
 *
 * Run with --source=<dir> against a local export of the files to migrate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs, banner, Journal, sha256, writeReport, STATE_DIR } from './lib/migrate-common.mjs';

const args = parseArgs();
const stateDir = args.stateDir || STATE_DIR;
const source = (process.argv.find((a) => a.startsWith('--source=')) || '--source=').split('=')[1];
banner('File migration -> R2 (hash-verified)', args);

if (!source) {
  console.error('No --source given.');
  console.error('  --source=<dir>       migrate from a local directory');
  process.exit(1);
}

/**
 * Decide bucket + key from the source-relative path, following the key
 * convention in docs/R2_FILE_MIGRATION_PLAN.md.
 */
function classify(relPath) {
  const base = path.basename(relPath);
  if (/^credentials\//.test(relPath)) return { bucket: 'bm-protected', key: `credentials/${base}` };
  if (/^scrolls-member\//.test(relPath)) return { bucket: 'bm-protected', key: `scrolls-member/${base}` };
  if (/^ministers\//.test(relPath)) return { bucket: 'bm-public', key: `ministers/${base}` };
  if (/^brand\//.test(relPath)) return { bucket: 'bm-public', key: `brand/${base}` };
  return { bucket: 'bm-public', key: `scrolls/${base}` };
}

/* ------------------------------------------------------------- manifest -- */
function walk(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.isFile()) out.push(path.relative(base, full));
  }
  return out;
}

let manifest = [];
if (!fs.existsSync(source)) {
  console.error(`Source directory not found: ${source}`);
  process.exit(1);
}
manifest = walk(source).map((rel) => {
  const abs = path.join(source, rel);
  const buf = fs.readFileSync(abs);
  return { rel, abs, size: buf.length, sha256: sha256(buf), ...classify(rel) };
});

console.log(`  discovered ${manifest.length} file(s) in ${source}\n`);

/* --------------------------------------------------------------- upload -- */
function r2Put(bucket, key, file) {
  execFileSync('node', [
    './node_modules/wrangler/bin/wrangler.js', 'r2', 'object', 'put',
    `${bucket}/${key}`, '--file', file, '--remote',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function r2GetToTemp(bucket, key) {
  const tmp = path.join(stateDir, 'verify', key.replace(/\//g, '_'));
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  execFileSync('node', [
    './node_modules/wrangler/bin/wrangler.js', 'r2', 'object', 'get',
    `${bucket}/${key}`, '--file', tmp, '--remote',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return tmp;
}

const journal = new Journal('files-r2', stateDir);
const report = { at: new Date().toISOString(), source, mode: args.apply ? 'apply' : 'dry-run', files: [] };
let uploaded = 0, verified = 0, skipped = 0, failed = 0;

for (const f of manifest) {
  const jkey = `${f.bucket}:${f.key}`;
  if (args.resume && journal.has(jkey)) {
    skipped++;
    continue;
  }

  if (!args.apply) {
    console.log(`  would upload ${f.rel} -> ${f.bucket}/${f.key}  (${f.size} bytes, sha256=${f.sha256.slice(0, 12)}…)`);
    report.files.push({ ...f, abs: undefined, action: 'would_upload' });
    continue;
  }

  try {
    r2Put(f.bucket, f.key, f.abs);
    uploaded++;
    // Re-download and re-hash: proves the bytes in R2 match the source.
    const tmp = r2GetToTemp(f.bucket, f.key);
    const after = sha256(fs.readFileSync(tmp));
    fs.unlinkSync(tmp);
    if (after !== f.sha256) {
      failed++;
      journal.record(jkey, 'error', { reason: 'hash_mismatch', before: f.sha256, after });
      console.error(`  MISMATCH ${f.key}: ${f.sha256} != ${after}`);
      report.files.push({ key: f.key, bucket: f.bucket, action: 'hash_mismatch' });
      continue;
    }
    verified++;
    journal.record(jkey, 'ok', { bucket: f.bucket, key: f.key, sha256: f.sha256, size: f.size });
    console.log(`  ok ${f.bucket}/${f.key}  verified sha256`);
    report.files.push({ key: f.key, bucket: f.bucket, sha256: f.sha256, action: 'uploaded_verified' });
  } catch (e) {
    failed++;
    journal.record(jkey, 'error', { error: String(e.message).slice(0, 300) });
    console.error(`  FAILED ${f.key}: ${e.message}`);
  }
}

report.summary = { total: manifest.length, uploaded, verified, skipped, failed };
const file = writeReport('files-r2', report, stateDir);
console.log(`\ntotal=${manifest.length} uploaded=${uploaded} verified=${verified} resumed=${skipped} failed=${failed}`);
console.log(`Report: ${file}`);
if (!args.apply) console.log('Dry-run only. Re-run with --apply to upload.');
console.log('Source storage was not modified.');
if (failed) process.exit(1);
