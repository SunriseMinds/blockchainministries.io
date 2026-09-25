#!/usr/bin/env node
/**
 * Export the Firestore `ministers` collection to a local JSON file, read-only.
 *
 *   node scripts/firestore/export-ministers.mjs --from-file=<export.json>
 *   node scripts/firestore/export-ministers.mjs --project=<gcp-project-id> [--credentials=<sa.json>]
 *
 * Two sources:
 *  - `--from-file=<path>`: a console/gcloud Firestore export (JSON array of docs,
 *    or `{documents: [...]}`), works fully offline. No network access at all.
 *  - Firestore REST `documents:list` with pagination, authenticated with a
 *    service-account JWT signed locally via node:crypto (no new dependency).
 *    The service-account JSON path comes from `--credentials=` or
 *    `GOOGLE_APPLICATION_CREDENTIALS`. Requires `--project=<id>`.
 *
 * This script NEVER writes to Firestore and NEVER prints credential contents
 * (the service-account private key, or any OAuth token).
 *
 * Output (under .migration/, gitignored):
 *   .migration/ministers-export.json    - array of raw Firestore-shaped docs
 *   .migration/ministers-field-inventory-<ts>.json - field name/count/type report
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs, banner, writeReport, STATE_DIR } from '../lib/migrate-common.mjs';

const args = parseArgs();
const stateDir = args.stateDir || STATE_DIR;
const fromFile = (process.argv.find((a) => a.startsWith('--from-file=')) || '').split('=')[1];
const project = (process.argv.find((a) => a.startsWith('--project=')) || '').split('=')[1];
const credentialsPath =
  (process.argv.find((a) => a.startsWith('--credentials=')) || '').split('=')[1] ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS;
const collection = (process.argv.find((a) => a.startsWith('--collection=')) || '--collection=ministers').split('=')[1];

banner('Firestore export -> ministers (read-only)', args);

/* --------------------------------------------------------- from-file path -- */
/** Normalize a console/gcloud export into a flat array of {id, fields}. */
export function normalizeExportPayload(payload) {
  let docs;
  if (Array.isArray(payload)) docs = payload;
  else if (Array.isArray(payload?.documents)) docs = payload.documents;
  else throw new Error('Unrecognized export shape: expected an array or {documents: [...]}');
  return docs.map(normalizeDoc);
}

/** A raw Firestore REST document -> {id, fields} with fields left in native REST shape. */
export function normalizeDoc(doc) {
  if (!doc || typeof doc !== 'object') throw new Error('Malformed document entry');
  // REST shape: {name: "projects/.../documents/ministers/<id>", fields: {...}}
  if (doc.name && doc.fields) {
    const id = doc.name.split('/').pop();
    return { id, fields: doc.fields, createTime: doc.createTime, updateTime: doc.updateTime };
  }
  // Console-export shape may already be {id, fields} or {id, ...plainFields}.
  if (doc.id && doc.fields) return { id: doc.id, fields: doc.fields };
  if (doc.id) {
    const { id, ...rest } = doc;
    return { id, fields: wrapPlainFields(rest) };
  }
  throw new Error('Document is missing an id');
}

/** Wrap plain JS values into Firestore REST field-value shape, for console exports that already flattened fields. */
function wrapPlainFields(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = wrapValue(v);
  return out;
}
function wrapValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(wrapValue) } };
  if (typeof v === 'object') return { mapValue: { fields: wrapPlainFields(v) } };
  return { stringValue: String(v) };
}

/* -------------------------------------------------------------- REST path -- */
function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Sign a Google service-account JWT locally (node:crypto, RS256). No external deps. */
function signServiceAccountJwt(serviceAccount) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(serviceAccount.private_key);
  return `${signingInput}.${signature.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

async function fetchAccessToken(serviceAccount) {
  const jwt = signServiceAccountJwt(serviceAccount);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: HTTP ${res.status} (credential contents withheld)`);
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('Token exchange returned no access_token');
  return data.access_token;
}

