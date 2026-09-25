#!/usr/bin/env node
/**
 * Transform normalized Firestore `ministers` documents (as written by
 * export-ministers.mjs) into D1 `ministers` rows.
 *
 * Pure module: every exported function is deterministic and side-effect
 * free. The CLI at the bottom just wires stdin (the export file) to disk
 * output; test it directly by importing the functions instead of shelling
 * out.
 *
 *   node scripts/firestore/transform-ministers.mjs [--input=<export.json>]
 *
 * Old frontend fields read: name, title, bio, imageUrl, ordinationDate,
 * specialties. D1 `ministers` columns: id, display_name, title, bio,
 * photo_key, ordination_id, is_published, created_at, updated_at.
 *
 * Mapping:
 *  - id                <- Firestore doc id (preserved verbatim: /minister/:id is live)
 *  - display_name      <- name || displayName, else "Unnamed Minister"
 *  - title             <- title
 *  - bio               <- bio
 *  - photo_key         <- `ministers/<id>.<ext>`, only when imageUrl is present
 *  - ordination_id     <- ordinationId (a real FK value), if present; NOT ordinationDate
 *  - is_published       = 1 unless published === false or hidden === true
 *  - created_at/updated_at <- createdAt/updatedAt or the doc's createTime/updateTime, else "now"
 *
 * Anything else on the document (specialties, ordinationDate, and any field
 * not listed above) is NOT written to D1 — it is collected into the
 * unmapped-fields report so a human can decide whether it needs a schema
 * change later.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, banner, toIso, writeReport, STATE_DIR } from '../lib/migrate-common.mjs';

const KNOWN_FIELDS = new Set([
  'name', 'displayName', 'title', 'bio', 'imageUrl',
  'ordinationId', 'published', 'hidden', 'createdAt', 'updatedAt',
]);

/* ------------------------------------------------------- Firestore unwrap -- */
/** Firestore REST field-value -> plain JS value. */
export function unwrapValue(fv) {
  if (fv === null || fv === undefined) return null;
  if ('nullValue' in fv) return null;
  if ('stringValue' in fv) return fv.stringValue;
  if ('booleanValue' in fv) return fv.booleanValue;
  if ('integerValue' in fv) return Number(fv.integerValue);
  if ('doubleValue' in fv) return fv.doubleValue;
  if ('timestampValue' in fv) return fv.timestampValue; // ISO string already
  if ('mapValue' in fv) return unwrapFields(fv.mapValue?.fields || {});
  if ('arrayValue' in fv) return (fv.arrayValue?.values || []).map(unwrapValue);
  if ('geoPointValue' in fv) return fv.geoPointValue;
  if ('referenceValue' in fv) return fv.referenceValue;
  return null;
}

/** Firestore REST fields map -> plain JS object. */
export function unwrapFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = unwrapValue(v);
  return out;
}

/* -------------------------------------------------------------- helpers -- */
/** Best-effort file extension from an image URL, defaulting to jpg. */
export function extForUrl(url) {
  if (typeof url !== 'string') return 'jpg';
  const match = url.split('?')[0].match(/\.([a-zA-Z0-9]{2,5})$/);
  const ext = match ? match[1].toLowerCase() : 'jpg';
  return /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'jpg';
}

/** Convert a Firestore timestamp (ISO string, {seconds,...}, or ms epoch) -> ISO-8601, else null. */
export function firestoreTimestampToIso(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return toIso(value);
  if (typeof value === 'number') return toIso(new Date(value).toISOString());
  if (typeof value === 'object' && 'seconds' in value) {
    const ms = Number(value.seconds) * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6);
    return toIso(new Date(ms).toISOString());
  }
  return null;
}

/* -------------------------------------------------------------- transform -- */
/**
 * Transform one normalized Firestore doc ({id, fields, createTime?, updateTime?})
 * into { row, photo, unmapped }.
 *  - row: the D1 ministers row (all columns present)
 *  - photo: {id, source, target} or null when no imageUrl
 *  - unmapped: field names present on the doc but not written to D1
 */
