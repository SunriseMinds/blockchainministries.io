/**
 * D1 cutover — ministers data mapping.
 *
 * Run: node --test src/pages/ministersData.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInitials, mapMinister, mapMinisters, photoUrl } from './ministersData.js';

test('photoUrl: maps a photo_key to the public files route, encoding each segment', () => {
  assert.equal(photoUrl('ministers/m1.jpg'), '/api/files/public/ministers/m1.jpg');
});

test('photoUrl: encodes unsafe characters within a segment without escaping slashes', () => {
  assert.equal(photoUrl('ministers/m 1.jpg'), '/api/files/public/ministers/m%201.jpg');
});

test('photoUrl: missing, empty, or non-string keys map to undefined', () => {
  assert.equal(photoUrl(undefined), undefined);
  assert.equal(photoUrl(null), undefined);
  assert.equal(photoUrl(''), undefined);
  assert.equal(photoUrl(42), undefined);
});

test('photoUrl: a leading slash is rejected', () => {
  assert.equal(photoUrl('/ministers/m1.jpg'), undefined);
});

test('photoUrl: a ".." segment is rejected', () => {
  assert.equal(photoUrl('ministers/../secret.jpg'), undefined);
  assert.equal(photoUrl('../ministers/m1.jpg'), undefined);
});


test('getInitials: two-word name uses first+last initial', () => {
  assert.equal(getInitials('Jordan Rivers'), 'JR');
});

test('getInitials: three-word name uses first+last, not middle', () => {
  assert.equal(getInitials('Jordan Alexis Rivers'), 'JR');
});

test('getInitials: single-word name uses its first letter', () => {
  assert.equal(getInitials('Jordan'), 'J');
});

test('getInitials: empty/missing name falls back to BM', () => {
  assert.equal(getInitials(''), 'BM');
  assert.equal(getInitials(null), 'BM');
  assert.equal(getInitials(undefined), 'BM');
});

test('mapMinister: maps the D1 row shape onto the view model, including the derived photo URL', () => {
  const row = { id: 'm1', display_name: 'Jordan Rivers', title: 'Elder', bio: 'A bio.', photo_key: 'ministers/m1.jpg' };
  assert.deepEqual(mapMinister(row), {
    id: 'm1',
    name: 'Jordan Rivers',
    title: 'Elder',
    bio: 'A bio.',
    imageUrl: '/api/files/public/ministers/m1.jpg',
  });
});

test('mapMinister: an unsafe photo_key maps imageUrl to undefined', () => {
  const row = { id: 'm1', display_name: 'Jordan Rivers', title: 'Elder', bio: 'A bio.', photo_key: '../secret.jpg' };
  assert.equal(mapMinister(row).imageUrl, undefined);
});

test('mapMinister: missing optional fields fall back to empty strings, not undefined/null text', () => {
  const view = mapMinister({ id: 'm2', display_name: null, title: null, bio: null, photo_key: null });
  assert.equal(view.name, '');
  assert.equal(view.title, '');
  assert.equal(view.bio, '');
});

test('mapMinister: null/undefined/non-object input maps to null', () => {
  assert.equal(mapMinister(null), null);
  assert.equal(mapMinister(undefined), null);
  assert.equal(mapMinister('nope'), null);
});

test('mapMinisters: maps every item in {items}', () => {
  const response = {
    items: [
      { id: 'm1', display_name: 'A', title: 't', bio: 'b', photo_key: null },
      { id: 'm2', display_name: 'B', title: 't2', bio: 'b2', photo_key: null },
    ],
  };
  const views = mapMinisters(response);
  assert.equal(views.length, 2);
  assert.deepEqual(views.map((v) => v.id), ['m1', 'm2']);
});

test('mapMinisters: a malformed or missing {items} yields an empty list, never a throw', () => {
  assert.deepEqual(mapMinisters({}), []);
  assert.deepEqual(mapMinisters(null), []);
  assert.deepEqual(mapMinisters({ items: null }), []);
  assert.deepEqual(mapMinisters({ items: 'not-an-array' }), []);
});
