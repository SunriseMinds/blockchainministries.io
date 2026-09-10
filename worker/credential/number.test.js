/**
 * M11 Phase 3 — credential number generator.
 *
 * Deliberately a SANITY suite, not a uniqueness proof. Uniqueness is owned by
 * the D1 partial unique index and is proved in ordinations.test.js against the
 * real schema; hammering the generator with 100k draws would prove nothing the
 * database does not already guarantee.
 *
 * Run: node --test worker/credential/number.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateCredentialNumber, CREDENTIAL_NUMBER_PATTERN } from './number.js';

test('matches the ratified BM-XXXXXXXX format', () => {
  for (let i = 0; i < 200; i += 1) {
    const n = generateCredentialNumber();
    assert.match(n, /^BM-[A-Z0-9]{8}$/, `bad format: ${n}`);
    assert.match(n, CREDENTIAL_NUMBER_PATTERN);
    assert.equal(n.length, 11); // "BM-" + 8
  }
});

test('uses only uppercase A-Z and 0-9 after the prefix — never lowercase or symbols', () => {
  const seen = new Set();
  for (let i = 0; i < 500; i += 1) {
    for (const ch of generateCredentialNumber().slice(3)) seen.add(ch);
  }
  const allowed = new Set('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
  for (const ch of seen) assert.ok(allowed.has(ch), `disallowed character produced: ${JSON.stringify(ch)}`);
  // Over 4000 symbols the full alphabet should appear; a generator stuck on a
  // subset (e.g. a broken modulo) would fail here.
  assert.ok(seen.size >= 30, `alphabet coverage too narrow: ${seen.size} distinct symbols`);
});

test('is non-sequential and non-repeating across calls', () => {
  const batch = Array.from({ length: 100 }, () => generateCredentialNumber());
  assert.equal(new Set(batch).size, 100, 'generator produced a duplicate in 100 draws');
});

test('source uses crypto.getRandomValues and never Math.random', () => {
  // A guard against a future "simplification" swapping in a weak PRNG, which
  // would be invisible to every behavioural assertion above. Comments are
  // stripped first — number.js documents why Math.random is forbidden, and
  // naming it in prose must not read as using it.
  const src = readFileSync(new URL('./number.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  assert.ok(code.includes('crypto.getRandomValues'), 'must use crypto.getRandomValues');
  assert.ok(!/Math\s*\.\s*random/.test(code), 'must never use Math.random');
});

test('encodes no caller-supplied identity — takes no arguments', () => {
  assert.equal(generateCredentialNumber.length, 0);
  // Passing something anyway must not leak into the output.
  const n = generateCredentialNumber('user-12345');
  assert.ok(!n.includes('12345'));
});
