#!/usr/bin/env node
/**
 * M9.4 one-time legacy-data migration: Supabase auth.users (+ profiles) and
 * contact_inquiries -> D1 users / contact_inquiries. Everything else in
 * Supabase is confirmed empty (M9.2/M9.4 audits) and is out of scope here.
 *
 * Two modes:
 *
 *   Export (read-only against Supabase, writes local JSON only):
 *     SUPABASE_URL=https://<ref>.supabase.co \
 *     SUPABASE_SERVICE_ROLE=... \
 *     node scripts/migrate-legacy-data.mjs --export
 *
 *   Import (reads the exported JSON, writes D1 only with --apply):
 *     node scripts/migrate-legacy-data.mjs --target=preview     # dry-run
 *     node scripts/migrate-legacy-data.mjs --target=preview --apply
 *     node scripts/migrate-legacy-data.mjs --target=production --apply
 *
 * Safety:
 *  - Supabase is never written to, in either mode.
 *  - Import is dry-run by default; --apply is required to write anything.
 *  - Every row is keyed by its verbatim source id (INSERT OR IGNORE + a
 *    journal), so re-running this script can never double-insert or
 *    overwrite an existing row — safe to re-run at any time.
 *  - One audit_logs row is written per migrated entity
 *    (ACTIONS.LEGACY_DATA_MIGRATED), in the same --apply pass.
 *  - Never creates a session, never sends a password-reset email, never
 *    calls Stripe. Migrated users cannot log in until they complete a
 *    password reset themselves (password_hash is an unusable sentinel).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseArgs, banner, Journal, writeReport, buildInsert, requireEnv, STATE_DIR } from './lib/migrate-common.mjs';
import { transformUser, transformContactInquiry } from './lib/legacy-migration-transforms.mjs';

const DB_NAME = 'blockchain-ministries-db';
const EXPORT_DIR = path.join(STATE_DIR, 'export');

const rawArgs = process.argv.slice(2);
const args = parseArgs(rawArgs);
const isExport = rawArgs.includes('--export');
const target = (rawArgs.find((a) => a.startsWith('--target=')) || '--target=preview').split('=')[1];

/* ------------------------------------------------------------- export -- */
async function runExport() {
  const env = requireEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE']);
  banner('Legacy data export (read-only from Supabase)', args);
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}`,
    Accept: 'application/json',
  };

  // auth.users is not exposed through PostgREST — the Admin API is the only
  // way to read it, and it is a read (GET), never a write.
  const authUsers = [];
  for (let page = 1; ; page++) {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=100`, { headers });
    if (!res.ok) throw new Error(`auth.users page ${page}: HTTP ${res.status} ${await res.text()}`);
    const data = await res.json();
    const batch = data.users ?? [];
    authUsers.push(...batch);
    if (batch.length < 100) break;
  }

  const profiles = await fetchAllPostgrest(env, headers, 'profiles');
  const contactInquiries = await fetchAllPostgrest(env, headers, 'contact_inquiries');

  fs.mkdirSync(EXPORT_DIR, { recursive: true });
  fs.writeFileSync(path.join(EXPORT_DIR, 'legacy-auth-users.json'), JSON.stringify(authUsers, null, 2));
  fs.writeFileSync(path.join(EXPORT_DIR, 'legacy-profiles.json'), JSON.stringify(profiles, null, 2));
  fs.writeFileSync(path.join(EXPORT_DIR, 'legacy-contact-inquiries.json'), JSON.stringify(contactInquiries, null, 2));

  console.log(`  auth.users          ${authUsers.length}`);
  console.log(`  profiles            ${profiles.length}`);
  console.log(`  contact_inquiries   ${contactInquiries.length}`);
  console.log(`\nWrote export files under ${EXPORT_DIR} (git-ignored — contains member PII, never commit).`);
}

async function fetchAllPostgrest(env, headers, table, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?select=*&limit=${pageSize}&offset=${offset}`, { headers });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

/* ------------------------------------------------------------- import -- */
function d1Execute(sql, params) {
  const cmdArgs = [
    './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', DB_NAME,
    target === 'production' ? '--remote' : '--preview',
    '--command', sql, '--json',
  ];
  for (const p of params) cmdArgs.push('--param', String(p ?? ''));
  return execFileSync('node', cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function auditRow(entityType, entityId) {
  return {
    id: crypto.randomUUID(),
    actor_user_id: null,
    actor_email: null,
    action: 'legacy_data.migrated', // ACTIONS.LEGACY_DATA_MIGRATED, see worker/config/actions.js
    entity_type: entityType,
    entity_id: entityId,
    metadata_json: JSON.stringify({ source: 'supabase', migrated_at: new Date().toISOString() }),
    ip: null,
    user_agent: null,
    created_at: new Date().toISOString(),
  };
}

function runImport() {
  banner(`Legacy data import (target: ${target})`, args);
  if (!fs.existsSync(EXPORT_DIR)) {
    console.error(`No export found at ${EXPORT_DIR}. Run with --export first (requires Supabase credentials).`);
    process.exit(1);
  }
  const read = (f) => {
    const p = path.join(EXPORT_DIR, f);
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : [];
  };
  const authUsers = read('legacy-auth-users.json');
  const profiles = read('legacy-profiles.json');
  const contactInquiries = read('legacy-contact-inquiries.json');
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const userRows = authUsers.map((u) => transformUser(u, profileById.get(u.id) ?? null));
  const contactRows = contactInquiries.map(transformContactInquiry);

  const journal = new Journal(`legacy-import-${target}`, STATE_DIR);
  const report = { at: new Date().toISOString(), target, mode: args.apply ? 'apply' : 'dry-run', tables: {} };

  for (const [table, rows] of [['users', userRows], ['contact_inquiries', contactRows]]) {
    let written = 0, skippedJournal = 0, failed = 0;
    for (const row of rows) {
      const key = `${table}:${row.id}`;
      if (journal.has(key)) { skippedJournal++; continue; }
      if (!args.apply) continue;
      const { sql, params } = buildInsert(table, row); // INSERT OR IGNORE
      try {
        d1Execute(sql, params);
        const entityType = table === 'users' ? 'user' : 'contact_inquiry';
        const audit = auditRow(entityType, row.id);
        const { sql: auditSql, params: auditParams } = buildInsert('audit_logs', audit);
        d1Execute(auditSql, auditParams);
        journal.record(key, 'ok', { table, id: row.id });
        written++;
      } catch (e) {
        journal.record(key, 'error', { table, id: row.id, error: String(e.message).slice(0, 300) });
        failed++;
      }
    }
    report.tables[table] = { source_rows: rows.length, already_migrated: skippedJournal, written, failed };
    console.log(`  ${table.padEnd(20)} rows=${String(rows.length).padStart(4)} already_migrated=${skippedJournal} written=${written} failed=${failed}`);
  }

  if (!args.apply) {
    console.log('\nDRY RUN — nothing written. Rows that WOULD be inserted:');
    console.log(JSON.stringify({ users: userRows, contact_inquiries: contactRows }, null, 2));
  }

  const file = writeReport(`legacy-import-${target}`, report, STATE_DIR);
  console.log(`\nReport: ${file}`);
  if (!args.apply) console.log('Dry-run only. Re-run with --apply to write to D1.');
}

if (isExport) await runExport();
else runImport();
