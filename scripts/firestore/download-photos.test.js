/**
 * Tests for scripts/firestore/download-photos.mjs — path shaping only (no
 * network; downloads are exercised via localPathFor's pure logic).
 * Run: node --test scripts/firestore/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { localPathFor } from './download-photos.mjs';

test('localPathFor nests under ministers/<id>.<ext>, matching the migrate-files-r2.mjs source layout', () => {
  const p = localPathFor('.migration/ministers-photos', 'ministers/abc123.png');
  assert.equal(p, path.join('.migration/ministers-photos', 'ministers', 'abc123.png'));
});
