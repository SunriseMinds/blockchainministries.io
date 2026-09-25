/**
 * Tests for scripts/firestore/transform-ministers.mjs — pure mapping logic.
 * Run: node --test scripts/firestore/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  transformDoc,
  transformAll,
  unwrapFields,
  unwrapValue,
  extForUrl,
  firestoreTimestampToIso,
} from './transform-ministers.mjs';

function strField(v) { return { stringValue: v }; }
function boolField(v) { return { booleanValue: v }; }
function tsField(v) { return { timestampValue: v }; }

test('unwrapValue handles every Firestore scalar kind', () => {
  assert.equal(unwrapValue({ nullValue: null }), null);
  assert.equal(unwrapValue(strField('x')), 'x');
  assert.equal(unwrapValue(boolField(true)), true);
  assert.equal(unwrapValue({ integerValue: '42' }), 42);
  assert.equal(unwrapValue({ doubleValue: 4.2 }), 4.2);
  assert.equal(unwrapValue(tsField('2024-01-01T00:00:00Z')), '2024-01-01T00:00:00Z');
  assert.deepEqual(unwrapValue({ arrayValue: { values: [strField('a'), strField('b')] } }), ['a', 'b']);
  assert.deepEqual(unwrapValue({ mapValue: { fields: { a: strField('b') } } }), { a: 'b' });
});

test('unwrapFields maps a full fields object', () => {
  const out = unwrapFields({ name: strField('Rev. A'), published: boolField(false) });
  assert.deepEqual(out, { name: 'Rev. A', published: false });
});

test('display_name: uses name field', () => {
  const { row } = transformDoc({ id: 'm1', fields: { name: strField('Rev. Alice') } });
  assert.equal(row.display_name, 'Rev. Alice');
});

test('display_name: falls back to displayName when name is absent', () => {
  const { row } = transformDoc({ id: 'm2', fields: { displayName: strField('Rev. Bob') } });
  assert.equal(row.display_name, 'Rev. Bob');
});

test('display_name: falls back to "Unnamed Minister" when both are absent', () => {
  const { row } = transformDoc({ id: 'm3', fields: {} });
  assert.equal(row.display_name, 'Unnamed Minister');
});

test('id is preserved verbatim from the Firestore doc id', () => {
  const { row } = transformDoc({ id: 'weird-Id_123', fields: { name: strField('X') } });
  assert.equal(row.id, 'weird-Id_123');
});

test('is_published defaults to 1', () => {
  const { row } = transformDoc({ id: 'm4', fields: { name: strField('X') } });
  assert.equal(row.is_published, 1);
});

test('is_published is 0 when published === false', () => {
  const { row } = transformDoc({ id: 'm5', fields: { name: strField('X'), published: boolField(false) } });
  assert.equal(row.is_published, 0);
});

test('is_published is 0 when hidden === true', () => {
  const { row } = transformDoc({ id: 'm6', fields: { name: strField('X'), hidden: boolField(true) } });
  assert.equal(row.is_published, 0);
});

test('is_published stays 1 when published is present but true', () => {
  const { row } = transformDoc({ id: 'm7', fields: { name: strField('X'), published: boolField(true) } });
  assert.equal(row.is_published, 1);
});

test('photo_key and photo manifest entry are only produced when imageUrl exists', () => {
  const withImage = transformDoc({ id: 'm8', fields: { name: strField('X'), imageUrl: strField('https://x.example/pic.png') } });
  assert.equal(withImage.row.photo_key, 'ministers/m8.png');
  assert.deepEqual(withImage.photo, { id: 'm8', source: 'https://x.example/pic.png', target: 'ministers/m8.png' });

  const withoutImage = transformDoc({ id: 'm9', fields: { name: strField('X') } });
  assert.equal(withoutImage.row.photo_key, null);
  assert.equal(withoutImage.photo, null);
});

test('extForUrl defaults to jpg for extension-less or unknown URLs', () => {
  assert.equal(extForUrl('https://x.example/pic.png'), 'png');
  assert.equal(extForUrl('https://x.example/pic.JPEG?token=abc'), 'jpeg');
  assert.equal(extForUrl('https://x.example/no-extension'), 'jpg');
  assert.equal(extForUrl(undefined), 'jpg');
});

test('unmapped fields (specialties, ordinationDate) are reported, not written to the row', () => {
  const { row, unmapped } = transformDoc({
    id: 'm10',
    fields: {
      name: strField('X'),
      specialties: { arrayValue: { values: [strField('prayer')] } },
      ordinationDate: tsField('2020-05-01T00:00:00Z'),
    },
  });
  assert.equal(row.specialties, undefined);
  assert.equal(row.ordinationDate, undefined);
  assert.ok(unmapped.includes('specialties'));
  assert.ok(unmapped.includes('ordinationDate'));
});

test('ordination_id maps from a real FK field (ordinationId), never from ordinationDate', () => {
  const { row } = transformDoc({ id: 'm11', fields: { name: strField('X'), ordinationId: strField('ord-1') } });
  assert.equal(row.ordination_id, 'ord-1');
});

test('firestoreTimestampToIso handles ISO strings, {seconds} objects, and null', () => {
  assert.equal(firestoreTimestampToIso('2024-01-01T00:00:00Z'), '2024-01-01T00:00:00.000Z');
  assert.equal(firestoreTimestampToIso({ seconds: 1704067200, nanoseconds: 0 }), '2024-01-01T00:00:00.000Z');
  assert.equal(firestoreTimestampToIso(null), null);
  assert.equal(firestoreTimestampToIso(undefined), null);
});

test('created_at/updated_at fall back to doc createTime/updateTime, then now()', () => {
  const fixedNow = '2030-01-01T00:00:00.000Z';
  const { row } = transformDoc(
    { id: 'm12', fields: { name: strField('X') }, createTime: '2021-01-01T00:00:00Z', updateTime: '2022-01-01T00:00:00Z' },
    { now: () => fixedNow }
  );
  assert.equal(row.created_at, '2021-01-01T00:00:00.000Z');
  assert.equal(row.updated_at, '2022-01-01T00:00:00.000Z');

  const { row: rowNoDates } = transformDoc({ id: 'm13', fields: { name: strField('X') } }, { now: () => fixedNow });
  assert.equal(rowNoDates.created_at, fixedNow);
  assert.equal(rowNoDates.updated_at, fixedNow);
});

test('transformDoc throws on a document missing an id', () => {
  assert.throws(() => transformDoc({ fields: {} }), /missing an id/);
});

test('transformAll collects one bad doc as an error without dropping the rest', () => {
  const docs = [
    { id: 'ok1', fields: { name: strField('A') } },
    { fields: { name: strField('bad, no id') } },
    { id: 'ok2', fields: { name: strField('B') } },
  ];
  const { rows, report } = transformAll(docs);
  assert.equal(rows.length, 2);
  assert.equal(report.errors.length, 1);
  assert.equal(report.totalDocuments, 3);
});

test('transformAll aggregates unmapped field counts and photo manifest across docs', () => {
  const docs = [
    { id: 'a', fields: { name: strField('A'), imageUrl: strField('https://x/a.jpg'), specialties: strField('x') } },
    { id: 'b', fields: { name: strField('B'), specialties: strField('y') } },
  ];
  const { photos, report } = transformAll(docs);
  assert.equal(photos.length, 1);
  assert.equal(report.unmappedFields.specialties, 2);
});
