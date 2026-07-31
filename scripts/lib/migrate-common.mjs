/**
 * Shared helpers for the Supabase -> Cloudflare migration tooling.
 *
 * Safety model:
 *  - Supabase is read-only. Nothing here ever issues a write to Postgres.
 *  - Every run is dry-run by default; writing requires an explicit --apply.
 *  - Every run writes a JSONL journal so imports are resumable and auditable,
 *    and so a rollback can be reconstructed from what was actually written.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const STATE_DIR = process.env.MIGRATION_STATE_DIR || '.migration';

/* ------------------------------------------------------------------ args -- */
export function parseArgs(argv = process.argv.slice(2)) {
  const args = { apply: false, resume: false, tables: null, limit: null, verbose: false };
  for (const a of argv) {
    if (a === '--apply') args.apply = true;
    else if (a === '--resume') args.resume = true;
    else if (a === '--verbose' || a === '-v') args.verbose = true;
    else if (a.startsWith('--tables=')) args.tables = a.slice(9).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--limit=')) args.limit = Number(a.slice(8));
    else if (a.startsWith('--state=')) args.stateDir = a.slice(8);
  }
  return args;
}

export function banner(title, args) {
  const mode = args.apply ? 'APPLY (writes)' : 'DRY-RUN (no writes)';
  console.log(`\n=== ${title} ===`);
  console.log(`mode: ${mode}${args.resume ? ' | resuming' : ''}`);
  if (!args.apply) console.log('No changes will be made. Re-run with --apply to write.\n');
  else console.log('');
}

/* --------------------------------------------------------------- journal -- */
/**
 * Append-only JSONL journal. Each line records one unit of work so a rerun can
 * skip what already succeeded (resumability) and so rollback has a precise
 * list of what was written.
 */
export class Journal {
  constructor(name, dir = STATE_DIR) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, `${name}.jsonl`);
    this.done = new Set();
    if (fs.existsSync(this.file)) {
      for (const line of fs.readFileSync(this.file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const rec = JSON.parse(line);
          if (rec.status === 'ok' && rec.key) this.done.add(rec.key);
        } catch { /* ignore malformed trailing line */ }
      }
    }
  }

  has(key) {
    return this.done.has(key);
  }

  record(key, status, extra = {}) {
    const rec = { ts: new Date().toISOString(), key, status, ...extra };
    fs.appendFileSync(this.file, `${JSON.stringify(rec)}\n`);
    if (status === 'ok') this.done.add(key);
    return rec;
  }

  get completed() {
    return this.done.size;
  }
}

/* ------------------------------------------------------------- integrity -- */
export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Stable hash of a row, used for duplicate detection across reruns. */
export function rowFingerprint(row) {
  const ordered = Object.keys(row).sort().map((k) => `${k}=${serialize(row[k])}`).join('');
  return sha256(Buffer.from(ordered, 'utf8'));
}

/* ------------------------------------------------------------- transform -- */
/** Postgres value -> D1/SQLite value. */
export function serialize(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') return JSON.stringify(value);
  return value;
}

/** Postgres timestamptz text -> ISO-8601 UTC text. */
export function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Build a parameterized INSERT. Values are never interpolated into SQL. */
export function buildInsert(table, row, { ignoreDuplicates = true } = {}) {
  const cols = Object.keys(row);
  const sql =
    `INSERT ${ignoreDuplicates ? 'OR IGNORE ' : ''}INTO ${table} (${cols.join(', ')}) ` +
    `VALUES (${cols.map(() => '?').join(', ')})`;
  return { sql, params: cols.map((c) => serialize(row[c])) };
}

/* ------------------------------------------------------------------- io -- */
export function writeReport(name, data, dir = STATE_DIR) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

export function requireEnv(names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.error(`\nMissing required environment variables: ${missing.join(', ')}`);
    console.error('Set them in your shell (never commit them):');
    for (const n of missing) console.error(`  export ${n}=...`);
    process.exit(1);
  }
  return Object.fromEntries(names.map((n) => [n, process.env[n]]));
}

/** Dependency-safe import order (parents before children). */
export const TABLE_ORDER = [
  'users',
  'profiles',
  'memberships',
  'membership_applications',
  'ordinations',
  'ordination_applications',
  'scrolls',
  'scroll_requests',
  'contact_inquiries',
  'donations',
  'consultations',
  'ministers',
  'audit_logs',
];
