#!/usr/bin/env node
/**
 * Export Supabase data for migration to D1. READ-ONLY.
 *
 * This script never writes to Supabase. It issues SELECTs through PostgREST
 * using the service-role key (required to bypass RLS for a complete export)
 * and writes JSON files to the state directory.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE=... \
 *   node scripts/export-supabase.mjs [--apply] [--tables=a,b] [--limit=N]
 *
 * Without --apply it only reports row counts (a safe way to answer risk R-01:
 * "does production data actually exist?").
 *
 * SECURITY: exported files contain member PII. They are written to
 * .migration/ which is git-ignored. Never commit them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, banner, requireEnv, writeReport, STATE_DIR } from './lib/migrate-common.mjs';

/** Supabase public-schema tables, in dependency order. */
const SOURCE_TABLES = [
  'profiles', 'memberships', 'ordinations', 'donations', 'scrolls',
  'scroll_requests', 'contact_inquiries',
  // legacy / orphan tables — exported for archive regardless of disposition
  'users', 'credentials', 'ministries', 'requests', 'subscriptions',
];

const args = parseArgs();
const env = requireEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE']);
const stateDir = args.stateDir || STATE_DIR;
banner('Supabase export (read-only)', args);

const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}`,
  Accept: 'application/json',
};

async function countRows(table) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?select=*`;
  const res = await fetch(url, { headers: { ...headers, Prefer: 'count=exact', Range: '0-0' } });
  if (!res.ok) return { ok: false, status: res.status, error: await res.text() };
  // PostgREST returns "0-0/<total>" in Content-Range.
  const range = res.headers.get('content-range') || '';
  const total = Number(range.split('/')[1]);
  return { ok: true, count: Number.isFinite(total) ? total : null };
}

async function fetchAll(table, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = `${env.SUPABASE_URL}/rest/v1/${table}?select=*&limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    if (args.limit && rows.length >= args.limit) break;
  }
  return args.limit ? rows.slice(0, args.limit) : rows;
}

const tables = args.tables || SOURCE_TABLES;
const summary = {};

for (const table of tables) {
  const c = await countRows(table);
  if (!c.ok) {
    console.log(`  ${table.padEnd(20)} ERROR ${c.status}`);
    summary[table] = { error: c.status };
    continue;
  }
  summary[table] = { count: c.count };
  console.log(`  ${table.padEnd(20)} ${String(c.count).padStart(7)} rows`);

  if (args.apply) {
    const rows = await fetchAll(table);
    fs.mkdirSync(path.join(stateDir, 'export'), { recursive: true });
    const file = path.join(stateDir, 'export', `${table}.json`);
    fs.writeFileSync(file, JSON.stringify(rows, null, 2));
    summary[table].exported = rows.length;
    console.log(`  ${''.padEnd(20)} -> ${file} (${rows.length})`);
  }
}

// auth.users is not exposed through PostgREST; use the Admin API for a count.
try {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`, { headers });
  if (res.ok) {
    const data = await res.json();
    const total = data.total ?? data.aud_total ?? (Array.isArray(data.users) ? data.users.length : null);
    summary['auth.users'] = { count: total };
    console.log(`  ${'auth.users'.padEnd(20)} ${String(total ?? '?').padStart(7)} users`);
  } else {
    summary['auth.users'] = { error: res.status };
    console.log(`  ${'auth.users'.padEnd(20)} ERROR ${res.status}`);
  }
} catch (e) {
  summary['auth.users'] = { error: e.message };
}

const report = writeReport('export-summary', { at: new Date().toISOString(), mode: args.apply ? 'apply' : 'dry-run', summary }, stateDir);
console.log(`\nSummary written to ${report}`);
if (!args.apply) console.log('Dry-run only: re-run with --apply to write export files.');
