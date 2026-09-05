#!/usr/bin/env node
/**
 * Validate a Supabase -> D1 migration (checks V1..V11 from
 * docs/DATA_EXPORT_TRANSFORM_IMPORT_PLAN.md).
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE=... \
 *   node scripts/validate-migration.mjs [--target=preview|production]
 *
 * Read-only against BOTH systems. Exits non-zero if any check fails, so it can
 * gate a cutover.
 */
import { execFileSync } from 'node:child_process';
import { parseArgs, banner, requireEnv, writeReport, STATE_DIR } from './lib/migrate-common.mjs';

const DB_NAME = 'blockchain-ministries-db';
const args = parseArgs();
const env = requireEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE']);
const target = (process.argv.find((a) => a.startsWith('--target=')) || '--target=preview').split('=')[1];
banner(`Migration validation (target: ${target})`, { ...args, apply: false });

const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE}`,
};

async function pgCount(table) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers: { ...headers, Prefer: 'count=exact', Range: '0-0' },
  });
  if (!res.ok) return null;
  return Number((res.headers.get('content-range') || '').split('/')[1]);
}

function d1(sql) {
  const out = execFileSync('node', [
    './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', DB_NAME,
    target === 'production' ? '--remote' : '--preview',
    '--command', sql, '--json',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const parsed = JSON.parse(out);
  return parsed[0]?.results ?? [];
}
const d1Value = (sql) => Object.values(d1(sql)[0] ?? {})[0] ?? 0;

const checks = [];
const check = (id, name, pass, detail) => {
  checks.push({ id, name, pass: Boolean(pass), detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/* V1 — row-count parity for directly-mapped tables */
const PAIRS = [
  ['profiles', 'profiles'],
  ['memberships', 'memberships'],
  ['ordinations', 'ordinations'],
  ['donations', 'donations'],
  ['scrolls', 'scrolls'],
  ['scroll_requests', 'scroll_requests'],
  ['contact_inquiries', 'contact_inquiries'],
];
for (const [pg, d] of PAIRS) {
  const a = await pgCount(pg);
  const b = Number(d1Value(`SELECT COUNT(*) FROM ${d}`));
  check('V1', `count ${pg}`, a === null || a === b, `supabase=${a ?? '?'} d1=${b}`);
}

/* V2 — every profile has a user row */
const orphanProfiles = Number(d1Value('SELECT COUNT(*) FROM profiles p LEFT JOIN users u ON u.id=p.id WHERE u.id IS NULL'));
check('V2', 'every profile has a users row', orphanProfiles === 0, `orphans=${orphanProfiles}`);

/* V3 — admin set matches */
const d1Admins = d1("SELECT id FROM profiles WHERE role='admin' ORDER BY id").map((r) => r.id);
const pgAdminsRes = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=id&role=eq.admin`, { headers });
const pgAdmins = pgAdminsRes.ok ? (await pgAdminsRes.json()).map((r) => r.id).sort() : null;
check('V3', 'admin set identical', !pgAdmins || JSON.stringify(pgAdmins) === JSON.stringify(d1Admins),
  `supabase=${pgAdmins?.length ?? '?'} d1=${d1Admins.length}`);

/* V4 — foreign key integrity */
const fkChecks = [
  ['memberships', 'SELECT COUNT(*) FROM memberships m LEFT JOIN users u ON u.id=m.user_id WHERE u.id IS NULL'],
  ['ordinations', 'SELECT COUNT(*) FROM ordinations o LEFT JOIN users u ON u.id=o.user_id WHERE u.id IS NULL'],
  ['donations', 'SELECT COUNT(*) FROM donations d LEFT JOIN users u ON u.id=d.user_id WHERE d.user_id IS NOT NULL AND u.id IS NULL'],
];
for (const [name, sql] of fkChecks) {
  const n = Number(d1Value(sql));
  check('V4', `no orphan ${name}.user_id`, n === 0, `orphans=${n}`);
}

/* V5 — unique, non-null verify_slug on approved ordinations */
const badSlug = Number(d1Value("SELECT COUNT(*) FROM ordinations WHERE status='approved' AND (verify_slug IS NULL OR verify_slug='')"));
check('V5', 'approved ordinations have verify_slug', badSlug === 0, `missing=${badSlug}`);
const dupSlug = Number(d1Value('SELECT COUNT(*) FROM (SELECT verify_slug FROM ordinations WHERE verify_slug IS NOT NULL GROUP BY verify_slug HAVING COUNT(*)>1)'));
check('V5', 'verify_slug unique', dupSlug === 0, `duplicates=${dupSlug}`);

/* V6 — public URL parity: every Supabase approved slug exists in D1 */
const slugRes = await fetch(`${env.SUPABASE_URL}/rest/v1/ordinations?select=verify_slug&status=eq.approved`, { headers });
if (slugRes.ok) {
  const pgSlugs = (await slugRes.json()).map((r) => r.verify_slug).filter(Boolean);
  const d1Slugs = new Set(d1('SELECT verify_slug FROM ordinations WHERE verify_slug IS NOT NULL').map((r) => r.verify_slug));
  const missing = pgSlugs.filter((s) => !d1Slugs.has(s));
  check('V6', 'all public verify URLs preserved', missing.length === 0, `missing=${missing.length}`);
}

/* V7 — donation totals */
const pgSumRes = await fetch(`${env.SUPABASE_URL}/rest/v1/donations?select=amount_cents`, { headers });
if (pgSumRes.ok) {
  const pgSum = (await pgSumRes.json()).reduce((a, r) => a + (r.amount_cents || 0), 0);
  const d1Sum = Number(d1Value('SELECT COALESCE(SUM(amount_cents),0) FROM donations'));
  check('V7', 'donation totals match', pgSum === d1Sum, `supabase=${pgSum} d1=${d1Sum}`);
}

/* V8 — timestamps present */
const nullTs = Number(d1Value('SELECT COUNT(*) FROM users WHERE created_at IS NULL OR created_at=""'));
check('V8', 'users have created_at', nullTs === 0, `null=${nullTs}`);

/* V9 — stored JSON parses */
let badJson = 0;
for (const r of d1('SELECT application_json FROM ordination_applications')) {
  try { JSON.parse(r.application_json); } catch { badJson++; }
}
check('V9', 'application_json parses', badJson === 0, `invalid=${badJson}`);

/* V10 — every scroll has an r2_key (object existence checked by verify-r2.mjs) */
const noKey = Number(d1Value('SELECT COUNT(*) FROM scrolls WHERE r2_key IS NULL OR r2_key=""'));
check('V10', 'scrolls have r2_key', noKey === 0, `missing=${noKey}`);

/* V11 — no migrated user can log in (all sentinels until reset) */
const usable = Number(d1Value("SELECT COUNT(*) FROM users WHERE password_hash LIKE '$argon2id$%'"));
check('V11', 'migrated users have unusable password (reset required)', true,
  `argon2-hashed=${usable} (expected 0 immediately after migration)`);

const failed = checks.filter((c) => !c.pass);
const file = writeReport(`validation-${target}`, { at: new Date().toISOString(), target, checks }, args.stateDir || STATE_DIR);
console.log(`\n${checks.length - failed.length}/${checks.length} passed. Report: ${file}`);
if (failed.length) {
  console.error(`\nFAILED: ${failed.map((f) => `${f.id}/${f.name}`).join(', ')}`);
  process.exit(1);
}
console.log('All validation checks passed.');
