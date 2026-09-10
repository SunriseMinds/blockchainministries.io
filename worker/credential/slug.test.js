/**
 * M11 phone-scan defect regression — verification slug shape.
 *
 * The defect: slugs were base64url lowercased, so they could begin with `-`
 * (a real one was `-ot6njmwjgsq_4rz`). The QR and the Worker were both
 * correct, but URL auto-detection dropped the leading-punctuation segment and
 * the browser landed on /verify/ with no slug at all.
 *
 * Run: node --test worker/credential/slug.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateVerifySlug, VERIFY_SLUG_PATTERN } from './slug.js';

test('slug is exactly 16 lowercase alphanumerics', () => {
  for (let i = 0; i < 300; i += 1) {
    const s = generateVerifySlug();
    assert.match(s, /^[a-z0-9]{16}$/, `bad slug: ${s}`);
    assert.match(s, VERIFY_SLUG_PATTERN);
  }
});

test('REGRESSION: a slug can never begin with punctuation', () => {
  for (let i = 0; i < 1000; i += 1) {
    const s = generateVerifySlug();
    assert.ok(!s.startsWith('-'), `slug began with a hyphen: ${s}`);
    assert.ok(!s.startsWith('_'), `slug began with an underscore: ${s}`);
    assert.ok(/^[a-z0-9]/.test(s), `slug must start alphanumeric: ${s}`);
  }
});

test('REGRESSION: a slug can never END with punctuation either', () => {
  // Trailing punctuation is trimmed by link detectors just as readily.
  for (let i = 0; i < 1000; i += 1) {
    const s = generateVerifySlug();
    assert.ok(/[a-z0-9]$/.test(s), `slug must end alphanumeric: ${s}`);
  }
});

test('REGRESSION: no slug contains - or _ anywhere', () => {
  for (let i = 0; i < 1000; i += 1) {
    const s = generateVerifySlug();
    assert.ok(!s.includes('-') && !s.includes('_'), `slug contains punctuation: ${s}`);
  }
});

test('slug needs no URL encoding - it survives a round trip unchanged', () => {
  for (let i = 0; i < 200; i += 1) {
    const s = generateVerifySlug();
    assert.equal(encodeURIComponent(s), s, `slug required encoding: ${s}`);
    assert.equal(new URL(`https://x.test/verify/${s}`).pathname, `/verify/${s}`);
  }
});

test('the old base64url shape would have failed these guards', () => {
  // Documents the defect: the exact slug from the failed phone scan.
  const old = '-ot6njmwjgsq_4rz';
  assert.ok(!VERIFY_SLUG_PATTERN.test(old), 'the failing slug must not satisfy the new contract');
  assert.ok(old.startsWith('-'));
});

test('alphabet coverage is broad and slugs do not repeat', () => {
  const seen = new Set();
  const chars = new Set();
  for (let i = 0; i < 500; i += 1) {
    const s = generateVerifySlug();
    seen.add(s);
    for (const ch of s) chars.add(ch);
  }
  assert.equal(seen.size, 500, 'duplicate slug generated');
  assert.ok(chars.size >= 30, `alphabet coverage too narrow: ${chars.size}`);
});

test('uses crypto.getRandomValues, never Math.random', () => {
  const src = readFileSync(new URL('./slug.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(code.includes('crypto.getRandomValues'));
  assert.ok(!/Math\s*\.\s*random/.test(code));
});
