/**
 * M11 Phase 4 — pure credential renderer.
 *
 * Run: node --test worker/credential/render.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode/lib/core/qrcode.js';
import { renderCredential, verificationUrl } from './render.js';

const RECORD = Object.freeze({
  fullName: 'Jordan Alexis Rivers',
  credentialNumber: 'BM-7K2QX9AZ',
  approvedAt: '2026-03-01T10:00:00.000Z',
  issuedAt: '2026-03-01T10:00:00.000Z',
  credentialVersion: 1,
  verifySlug: 'a1b2c3d4e5f6',
  siteUrl: 'https://blockchainministries.io',
});

const EXPECTED_URL = 'https://blockchainministries.io/verify/a1b2c3d4e5f6';

/**
 * Parse the rendered inline SVG back into a QR module matrix.
 *
 * The renderer emits run-length <rect x y width height="1"> inside a viewBox of
 * `dim = size + 2*QUIET_ZONE`, so the matrix can be reconstructed exactly and
 * compared against what the encoder produces for a given payload. This is how
 * QR correctness is proven — not by asserting that "<svg" appears.
 */
function matrixFromSvg(html) {
  const svg = /<svg class="qr"[\s\S]*?<\/svg>/.exec(html);
  assert.ok(svg, 'no QR svg found in document');
  const body = svg[0];

  const vb = /viewBox="0 0 (\d+) (\d+)"/.exec(body);
  assert.ok(vb, 'QR svg has no viewBox');
  const dim = Number(vb[1]);
  assert.equal(Number(vb[2]), dim, 'QR must be square');

  const QUIET = 4;
  const size = dim - QUIET * 2;
  const grid = new Uint8Array(size * size);

  const rect = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="1"\/>/g;
  let m;
  let painted = 0;
  while ((m = rect.exec(body)) !== null) {
    const x = Number(m[1]) - QUIET;
    const y = Number(m[2]) - QUIET;
    const w = Number(m[3]);
    for (let i = 0; i < w; i += 1) {
      grid[y * size + (x + i)] = 1;
      painted += 1;
    }
  }
  assert.ok(painted > 0, 'QR svg painted no modules');
  return { size, grid };
}

/** The encoder's own matrix for a payload — the reference to compare against. */
function referenceMatrix(payload) {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  return { size: qr.modules.size, grid: Uint8Array.from(qr.modules.data) };
}

const joined = (m) => `${m.size}:${Array.from(m.grid).join('')}`;

/** Visible text only — tags, style, script and metadata stripped. */
function visibleText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<head[\s\S]*?<\/head>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

/* ------------------------------------------------------------- determinism -- */

test('1. same input renders byte-identically twice', () => {
  const a = renderCredential({ ...RECORD });
  const b = renderCredential({ ...RECORD });
  assert.equal(a, b);
  assert.equal(a.length, b.length);
});

test('renderer is pure — does not mutate its input', () => {
  const input = { ...RECORD };
  const snapshot = JSON.stringify(input);
  renderCredential(input);
  assert.equal(JSON.stringify(input), snapshot);
});

/* ------------------------------------------------------------------ content -- */

test('2. ratified Q4 body text is present verbatim', () => {
  const text = visibleText(renderCredential(RECORD));
  assert.ok(
    text.includes(
      'Blockchain Ministries hereby recognizes Jordan Alexis Rivers as an Ordained Minister, having completed and received approval through the ministry’s ordination process.',
    ),
    'first ratified sentence missing or altered',
  );
  assert.ok(
    text.includes(
      'This credential affirms their ordination through Blockchain Ministries and remains valid unless formally revoked by the ministry.',
    ),
    'second ratified sentence missing or altered',
  );
});

test('3 & 4. title is "Certificate of Ordination", designation is "Ordained Minister"', () => {
  const html = renderCredential(RECORD);
  assert.match(html, /<h1>Certificate of Ordination<\/h1>/);
  assert.ok(visibleText(html).includes('Ordained Minister'));
});

test('5 & 7. full name and credential number render', () => {
  const text = visibleText(renderCredential(RECORD));
  assert.ok(text.includes('Jordan Alexis Rivers'));
  assert.ok(text.includes('BM-7K2QX9AZ'));
  assert.ok(text.includes('Credential No.'));
});

test('required visible fields and footer are all present', () => {
  const text = visibleText(renderCredential(RECORD));
  for (const needle of [
    'Jordan Alexis Rivers',
    'Date of Ordination',
    'BM-7K2QX9AZ',
    EXPECTED_URL,
    'Blockchain Ministries',
    'Authorized Ministry Representative',
  ]) {
    assert.ok(text.includes(needle), `missing required content: ${needle}`);
  }
});

/* ------------------------------------------------------------------ escaping -- */

