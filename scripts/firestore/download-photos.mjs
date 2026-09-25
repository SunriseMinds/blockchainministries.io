#!/usr/bin/env node
/**
 * Download minister photos listed in the transform-ministers.mjs photo
 * manifest to a local directory, checksummed. Sends nothing anywhere else —
 * this script only reads from the source URLs and writes to local disk.
 *
 *   node scripts/firestore/download-photos.mjs [--apply]
 *        [--manifest=<manifest.json>] [--out=<dir>]
 *
 * Output directory defaults to `.migration/ministers-photos/ministers/`, so
 * `scripts/migrate-files-r2.mjs --source=.migration/ministers-photos` uploads
 * it directly (that script keys off the `ministers/` path prefix already).
 *
 * DRY-RUN by default: lists what would be downloaded, downloads nothing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, banner, Journal, sha256, writeReport, STATE_DIR } from '../lib/migrate-common.mjs';

const args = parseArgs();
const stateDir = args.stateDir || STATE_DIR;
const manifestPath = (process.argv.find((a) => a.startsWith('--manifest=')) || `--manifest=${path.join(stateDir, 'ministers-photo-manifest.json')}`).split('=')[1];
const outDir = (process.argv.find((a) => a.startsWith('--out=')) || `--out=${path.join(stateDir, 'ministers-photos')}`).split('=')[1];

banner('Download minister photos (read-only, local disk only)', args);

/** manifest entry {id, source, target: "ministers/<id>.<ext>"} -> local file path under outDir. */
export function localPathFor(outputDir, targetKey) {
  return path.join(outputDir, ...targetKey.split('/'));
}

async function downloadOne(source, destPath, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(source);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${source}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return sha256(buf);
}

async function main() {
  if (!fs.existsSync(manifestPath)) {
    console.error(`No photo manifest at ${manifestPath}. Run transform-ministers.mjs first.`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`  ${manifest.length} photo(s) in manifest\n`);

  const journal = new Journal('ministers-photos', stateDir);
  const report = { at: new Date().toISOString(), mode: args.apply ? 'apply' : 'dry-run', photos: [] };
  let downloaded = 0, skipped = 0, failed = 0;

  for (const entry of manifest) {
    const jkey = entry.target;
    const destPath = localPathFor(outDir, entry.target);

    if (args.resume && journal.has(jkey)) {
      skipped++;
      continue;
    }

    if (!args.apply) {
      console.log(`  would download ${entry.source} -> ${destPath}`);
      report.photos.push({ ...entry, action: 'would_download' });
      continue;
    }

    try {
      const checksum = await downloadOne(entry.source, destPath);
      downloaded++;
      journal.record(jkey, 'ok', { id: entry.id, target: entry.target, sha256: checksum });
      console.log(`  ok ${entry.target}  sha256=${checksum.slice(0, 12)}…`);
      report.photos.push({ ...entry, sha256: checksum, action: 'downloaded' });
    } catch (e) {
      failed++;
      journal.record(jkey, 'error', { id: entry.id, target: entry.target, error: String(e.message).slice(0, 300) });
      console.error(`  FAILED ${entry.target}: ${e.message}`);
      report.photos.push({ ...entry, action: 'failed', error: e.message });
    }
  }

  report.summary = { total: manifest.length, downloaded, skipped, failed };
  const file = writeReport('ministers-photos', report, stateDir);
  console.log(`\ntotal=${manifest.length} downloaded=${downloaded} resumed=${skipped} failed=${failed}`);
  console.log(`Report: ${file}`);
  console.log(`Photos are ready for: node scripts/migrate-files-r2.mjs --source=${outDir}`);
  if (!args.apply) console.log('Dry-run only. Re-run with --apply to download.');
  if (failed) process.exit(1);
}

if (process.argv[1]?.endsWith('download-photos.mjs')) {
  main().catch((e) => {
    console.error(`\nDownload failed: ${e.message}`);
    process.exit(1);
  });
}
