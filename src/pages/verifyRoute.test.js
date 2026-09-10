/**
 * M11 phone-scan defect regression — /verify routing and slug survival.
 *
 * Asserts against the REAL App.jsx route table and the REAL renderer, so a
 * future edit that drops the bare `/verify` route (sending a truncated link
 * back to the generic "Scroll Not Found" catch-all) fails here.
 *
 * Run: node --test src/pages/verifyRoute.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { verificationUrl, renderCredential } from '../../worker/credential/render.js';

const APP = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const VERIFY = readFileSync(new URL('./Verify.jsx', import.meta.url), 'utf8');

/* ------------------------------------------------------------ route table -- */

test('both /verify/:slug and bare /verify are routed', () => {
  assert.match(APP, /path="verify\/:slug"\s+element=\{<Verify\s*\/>\}/, 'slug route missing');
  assert.match(APP, /path="verify"\s+element=\{<Verify\s*\/>\}/, 'bare /verify route missing');
});

test('REGRESSION: /verify must not fall through to the Scroll Not Found catch-all', () => {
  // The catch-all still exists for genuinely unknown paths...
  assert.match(APP, /path="\*"/);
  assert.match(APP, /404 - Scroll Not Found/);
  // ...but the verify routes are declared before it, so /verify never reaches it.
  const verifyIdx = APP.indexOf('path="verify"');
  const catchAllIdx = APP.indexOf('path="*"');
  assert.ok(verifyIdx > -1 && catchAllIdx > -1);
  assert.ok(verifyIdx < catchAllIdx, '/verify must be declared before the catch-all');
});

/* -------------------------------------------------------- missing-slug UX -- */

test('a slug-less verification link gets verification-specific copy', () => {
  assert.match(VERIFY, /Verification Link Incomplete/);
  assert.match(VERIFY, /missing its credential identifier/);
});

test('REGRESSION: the missing-slug state is not the red "Verification Failed" error', () => {
  // It must be its own branch, keyed on `incomplete`, ahead of the error branch.
  assert.match(VERIFY, /setIncomplete\(true\)/);
  const incompleteIdx = VERIFY.indexOf('incomplete ? (');
  const errorIdx = VERIFY.indexOf('error ? (');
  assert.ok(incompleteIdx > -1, 'no incomplete branch');
  assert.ok(incompleteIdx < errorIdx, 'incomplete must be checked before the error state');
  assert.ok(!/No verification code provided/.test(VERIFY), 'old generic copy still present');
});

test('the missing-slug page never says "Scroll"', () => {
  const block = VERIFY.slice(VERIFY.indexOf('incomplete ? ('), VERIFY.indexOf('error ? ('));
  assert.ok(!/scroll/i.test(block), 'verification copy must not mention scrolls');
});

/* ----------------------------------------------- slug survives to the URL -- */

const BASE = { fullName: 'Test Minister', credentialNumber: 'BM-ABCD1234', approvedAt: '2026-03-01T00:00:00.000Z', siteUrl: 'https://preview.test' };

test('the full slug survives into the verification URL', () => {
  for (const slug of ['k3d9wq2p7fa1m8zv', 'abc123', '0000000000000000']) {
    assert.equal(verificationUrl({ siteUrl: BASE.siteUrl, verifySlug: slug }), `https://preview.test/verify/${slug}`);
  }
});

test('REGRESSION: legacy slugs with - and _ still render completely (never truncated at /verify/)', () => {
  // Newly issued slugs are alphanumeric, but any slug already in the wild must
  // still render in full - the URL must never stop at "/verify/".
  for (const slug of ['-ot6njmwjgsq_4rz', '_leading', 'trailing-', 'a-b_c-d']) {
    const url = verificationUrl({ siteUrl: BASE.siteUrl, verifySlug: slug });
    assert.equal(url, `https://preview.test/verify/${slug}`);
    assert.ok(url.endsWith(slug), `URL lost the slug: ${url}`);
    assert.notEqual(url, 'https://preview.test/verify/');

    const html = renderCredential({ ...BASE, verifySlug: slug });
    assert.ok(html.includes(url), `credential lost the full URL for slug ${slug}`);
    assert.ok(!html.includes('>https://preview.test/verify/<'), 'visible URL truncated at /verify/');
  }
});

test('the visible URL and the QR payload are built from the same string', () => {
  const html = renderCredential({ ...BASE, verifySlug: 'k3d9wq2p7fa1m8zv' });
  const url = 'https://preview.test/verify/k3d9wq2p7fa1m8zv';
  assert.ok(html.includes(`<span class="url">${url}</span>`), 'visible text wrong');
  assert.ok(html.includes(`for credential BM-ABCD1234`), 'QR label wrong');
  // exactly one verification URL appears in the document
  assert.equal((html.match(/https:\/\/preview\.test\/verify\//g) || []).length, 1);
});