test('6. hostile fullName is HTML-escaped, never raw markup', () => {
  const html = renderCredential({ ...RECORD, fullName: '<script>alert(1)</script>' });
  assert.ok(!html.includes('<script>alert(1)</script>'), 'raw script tag reached the document');
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'), 'not escaped as visible text');
  // and no stray executable script anywhere in the document
  assert.equal(html.match(/<script/gi), null);
});

test('6b. quotes, ampersands and attribute breakouts are escaped', () => {
  const html = renderCredential({
    ...RECORD,
    fullName: `A" onload="alert(1)` + ` & <b>B</b> '`,
    credentialNumber: 'BM-<X>&"1',
  });
  assert.ok(!html.includes('onload="alert(1)"'), 'attribute breakout possible');
  assert.ok(!/<b>B<\/b>/.test(html), 'raw tag from user value reached the document');
  assert.ok(html.includes('&amp;'), 'ampersand not escaped');
  assert.ok(html.includes('&quot;'), 'double quote not escaped');
  assert.ok(html.includes('&#39;'), 'single quote not escaped');
  assert.ok(html.includes('BM-&lt;X&gt;&amp;&quot;1'), 'credential number not escaped');
});

test('6c. a hostile slug cannot break out of the verification markup', () => {
  const html = renderCredential({ ...RECORD, verifySlug: 'x"><img src=y onerror=alert(1)>' });
  assert.equal(html.match(/<img/gi), null, 'injected img tag rendered');
  assert.ok(html.includes('&quot;&gt;&lt;img'), 'slug not escaped in the visible URL');
});

/* ---------------------------------------------------------------- date rules -- */

test('8. Date of Ordination uses approvedAt', () => {
  const text = visibleText(renderCredential(RECORD));
  assert.ok(text.includes('Date of Ordination'));
  assert.ok(text.includes('1 March 2026'), 'approvedAt not rendered as the ordination date');
});

test('9. a reissue moves issuedAt but NOT the displayed Date of Ordination', () => {
  const reissued = renderCredential({
    ...RECORD,
    issuedAt: '2026-11-20T09:00:00.000Z', // moved
    credentialVersion: 3, // reissued twice
  });
  const text = visibleText(reissued);
  assert.ok(text.includes('1 March 2026'), 'original approval date must remain');
  assert.ok(!text.includes('20 November 2026'), 'issuedAt must not be displayed');
  assert.ok(!/reissued/i.test(text), 'no unauthorized "reissued on" field');
  // and the visible certificate face is byte-identical to the original render
  assert.equal(visibleText(renderCredential(RECORD)), text);
});

test('date formatting is UTC and locale-independent', () => {
  const html = renderCredential({ ...RECORD, approvedAt: '2026-01-05T23:30:00.000Z' });
  assert.ok(visibleText(html).includes('5 January 2026'));
});

/* --------------------------------------------------------- verification URL -- */

test('10. visible verification URL is exactly ${siteUrl}/verify/${verifySlug}', () => {
  assert.equal(verificationUrl(RECORD), EXPECTED_URL);
  assert.ok(visibleText(renderCredential(RECORD)).includes(EXPECTED_URL));
});

test('12. trailing slashes on siteUrl are normalized — never a double slash', () => {
  for (const siteUrl of ['https://blockchainministries.io/', 'https://blockchainministries.io///']) {
    const html = renderCredential({ ...RECORD, siteUrl });
    assert.equal(verificationUrl({ ...RECORD, siteUrl }), EXPECTED_URL);
    assert.ok(visibleText(html).includes(EXPECTED_URL));
    assert.ok(!html.includes('.io//verify'), `double slash produced for ${siteUrl}`);
  }
});

test('13. the obsolete /verify?id= form appears nowhere', () => {
  const html = renderCredential(RECORD);
  assert.ok(!html.includes('/verify?id='));
  assert.ok(!/verify\?/.test(html));
});

/* ------------------------------------------------------------------ QR proof -- */

test('11. QR encodes EXACTLY the verification URL (matrix compared to the encoder)', () => {
  const html = renderCredential(RECORD);
  const rendered = matrixFromSvg(html);
  const expected = referenceMatrix(EXPECTED_URL);

  assert.equal(rendered.size, expected.size, 'QR module count differs from the reference');
  assert.equal(
    joined(rendered),
    joined(expected),
    'rendered QR matrix does not match the encoder output for the expected URL',
  );
});

test('11b. the QR matrix is payload-sensitive — a different slug yields a different QR', () => {
  const a = matrixFromSvg(renderCredential(RECORD));
  const b = matrixFromSvg(renderCredential({ ...RECORD, verifySlug: 'zzzzzzzzzzzz' }));
  assert.notEqual(joined(a), joined(b), 'QR did not change with the payload — it may be a constant');

  // ...and the changed one matches the reference for its own URL.
  assert.equal(
    joined(b),
    joined(referenceMatrix('https://blockchainministries.io/verify/zzzzzzzzzzzz')),
  );
});

