/**
 * Ordination credential renderer — PURE.
 *
 * record -> complete HTML document string. Nothing else.
 *
 * Purity contract (M11 Phase 4), relied on by the tests and by Phase 5:
 *   * no database access, no network access, no filesystem
 *   * no clock — every date comes from the record, never Date.now()
 *   * no randomness — the QR matrix is a deterministic function of the payload
 *   * no mutation of its input, no module-level state, no side effects
 *   * same input -> byte-identical output, always
 *
 * It is deliberately NOT responsible for authorization or for deciding whether
 * a credential is still valid. It renders a credential that the caller has
 * already established is issued, un-revoked, and the requester's to see. Those
 * decisions live in the repository and route layers (Phase 5/6).
 *
 * Content is fixed by the ratified policy contract in
 * docs/M11_CREDENTIAL_POLICY.md (Q3, Q4, Q5). Do not paraphrase the body text.
 */
import QRCode from 'qrcode/lib/core/qrcode.js';

/* ----------------------------------------------------------------- escaping -- */

/**
 * Escape every character with meaning in HTML text or an attribute value.
 *
 * `fullName` is member-supplied free text rendered into a document served from
 * our own origin — this is the one genuine injection vector in M11, so
 * escaping is applied to EVERY interpolated value without exception, not just
 * the ones that look risky today.
 */
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* --------------------------------------------------------------------- dates -- */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * ISO-8601 -> "9 September 2026".
 *
 * Deliberately hand-formatted in UTC rather than via toLocaleDateString: the
 * Intl output depends on the runtime's ICU build and the host locale, which
 * would make the document non-deterministic between a Worker and a developer's
 * machine. UTC getters also make it independent of server timezone.
 */