export function transformDoc(doc, { now = () => new Date().toISOString() } = {}) {
  if (!doc || !doc.id) throw new Error('Document is missing an id');
  const id = doc.id;
  const data = unwrapFields(doc.fields || {});

  const displayName = data.name || data.displayName || 'Unnamed Minister';
  const isPublished = data.published === false || data.hidden === true ? 0 : 1;

  let photoKey = null;
  let photo = null;
  if (data.imageUrl) {
    const ext = extForUrl(data.imageUrl);
    photoKey = `ministers/${id}.${ext}`;
    photo = { id, source: data.imageUrl, target: photoKey };
  }

  const createdAt =
    firestoreTimestampToIso(data.createdAt) || firestoreTimestampToIso(doc.createTime) || now();
  const updatedAt =
    firestoreTimestampToIso(data.updatedAt) || firestoreTimestampToIso(doc.updateTime) || createdAt;

  const row = {
    id,
    display_name: displayName,
    title: data.title ?? null,
    bio: data.bio ?? null,
    photo_key: photoKey,
    ordination_id: data.ordinationId ?? null,
    is_published: isPublished,
    created_at: createdAt,
    updated_at: updatedAt,
  };

  const unmapped = Object.keys(data).filter((k) => !KNOWN_FIELDS.has(k));

  return { row, photo, unmapped };
}

/** Transform a whole array of normalized docs. Never throws on a single bad doc; collects it as an error instead. */
export function transformAll(docs, opts = {}) {
  const rows = [];
  const photos = [];
  const unmappedFieldCounts = new Map();
  const errors = [];

  for (const doc of docs) {
    try {
      const { row, photo, unmapped } = transformDoc(doc, opts);
      rows.push(row);
      if (photo) photos.push(photo);
      for (const field of unmapped) {
        unmappedFieldCounts.set(field, (unmappedFieldCounts.get(field) || 0) + 1);
      }
    } catch (e) {
      errors.push({ id: doc?.id ?? '(unknown)', error: e.message });
    }
  }

  const report = {
    totalDocuments: docs.length,
    rowsProduced: rows.length,
    photosToDownload: photos.length,
    errors,
    unmappedFields: Object.fromEntries(
      [...unmappedFieldCounts.entries()].sort((a, b) => b[1] - a[1])
    ),
  };

  return { rows, photos, report };
}

/* -------------------------------------------------------------------- CLI -- */
async function main() {
  const args = parseArgs();
  const stateDir = args.stateDir || STATE_DIR;
  const input = (process.argv.find((a) => a.startsWith('--input=')) || `--input=${path.join(stateDir, 'ministers-export.json')}`).split('=')[1];

  banner('Transform Firestore ministers -> D1 rows', args);

  if (!fs.existsSync(input)) {
    console.error(`No export file at ${input}. Run export-ministers.mjs first, or pass --input=<file>.`);
    process.exit(1);
  }
  const docs = JSON.parse(fs.readFileSync(input, 'utf8'));
  const { rows, photos, report } = transformAll(docs);

  fs.mkdirSync(stateDir, { recursive: true });
  const rowsFile = path.join(stateDir, 'ministers-rows.json');
  fs.writeFileSync(rowsFile, JSON.stringify(rows, null, 2));
  const photoManifestFile = path.join(stateDir, 'ministers-photo-manifest.json');
  fs.writeFileSync(photoManifestFile, JSON.stringify(photos, null, 2));
  const reportFile = writeReport('ministers-transform', report, stateDir);

  console.log(`  ${report.rowsProduced}/${report.totalDocuments} document(s) transformed -> ${rowsFile}`);
  console.log(`  ${photos.length} photo(s) to download -> ${photoManifestFile}`);
  if (report.errors.length) {
    console.log(`  ${report.errors.length} document(s) FAILED to transform (see report)`);
  }
  const unmapped = Object.entries(report.unmappedFields);
  if (unmapped.length) {
    console.log('  unmapped fields (not written to D1):');
    for (const [name, count] of unmapped) console.log(`    ${name.padEnd(20)} on ${count} doc(s)`);
  }
  console.log(`  Report: ${reportFile}`);
}

if (process.argv[1]?.endsWith('transform-ministers.mjs')) {
  main().catch((e) => {
    console.error(`\nTransform failed: ${e.message}`);
    process.exit(1);
  });
}
