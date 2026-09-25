#!/usr/bin/env node
/**
 * Import transformed `ministers` rows (scripts/firestore/transform-ministers.mjs
 * output) into D1, through wrangler `d1 execute`, journaled the same way as
 * rollback-d1.mjs expects.
 *
 *   node scripts/firestore/import-ministers.mjs [--apply] [--resume]
 *        [--target=local|preview|production] [--input=<rows.json>]
 *        [--i-have-approval=<approval-id>]   (required with --target=production)
 *
 * DRY-RUN by default. Journal lines are `{status:"ok", table:"ministers", id}`
 * on success — exactly the shape scripts/rollback-d1.mjs reads — written to
 * `.migration/import-<target>.jsonl` so rollback-d1.mjs works unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs, banner, Journal, buildInsert, writeReport, STATE_DIR } from '../lib/migrate-common.mjs';

const DB_NAME = 'blockchain-ministries-db';
const VALID_TARGETS = new Set(['local', 'preview', 'production']);

export function resolveTarget(argv = process.argv.slice(2)) {
  const raw = (argv.find((a) => a.startsWith('--target=')) || '--target=local').split('=')[1];
  if (!VALID_TARGETS.has(raw)) {
    throw new Error(`Invalid --target=${raw}. Must be one of: ${[...VALID_TARGETS].join(', ')}`);
  }
  return raw;
}

/**
 * Production requires an explicit RCC approval id, and only production.
 * Returns null when the guard passes, else an error message.
 */
export function checkProductionGuard(target, argv = process.argv.slice(2)) {
  if (target !== 'production') return null;
  const approval = (argv.find((a) => a.startsWith('--i-have-approval=')) || '').split('=')[1];
  if (!approval) {
    return '--target=production requires --i-have-approval=<RCC approval id>. Refusing to run.';
  }
  return null;
}

/** wrangler d1 execute args for one target, matching rollback-d1.mjs's flag choice. */
export function d1ExecuteArgs(target) {
  if (target === 'local') return ['--local'];
  if (target === 'production') return ['--remote'];
  return ['--preview'];
}

/**
 * Render one `?`-placeholder value as a SQL literal.
 *
 * The wrangler version pinned in this repo's package-lock (checked: 4.114.0)
 * has NO `--param` flag on `d1 execute` (`wrangler d1 execute --help` lists
 * only --command/--file/--local/--remote/--preview/--json) even though
 * rollback-d1.mjs and migrate-files-r2.mjs already call it with `--param`
 * (that pre-existing code is out of scope here and untouched). Rows here
 * come only from our own transform step, never from end-user input, so a
 * single-quote-doubling literal is an acceptable inlining, not a new
 * injection surface — but it is why this importer does NOT reuse
 * rollback-d1.mjs's `--param` pattern.
 */
export function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Substitute `?` placeholders in order with escaped SQL literals. */
export function inlineParams(sql, params) {
  let i = 0;
  return sql.replace(/\?/g, () => sqlLiteral(params[i++]));
}

function d1Insert(target, sql, params) {
  const inlined = inlineParams(sql, params);
  const cmd = [
    './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', DB_NAME,
    ...d1ExecuteArgs(target),
    '--command', inlined, '--json',
  ];
  return execFileSync('node', cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

async function main() {
  const args = parseArgs();
  const stateDir = args.stateDir || STATE_DIR;
  const target = resolveTarget();
  const guardError = checkProductionGuard(target);
  if (guardError) {
    console.error(`\n${guardError}`);
    process.exit(1);
  }

  const input = (process.argv.find((a) => a.startsWith('--input=')) || `--input=${path.join(stateDir, 'ministers-rows.json')}`).split('=')[1];
  banner(`D1 import -> ministers (target: ${target})`, args);

  if (!fs.existsSync(input)) {
    console.error(`No rows file at ${input}. Run transform-ministers.mjs first, or pass --input=<file>.`);
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(input, 'utf8'));
  console.log(`  ${rows.length} row(s) to import\n`);

  const journal = new Journal(`import-${target}`, stateDir);
  const report = { at: new Date().toISOString(), target, mode: args.apply ? 'apply' : 'dry-run', rows: rows.length };
  let inserted = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    const jkey = `ministers:${row.id}`;
    if (args.resume && journal.has(jkey)) {
      skipped++;
      continue;
    }

    const { sql, params } = buildInsert('ministers', row);

    if (!args.apply) {
      console.log(`  would insert ministers.${row.id} (${row.display_name})`);
      continue;
    }

    try {
      d1Insert(target, sql, params);
      inserted++;
      journal.record(jkey, 'ok', { table: 'ministers', id: row.id });
      console.log(`  ok ministers.${row.id}`);
    } catch (e) {
      failed++;
      journal.record(jkey, 'error', { table: 'ministers', id: row.id, error: String(e.message).slice(0, 300) });
      console.error(`  FAILED ministers.${row.id}: ${e.message}`);
    }
  }

  report.summary = { total: rows.length, inserted, skipped, failed };
  const file = writeReport(`import-${target}`, report, stateDir);
  console.log(`\ntotal=${rows.length} inserted=${inserted} resumed=${skipped} failed=${failed}`);
  console.log(`Report: ${file}`);
  if (!args.apply) console.log('Dry-run only. Re-run with --apply to write.');
  if (failed) process.exit(1);
}

if (process.argv[1]?.endsWith('import-ministers.mjs')) {
  main().catch((e) => {
    console.error(`\nImport failed: ${e.message}`);
    process.exit(1);
  });
}