test('11c. QR carries an accessible name', () => {
  const html = renderCredential(RECORD);
  assert.match(html, /<svg class="qr"[^>]*role="img"[^>]*aria-labelledby="qr-title"/);
  assert.match(html, /<title id="qr-title">[^<]*BM-7K2QX9AZ[^<]*<\/title>/);
});

/* ------------------------------------------------------ forbidden content -- */

test('14 & 15. no internal or private fields leak into the document', () => {
  // Every field the renderer must never see or emit, fed in anyway.
  const html = renderCredential({
    ...RECORD,
    email: 'member@example.test',
    user_id: 'u-secret-123',
    approved_by: 'u-admin-999',
    revoked_by: 'u-admin-999',
    revocation_reason: 'internal conduct note',
    application_json: '{"reason":"private calling text","experience":"private"}',
    credential_r2_key: 'credentials/o-1.pdf',
    nft_token_id: 'NFT-ABC',
    tx_hash: 'TX-DEF',
  });

  for (const secret of [
    'member@example.test', 'u-secret-123', 'u-admin-999',
    'internal conduct note', 'private calling text',
    'credentials/o-1.pdf', 'NFT-ABC', 'TX-DEF',
    'revocation_reason', 'approved_by', 'application_json', 'credential_r2_key',
  ]) {
    assert.ok(!html.includes(secret), `internal value leaked into the document: ${secret}`);
  }
});

test('16, 17 & 18. no marriage, jurisdictional, signature, seal, or chain language', () => {
  const html = renderCredential(RECORD).toLowerCase();
  for (const forbidden of [
    'marriage', 'marry', 'wedding', 'officiant', 'solemnize',
    'jurisdiction', 'legally recognized', 'государ', 'state of', 'licensed by',
    'signature', 'signed by', 'seal', 'notary',
    'xrpl', 'nft', 'blockchain ledger', 'token', 'r2', 'bucket',
  ]) {
    assert.ok(!html.includes(forbidden), `forbidden language present: ${forbidden}`);
  }
  // The one authorized attribution line, and nothing more.
  assert.ok(renderCredential(RECORD).includes('Authorized Ministry Representative'));
});

/* --------------------------------------------------------- document shape -- */

test('19. document contains print CSS (@media print and @page)', () => {
  const html = renderCredential(RECORD);
  assert.ok(html.includes('@media print'), 'missing @media print');
  assert.ok(html.includes('@page'), 'missing @page');
  assert.ok(html.includes('page-break-inside: avoid'), 'no page-break protection');
  // No forced paper size — forcing letter clips A4 and vice versa.
  assert.ok(!/@page\s*{[^}]*size:/.test(html), '@page must not force a paper size');
});

test('20. no external asset dependencies of any kind', () => {
  const html = renderCredential(RECORD);
  assert.equal(html.match(/https?:\/\/(?!blockchainministries\.io|www\.w3\.org)/g), null,
    'document references an external origin');
  assert.equal(html.match(/<link\b/gi), null, 'external stylesheet linked');
  assert.equal(html.match(/<script\b/gi), null, 'script tag present');
  assert.equal(html.match(/<img\b/gi), null, 'external image present');
  assert.equal(html.match(/@import/gi), null, 'css @import present');
  assert.equal(html.match(/url\(/gi), null, 'css url() reference present');
  // The only absolute URLs are our own verification link (and the SVG namespace).
  assert.ok(html.includes(EXPECTED_URL));
});

test('is a complete, well-formed HTML document', () => {
  const html = renderCredential(RECORD);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta charset="utf-8">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(html, /<title>Certificate of Ordination — Jordan Alexis Rivers — Blockchain Ministries<\/title>/);
  assert.ok(html.includes('<main class="certificate">'));
  assert.ok(html.trimEnd().endsWith('</html>'));
  assert.equal((html.match(/<html/g) || []).length, 1);
});

/* -------------------------------------------------------------- input guard -- */

test('missing required input throws rather than rendering a blank certificate', () => {
  for (const key of ['fullName', 'credentialNumber', 'approvedAt', 'verifySlug', 'siteUrl']) {
    const bad = { ...RECORD };
    delete bad[key];
    assert.throws(() => renderCredential(bad), new RegExp(`missing ${key}`), `${key} not required`);
  }
  assert.throws(() => renderCredential({ ...RECORD, approvedAt: 'not-a-date' }), /Invalid date/);
});

test('renders without the optional metadata fields', () => {
  const minimal = {
    fullName: 'Pat Q. Minister',
    credentialNumber: 'BM-ABCD1234',
    approvedAt: '2026-06-15T00:00:00.000Z',
    verifySlug: 'slug123',
    siteUrl: 'https://blockchainministries.io',
  };
  const html = renderCredential(minimal);
  assert.ok(visibleText(html).includes('15 June 2026'));
  assert.ok(!html.includes('credential-version'));
  assert.ok(!html.includes('credential-issued-at'));
});
