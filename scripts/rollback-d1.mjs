#!/usr/bin/env node
/**
 * Roll back a D1 import using its journal.
 *
 *   node scripts/rollback-d1.mjs [--apply] [--target=local|preview|production]
 *        [--tables=a,b] [--i-have-approval=<approval-id>]
 *        (--i-have-approval is required with --target=production)
 *
 * Deletes ONLY the ids this tooling recorded as written, in reverse dependency
 * order. Rows created by real users after the import are never touched, because
 * they are not in the journal.
 *
 * DRY-RUN by default.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  parseArgs, banner, writeReport, TABLE_ORDER, STATE_DIR,
  inlineParams, d1TargetArgs, resolveD1Target, checkD1ProductionGuard,
} from './lib/migrate-common.mjs';

const DB_NAME = 'blockchain-ministries-db';

export function resolveTarget(argv = process.argv.slice(2)) {
  return resolveD1Target(argv, 'preview');
}

export function checkProductionGuard(target, argv = process.argv.slice(2)) {
  return checkD1ProductionGuard(target, argv);
}

/** wrangler d1 execute args for one target. See migrate-common.mjs#d1TargetArgs. */
export function d1ExecuteArgs(target) {
  return d1TargetArgs(target);
}

/** Build the chunked DELETE statements for one table's ids. No wrangler call. */
export function buildDeleteChunks(table, ids, chunkSize = 50) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const sql = `DELETE FROM ${table} WHERE id IN (${chunk.map(() => '?').join(',')})`;
    chunks.push({ ids: chunk, sql, inlined: inlineParams(sql, chunk) });
  }
  return chunks;
}

function d1Delete(target, table, ids) {
  let deleted = 0;
  for (const { ids: chunk, inlined } of buildDeleteChunks(table, ids)) {
    const cmd = [
      './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', DB_NAME,
      ...d1ExecuteArgs(target),
      '--command', inlined, '--json',
    ];
    execFileSync('node', cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    deleted += chunk.length;
  }
  return deleted;
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
  banner(`D1 rollback (target: ${target})`, args);

  const journalFile = path.join(stateDir, `import-${target}.jsonl`);
  if (!fs.existsSync(journalFile)) {
    console.error(`No journal at ${journalFile}. Nothing to roll back.`);
    process.exit(1);
  }

  // table -> [ids written by this tooling]. Only journal ids are ever deleted.
  const byTable = new Map();
  for (const line of fs.readFileSync(journalFile, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (rec.status !== 'ok' || !rec.table || !rec.id) continue;
    if (!byTable.has(rec.table)) byTable.set(rec.table, new Set());
    byTable.get(rec.table).add(rec.id);
  }

  // Children before parents.
  const order = [...TABLE_ORDER].reverse();
  const tables = args.tables || order;
  const report = { at: new Date().toISOString(), target, mode: args.apply ? 'apply' : 'dry-run', tables: {} };

  for (const table of tables) {
    const ids = [...(byTable.get(table) ?? [])];
    if (!ids.length) continue;
    console.log(`  ${table.padEnd(26)} ${String(ids.length).padStart(6)} rows ${args.apply ? 'DELETING' : 'would delete'}`);
    if (args.apply) {
      try {
        report.tables[table] = { deleted: d1Delete(target, table, ids) };
      } catch (e) {
        report.tables[table] = { error: String(e.message).slice(0, 300) };
        console.error(`    ERROR: ${e.message}`);
      }
    } else {
      report.tables[table] = { would_delete: ids.length };
    }
  }

  if (args.apply) {
    // Retire the journal so a later import starts clean.
    fs.renameSync(journalFile, `${journalFile}.rolledback-${Date.now()}`);
    console.log('\nJournal archived; a subsequent import will start fresh.');
  }
  const file = writeReport(`rollback-${target}`, report, stateDir);
  console.log(`Report: ${file}`);
  if (!args.apply) console.log('Dry-run only. Re-run with --apply to delete.');
}

if (process.argv[1]?.endsWith('rollback-d1.mjs')) {
  main().catch((e) => {
    console.error(`\nRollback failed: ${e.message}`);
    process.exit(1);
  });
}
