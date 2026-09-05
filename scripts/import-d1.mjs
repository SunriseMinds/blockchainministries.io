#!/usr/bin/env node
/**
 * Transform exported Supabase JSON into D1 rows and import them.
 *
 *   node scripts/import-d1.mjs [--apply] [--resume] [--tables=a,b] [--target=preview|production]
 *
 * Behaviour:
 *  - DRY-RUN by default: transforms everything, reports counts and duplicates,
 *    writes nothing.
 *  - --resume skips rows already recorded as ok in the journal.
 *  - Duplicate detection: every row is keyed by `${table}:${id}`; INSERT OR
 *    IGNORE plus the journal means re-running can never double-insert.
 *  - Rollback logging: the journal lists exactly which ids were written to
 *    which table, so `rollback-d1.mjs` can undo precisely this import.
 *
 * Requires wrangler auth (CLOUDFLARE_API_TOKEN) for --apply.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  parseArgs, banner, Journal, writeReport, toIso, serialize,
  buildInsert, TABLE_ORDER, STATE_DIR,
} from './lib/migrate-common.mjs';

const DB_NAME = 'blockchain-ministries-db';
const args = parseArgs();
const stateDir = args.stateDir || STATE_DIR;
const target = (process.argv.find((a) => a.startsWith('--target=')) || '--target=preview').split('=')[1];
banner(`Supabase -> D1 import (target: ${target})`, args);

const exportDir = path.join(stateDir, 'export');
if (!fs.existsSync(exportDir)) {
  console.error(`No export found at ${exportDir}. Run scripts/export-supabase.mjs --apply first.`);
  process.exit(1);
}
const read = (t) => {
  const f = path.join(exportDir, `${t}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
};

/* ----------------------------------------------------------- transforms -- */
/**
 * Each transform maps one Supabase row to one D1 row.
 * uuids are preserved verbatim, which keeps every foreign key valid without
 * an id remapping table.
 */
const TRANSFORMS = {
  // auth.users + profiles -> users. Password hashes are NOT portable, so every
  // migrated user gets an unusable sentinel and must reset (docs/AUTH_CUTOVER_PLAN.md).
  users: () =>
    read('profiles').map((p) => ({
      id: p.id,
      email: (p.email || `${p.id}@migrated.invalid`).toLowerCase(),
      password_hash: `!migrated:${p.id}`,
      email_verified: 0,
      status: 'active',
      failed_login_count: 0,
      created_at: toIso(p.created_at) || new Date().toISOString(),
      updated_at: toIso(p.created_at) || new Date().toISOString(),
    })),

  profiles: () =>
    read('profiles').map((p) => ({
      id: p.id,
      role: p.role === 'admin' ? 'admin' : 'member',
      display_name: p.display_name ?? null,
      wallet_xrpl: p.wallet_xrpl ?? null,
      stripe_customer_id: p.stripe_customer_id ?? null,
      created_at: toIso(p.created_at) || new Date().toISOString(),
      updated_at: toIso(p.created_at) || new Date().toISOString(),
    })),

  memberships: () =>
    read('memberships').map((m) => ({
      id: m.id,
      user_id: m.user_id,
      status: m.status || 'pending',
      membership_type: m.membership_type ?? null,
      nft_token_id: m.nft_token_id ?? null,
      tx_hash: m.tx_hash ?? null,          // Supabase column is tx_hash
      approved_by: m.approved_by ?? null,
      approved_at: toIso(m.updated_at),
      created_at: toIso(m.created_at) || new Date().toISOString(),
      updated_at: toIso(m.updated_at) || new Date().toISOString(),
    })),

  // Supabase overloaded `memberships`; split out an application row per record.
  membership_applications: () =>
    read('memberships').map((m) => ({
      id: `app-${m.id}`,
      user_id: m.user_id,
      application_json: JSON.stringify({ migrated_from: 'memberships', membership_type: m.membership_type ?? null }),
      status: m.status || 'pending',
      reviewed_by: m.approved_by ?? null,
      reviewed_at: toIso(m.updated_at),
      created_at: toIso(m.created_at) || new Date().toISOString(),
      updated_at: toIso(m.updated_at) || new Date().toISOString(),
    })),

  ordinations: () =>
    read('ordinations').map((o) => ({
      id: o.id,
      user_id: o.user_id,
      status: o.status || 'pending',
      verify_slug: o.verify_slug ?? null,       // PUBLIC URL — preserved verbatim
      credential_r2_key: o.credential_pdf_path ?? null,
      nft_token_id: null,
      tx_hash: null,
      approved_by: o.approved_by ?? null,
      approved_at: toIso(o.updated_at),
      created_at: toIso(o.created_at) || new Date().toISOString(),
      updated_at: toIso(o.updated_at) || new Date().toISOString(),
    })),

  ordination_applications: () =>
    read('ordinations').map((o) => ({
      id: `app-${o.id}`,
      user_id: o.user_id,
      ordination_id: o.id,
      application_json: typeof o.application_json === 'string'
        ? o.application_json
        : JSON.stringify(o.application_json ?? {}),
      status: o.status || 'pending',
      reviewed_by: o.approved_by ?? null,
      reviewed_at: toIso(o.updated_at),
      created_at: toIso(o.created_at) || new Date().toISOString(),
      updated_at: toIso(o.updated_at) || new Date().toISOString(),
    })),

  scrolls: () =>
    read('scrolls').map((s) => ({
      id: s.id,
      title: s.title,
      slug: null,
      verify_slug: s.verify_slug ?? null,
      r2_key: s.pdf_path || `scrolls/${s.id}.pdf`,
      // Supabase had no visibility column. Default 'public' preserves current
      // behaviour; the owner must reclassify member-only scrolls (risk R-19).
      visibility: 'public',
      chain_tx_hash: s.chain_tx_hash ?? null,
      published_at: toIso(s.published_at),
      created_at: toIso(s.published_at) || new Date().toISOString(),
      updated_at: toIso(s.published_at) || new Date().toISOString(),
    })),

  scroll_requests: () =>
    read('scroll_requests').map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      request_type: s.request_type,
      message: s.message ?? null,
      status: ['pending', 'fulfilled', 'rejected'].includes(s.status) ? s.status : 'pending',
      ip: null,
      created_at: toIso(s.created_at) || new Date().toISOString(),
    })),

  contact_inquiries: () =>
    read('contact_inquiries').map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email ?? null,
      message: c.message ?? null,
      inquiry_type: c.inquiry_type ?? null,
      status: 'new',
      ip: null,
      created_at: toIso(c.created_at) || new Date().toISOString(),
    })),

  donations: () =>
    read('donations').map((d) => ({
      id: d.id,
      user_id: d.user_id ?? null,
      provider: ['stripe', 'coinbase', 'paypal'].includes(d.provider) ? d.provider : null,
      provider_id: d.provider_id ?? null,
      amount_cents: d.amount_cents ?? 0,
      currency: d.currency || 'usd',
      status: d.status || 'unknown',
      receipt_url: d.receipt_url ?? null,
      created_at: toIso(d.created_at) || new Date().toISOString(),
    })),

  consultations: () => [],  // no Supabase source table
  ministers: () => [],      // migrated from Firebase in a later phase
  audit_logs: () => [],     // no Supabase source table
};