function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new TypeError(`Invalid date: ${iso}`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/* ------------------------------------------------------------ verification -- */

/**
 * Build the one canonical verification URL: `${siteUrl}/verify/${verifySlug}`.
 *
 * Trailing slashes on siteUrl are stripped so the join can never produce
 * `//verify`. The obsolete `/verify?id=` query form (still present in the
 * orphaned IDGeneratorPanel component) is never produced here — the live route
 * is a path parameter.
 */
export function verificationUrl({ siteUrl, verifySlug }) {
  const base = String(siteUrl).replace(/\/+$/, '');
  return `${base}/verify/${verifySlug}`;
}

/* ------------------------------------------------------------------- qr code -- */

/** Standard quiet zone, in modules. Required for reliable scanning in print. */
const QUIET_ZONE = 4;

/**
 * Inline SVG QR for `payload`.
 *
 * The ENCODER is the already-installed `qrcode` package (deep-imported at
 * `lib/core/qrcode.js`, which is pure JS — no fs/stream/Buffer/pngjs/yargs, so
 * it bundles for workerd). That is the correctness-critical part: version
 * selection, Reed-Solomon error correction, and mask-pattern scoring.
 *
 * The PRESENTATION is local, because the package's own svg-tag renderer emits
 * a bare <svg> with no accessible name and no way to add one without string
 * surgery. Rendering here lets the QR carry a <title> and aria-labelledby, and
 * emits integer-coordinate <rect> runs — which are also trivially parsed back
 * into a matrix, so tests can prove the rendered SVG encodes exactly the
 * expected URL rather than merely asserting that "<svg" appears.
 *
 * Horizontally adjacent dark modules are merged into one rect (run-length), so
 * the markup stays a few KB rather than one element per module.
 */
function qrSvg(payload, { titleId, label }) {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const dim = size + QUIET_ZONE * 2;

  let rects = '';
  for (let row = 0; row < size; row += 1) {
    let col = 0;
    while (col < size) {
      if (!data[row * size + col]) {
        col += 1;
        continue;
      }
      let run = 1;
      while (col + run < size && data[row * size + col + run]) run += 1;
      rects += `<rect x="${col + QUIET_ZONE}" y="${row + QUIET_ZONE}" width="${run}" height="1"/>`;
      col += run;
    }
  }

  return (
    `<svg class="qr" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dim} ${dim}"` +
    ` role="img" aria-labelledby="${titleId}" shape-rendering="crispEdges">` +
    `<title id="${titleId}">${esc(label)}</title>` +
    `<rect width="${dim}" height="${dim}" fill="#ffffff"/>` +
    `<g fill="#000000">${rects}</g>` +
    `</svg>`
  );
}

/* ------------------------------------------------------------------- styles -- */

/**
 * Print geometry note: no `size:` is declared on @page ON PURPOSE. Forcing
 * `letter` clips on A4 (210mm wide vs 215.9mm), and forcing `a4` wastes a
 * margin on Letter. Instead the page gets a 15mm margin and the certificate is
 * capped at 180mm — which fits inside BOTH A4 (210 - 30 = 180mm) and US Letter
 * (215.9 - 30 = 185.9mm) printable widths, so neither paper size can clip.
 *
 * Nothing carries meaning through colour or a background fill, so the document
 * is fully legible in grayscale and prints correctly even when a browser
 * suppresses background graphics.
 */
const STYLES = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 24px 16px;
  background: #f4f4f2;
  color: #14171c;
  font-family: Georgia, 'Times New Roman', 'Liberation Serif', serif;
  line-height: 1.55;
}
.certificate {
  max-width: 180mm;
  margin: 0 auto;
  padding: 18mm 16mm 14mm;
  background: #ffffff;
  border: 1px solid #14171c;
  outline: 3px double #14171c;
  outline-offset: 5mm;
}
header { text-align: center; }
.org {
  margin: 0;
  font-size: 12pt;
  letter-spacing: 0.28em;
  text-transform: uppercase;
}
.rule { width: 42mm; height: 0; margin: 5mm auto; border-top: 1px solid #14171c; }
h1 {
  margin: 0;
  font-size: 26pt;
  font-weight: normal;
  letter-spacing: 0.04em;
}
.designation {
  margin: 3mm 0 0;
  font-size: 11pt;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
.recipient { text-align: center; margin: 10mm 0 0; }
.recipient .label {
  margin: 0 0 3mm;
  font-size: 10pt;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.name {
  margin: 0;
  padding-bottom: 3mm;
  font-size: 22pt;
  border-bottom: 1px solid #14171c;
  overflow-wrap: anywhere;
}
.recital { margin: 9mm 0 0; font-size: 11.5pt; text-align: justify; }
.recital p { margin: 0 0 4mm; }
.details {
  display: flex;
  flex-wrap: wrap;
  gap: 8mm;
  align-items: flex-start;
  justify-content: space-between;
  margin: 9mm 0 0;
  padding-top: 6mm;
  border-top: 1px solid #9aa0a6;
}
dl { margin: 0; flex: 1 1 90mm; min-width: 70mm; }
dt {
  margin: 0 0 1mm;
  font-size: 9pt;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
dd { margin: 0 0 5mm; font-size: 12pt; }
dd.mono { font-family: 'Courier New', Courier, monospace; letter-spacing: 0.06em; }
.verification { flex: 0 0 auto; margin: 0; text-align: center; }
.qr { display: block; width: 32mm; height: 32mm; margin: 0 auto; }
figcaption { margin-top: 2mm; font-size: 8pt; max-width: 46mm; overflow-wrap: anywhere; }
figcaption .url { font-family: 'Courier New', Courier, monospace; }
footer {
  margin: 10mm 0 0;
  padding-top: 4mm;
  text-align: center;
  border-top: 1px solid #9aa0a6;
}
footer .ministry { margin: 0; font-size: 11pt; letter-spacing: 0.14em; text-transform: uppercase; }
footer .rep { margin: 6mm auto 0; padding-top: 2mm; max-width: 76mm; font-size: 10pt; border-top: 1px solid #14171c; }

@media print {
  body { padding: 0; background: #ffffff; }
  .certificate { max-width: none; margin: 0; border: none; outline: none; padding: 0; }
  .name, .recital, .details, footer { page-break-inside: avoid; break-inside: avoid; }
}
@page { margin: 15mm; }
`;

/* ------------------------------------------------------------------- render -- */

const REQUIRED = ['fullName', 'credentialNumber', 'approvedAt', 'verifySlug', 'siteUrl'];

/**
 * Render a valid, currently-available ordination credential.
 *
 * @param {object} record
 * @param {string} record.fullName          application_json.fullName, already extracted
 *                                          by the caller (Q3). The renderer never parses
 *                                          application_json, so unrelated application
 *                                          data cannot leak into the document.
 * @param {string} record.credentialNumber  e.g. "BM-7K2QX9AZ"
 * @param {string} record.approvedAt        ISO-8601. THE displayed Date of Ordination.
 * @param {string} [record.issuedAt]        ISO-8601. Metadata only — never displayed.
 * @param {number} [record.credentialVersion] Metadata only — never displayed.
 * @param {string} record.verifySlug
 * @param {string} record.siteUrl
 * @returns {string} a complete HTML document
 */
export function renderCredential(record) {
  const missing = REQUIRED.filter((k) => !record?.[k]);
  if (missing.length) throw new TypeError(`renderCredential: missing ${missing.join(', ')}`);

  const url = verificationUrl(record);
  const ordainedOn = formatDate(record.approvedAt);
  const name = esc(record.fullName);
  const number = esc(record.credentialNumber);
  const safeUrl = esc(url);

  // Metadata only. Deliberately NOT rendered as visible certificate fields:
  // policy (Q4) fixes the visible field list, and no "reissued on" field is
  // authorized. issued_at may move on reissue; the certificate face must not.
  const issuedAtMeta = record.issuedAt
    ? `\n  <meta name="credential-issued-at" content="${esc(record.issuedAt)}">`
    : '';
  const versionMeta = record.credentialVersion
    ? `\n  <meta name="credential-version" content="${esc(record.credentialVersion)}">`
    : '';

  const qr = qrSvg(url, {
    titleId: 'qr-title',
    label: `QR code linking to the public verification page for credential ${record.credentialNumber}`,
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>Certificate of Ordination — ${name} — Blockchain Ministries</title>${issuedAtMeta}${versionMeta}
  <style>${STYLES}</style>
</head>
<body>
  <main class="certificate">
    <header>
      <p class="org">Blockchain Ministries</p>
      <div class="rule"></div>
      <h1>Certificate of Ordination</h1>
      <p class="designation">Ordained Minister</p>
    </header>

    <section class="recipient">
      <p class="label">This certifies that</p>
      <p class="name">${name}</p>
    </section>

    <section class="recital">
      <p>Blockchain Ministries hereby recognizes ${name} as an Ordained Minister, having completed and received approval through the ministry’s ordination process.</p>
      <p>This credential affirms their ordination through Blockchain Ministries and remains valid unless formally revoked by the ministry.</p>
    </section>

    <section class="details">
      <dl>
        <dt>Date of Ordination</dt>
        <dd>${esc(ordainedOn)}</dd>
        <dt>Credential No.</dt>
        <dd class="mono">${number}</dd>
      </dl>
      <figure class="verification">
        ${qr}
        <figcaption>Verify this credential at<br><span class="url">${safeUrl}</span></figcaption>
      </figure>
    </section>

    <footer>
      <p class="ministry">Blockchain Ministries</p>
      <p class="rep">Authorized Ministry Representative</p>
    </footer>
  </main>
</body>
</html>
`;
}
