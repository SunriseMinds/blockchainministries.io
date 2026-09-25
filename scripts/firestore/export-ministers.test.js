/**
 * Tests for scripts/firestore/export-ministers.mjs — offline normalization
 * and REST pagination (fetch is always mocked; no network, no real project).
 * Run: node --test scripts/firestore/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeDoc,
  normalizeExportPayload,
  buildFieldInventory,
  listDocumentsPage,
  listAllDocuments,
} from './export-ministers.mjs';

test('normalizeDoc handles REST shape (name + fields)', () => {
  const doc = normalizeDoc({
    name: 'projects/p/databases/(default)/documents/ministers/abc123',
    fields: { name: { stringValue: 'Rev. X' } },
    createTime: '2024-01-01T00:00:00Z',
  });
  assert.equal(doc.id, 'abc123');
  assert.deepEqual(doc.fields, { name: { stringValue: 'Rev. X' } });
  assert.equal(doc.createTime, '2024-01-01T00:00:00Z');
});

test('normalizeDoc handles a console-export shape already carrying {id, fields}', () => {
  const doc = normalizeDoc({ id: 'xyz', fields: { name: { stringValue: 'Rev. Y' } } });
  assert.equal(doc.id, 'xyz');
});

test('normalizeDoc wraps a flattened console-export doc ({id, ...plainValues})', () => {
  const doc = normalizeDoc({ id: 'flat1', name: 'Rev. Flat', published: false, specialties: ['prayer'] });
  assert.equal(doc.id, 'flat1');
  assert.deepEqual(doc.fields.name, { stringValue: 'Rev. Flat' });
  assert.deepEqual(doc.fields.published, { booleanValue: false });
  assert.deepEqual(doc.fields.specialties, { arrayValue: { values: [{ stringValue: 'prayer' }] } });
});

test('normalizeDoc throws on a document with no id at all', () => {
  assert.throws(() => normalizeDoc({ fields: {} }), /missing an id/);
});

test('normalizeExportPayload accepts a bare array or {documents: [...]}', () => {
  const fromArray = normalizeExportPayload([{ id: 'a', fields: {} }]);
  assert.equal(fromArray.length, 1);
  const fromWrapped = normalizeExportPayload({ documents: [{ id: 'b', fields: {} }] });
  assert.equal(fromWrapped.length, 1);
});

test('normalizeExportPayload rejects an unrecognized shape', () => {
  assert.throws(() => normalizeExportPayload({ nope: true }), /Unrecognized export shape/);
});

test('buildFieldInventory counts field occurrences and types, sorted by count', () => {
  const docs = [
    { id: 'a', fields: { name: { stringValue: 'A' }, published: { booleanValue: true } } },
    { id: 'b', fields: { name: { stringValue: 'B' } } },
  ];
  const inventory = buildFieldInventory(docs);
  assert.equal(inventory.totalDocuments, 2);
  assert.equal(inventory.fields.name.count, 2);
  assert.deepEqual(inventory.fields.name.types, ['stringValue']);
  assert.equal(inventory.fields.published.count, 1);
});

test('listDocumentsPage sends the auth header and parses one page', async () => {
  let capturedUrl, capturedHeaders;
  const fetchImpl = async (url, opts) => {
    capturedUrl = url;
    capturedHeaders = opts.headers;
    return {
      ok: true,
      json: async () => ({ documents: [{ name: 'projects/p/databases/(default)/documents/ministers/1', fields: {} }], nextPageToken: 'tok2' }),
    };
  };
  const page = await listDocumentsPage({ projectId: 'p', collectionId: 'ministers', accessToken: 'FAKE_TOKEN', fetchImpl });
  assert.equal(page.documents.length, 1);
  assert.equal(page.nextPageToken, 'tok2');
  assert.match(capturedUrl, /projects\/p\/databases\/\(default\)\/documents\/ministers/);
  assert.equal(capturedHeaders.Authorization, 'Bearer FAKE_TOKEN');
});

test('listDocumentsPage throws with the HTTP status on a non-ok response, no credential echo', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, text: async () => 'Permission denied' });
  await assert.rejects(
    () => listDocumentsPage({ projectId: 'p', collectionId: 'ministers', accessToken: 'FAKE_TOKEN', fetchImpl }),
    /HTTP 403/
  );
});

test('listAllDocuments drains multiple pages via pageToken until nextPageToken is absent', async () => {
  const pages = [
    { documents: [{ name: 'projects/p/databases/(default)/documents/ministers/1', fields: {} }], nextPageToken: 'tok2' },
    { documents: [{ name: 'projects/p/databases/(default)/documents/ministers/2', fields: {} }], nextPageToken: 'tok3' },
    { documents: [{ name: 'projects/p/databases/(default)/documents/ministers/3', fields: {} }] },
  ];
  let call = 0;
  const seenTokens = [];
  const fetchImpl = async (url) => {
    const token = new URL(url).searchParams.get('pageToken');
    seenTokens.push(token);
    const page = pages[call++];
    return { ok: true, json: async () => page };
  };
  const docs = await listAllDocuments({ projectId: 'p', collectionId: 'ministers', accessToken: 'FAKE_TOKEN', fetchImpl });
  assert.equal(docs.length, 3);
  assert.deepEqual(docs.map((d) => d.id), ['1', '2', '3']);
  assert.deepEqual(seenTokens, [null, 'tok2', 'tok3']);
});