/* --------------------------------------------------------------- import -- */
function d1Execute(sql, params) {
  const cmdArgs = [
    './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', DB_NAME,
    target === 'production' ? '--remote' : '--preview',
    '--command', sql, '--json',
  ];
  for (const p of params) cmdArgs.push('--param', String(p ?? ''));
  return execFileSync('node', cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const journal = new Journal(`import-${target}`, stateDir);
const tables = args.tables || TABLE_ORDER;
const report = { at: new Date().toISOString(), target, mode: args.apply ? 'apply' : 'dry-run', tables: {} };

for (const table of tables) {
  const transform = TRANSFORMS[table];
  if (!transform) { console.log(`  ${table.padEnd(26)} (no transform, skipped)`); continue; }

  let rows;
  try { rows = transform(); } catch (e) {
    console.log(`  ${table.padEnd(26)} TRANSFORM ERROR: ${e.message}`);
    report.tables[table] = { error: e.message };
    continue;
  }

  const seen = new Set();
  let duplicates = 0;
  let skipped = 0;
  let written = 0;
  let failed = 0;

  for (const row of rows) {
    const key = `${table}:${row.id}`;
    if (seen.has(key)) { duplicates++; continue; }   // duplicate within the export
    seen.add(key);
    if (args.resume && journal.has(key)) { skipped++; continue; }

    if (!args.apply) continue;
    const { sql, params } = buildInsert(table, row);   // INSERT OR IGNORE
    try {
      d1Execute(sql, params);
      journal.record(key, 'ok', { table, id: row.id });
      written++;
    } catch (e) {
      journal.record(key, 'error', { table, id: row.id, error: String(e.message).slice(0, 300) });
      failed++;
    }
  }

  report.tables[table] = { source_rows: rows.length, duplicates, skipped_resume: skipped, written, failed };
  console.log(
    `  ${table.padEnd(26)} rows=${String(rows.length).padStart(6)}` +
    ` dup=${duplicates} resumed=${skipped} written=${written} failed=${failed}`,
  );
}

const file = writeReport(`import-${target}`, report, stateDir);
console.log(`\nReport: ${file}`);
console.log(`Journal: ${path.join(stateDir, `import-${target}.jsonl`)} (${journal.completed} rows recorded ok)`);
if (!args.apply) console.log('Dry-run only. Re-run with --apply to write to D1.');