/** One page of Firestore documents:list. Exported for pagination unit tests with a mocked fetch. */
export async function listDocumentsPage({ projectId, collectionId, accessToken, pageToken, pageSize = 300, fetchImpl = fetch }) {
  const url = new URL(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collectionId}`
  );
  url.searchParams.set('pageSize', String(pageSize));
  if (pageToken) url.searchParams.set('pageToken', pageToken);
  const res = await fetchImpl(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Firestore list failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return {
    documents: data.documents || [],
    nextPageToken: data.nextPageToken || null,
  };
}

/** Drain all pages into a flat array of normalized docs. Exported for tests with a mocked fetch. */
export async function listAllDocuments({ projectId, collectionId, accessToken, pageSize = 300, fetchImpl = fetch }) {
  const out = [];
  let pageToken;
  do {
    const page = await listDocumentsPage({ projectId, collectionId, accessToken, pageToken, pageSize, fetchImpl });
    for (const doc of page.documents) out.push(normalizeDoc(doc));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

/* ---------------------------------------------------------- field inventory -- */
/** Firestore REST field-value -> a JS type label, for the inventory report. */
function fieldValueType(value) {
  if (!value || typeof value !== 'object') return 'unknown';
  const key = Object.keys(value)[0];
  return key || 'unknown';
}

export function buildFieldInventory(docs) {
  const fields = new Map(); // name -> {count, types: Set}
  for (const doc of docs) {
    for (const [name, value] of Object.entries(doc.fields || {})) {
      if (!fields.has(name)) fields.set(name, { count: 0, types: new Set() });
      const entry = fields.get(name);
      entry.count += 1;
      entry.types.add(fieldValueType(value));
    }
  }
  return {
    totalDocuments: docs.length,
    fields: Object.fromEntries(
      [...fields.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([name, { count, types }]) => [name, { count, types: [...types] }])
    ),
  };
}

/* -------------------------------------------------------------------- main -- */
async function main() {
  let docs;

  if (fromFile) {
    console.log(`  reading export from ${fromFile} (offline, no network)`);
    const raw = JSON.parse(fs.readFileSync(fromFile, 'utf8'));
    docs = normalizeExportPayload(raw);
  } else {
    if (!project) {
      console.error('Need either --from-file=<export.json> or --project=<gcp-project-id>.');
      console.error('  --from-file=<path>      offline: a console/gcloud Firestore export');
      console.error('  --project=<id>           online: Firestore REST, needs a service account');
      console.error('  --credentials=<sa.json>  (or set GOOGLE_APPLICATION_CREDENTIALS)');
      process.exit(1);
    }
    if (!credentialsPath) {
      console.error('No service-account credentials given (--credentials= or GOOGLE_APPLICATION_CREDENTIALS).');
      process.exit(1);
    }
    if (!fs.existsSync(credentialsPath)) {
      console.error(`Credentials file not found: ${credentialsPath}`);
      process.exit(1);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
    console.log(`  authenticating as ${serviceAccount.client_email || '(unknown service account)'}`);
    const accessToken = await fetchAccessToken(serviceAccount);
    console.log(`  listing collection "${collection}" in project ${project} (paginated, read-only)`);
    docs = await listAllDocuments({ projectId: project, collectionId: collection, accessToken });
  }

  fs.mkdirSync(stateDir, { recursive: true });
  const outFile = path.join(stateDir, 'ministers-export.json');
  fs.writeFileSync(outFile, JSON.stringify(docs, null, 2));

  const inventory = buildFieldInventory(docs);
  const reportFile = writeReport('ministers-field-inventory', inventory, stateDir);

  console.log(`\n  exported ${docs.length} document(s) -> ${outFile}`);
  console.log(`  field inventory -> ${reportFile}`);
  for (const [name, info] of Object.entries(inventory.fields)) {
    console.log(`    ${name.padEnd(20)} count=${String(info.count).padStart(5)} types=${info.types.join(',')}`);
  }
}

// Only run when executed directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/') || process.argv[1]?.endsWith('export-ministers.mjs')) {
  main().catch((e) => {
    console.error(`\nExport failed: ${e.message}`);
    process.exit(1);
  });
}
