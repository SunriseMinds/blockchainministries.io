/**
 * M12 — public site integrity: no dead downloads, no developer copy.
 *
 * Run: node --test src/pages/publicIntegrity.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const SCROLLS = readFileSync(new URL('./Scrolls.jsx', import.meta.url), 'utf8');
const TIERS = readFileSync(new URL('./Donate/components/StripeTiers.jsx', import.meta.url), 'utf8');
const CONTACT = readFileSync(new URL('./Contact.jsx', import.meta.url), 'utf8');
const DONATE = readFileSync(new URL('./Donate.jsx', import.meta.url), 'utf8');

/**
 * Comment-stripped source. A file that EXPLAINS why PayPal was removed
 * legitimately contains the word "PayPal"; only what ships to a visitor
 * counts, so assertions about removed surfaces run against code alone.
 */
const strip = (src) => src
  .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

const DONATE_CODE = strip(DONATE);
const TIERS_CODE = strip(TIERS);

/* ------------------------------------------------------------- scrolls -- */

test('REGRESSION: no scroll card renders a download href', () => {
  // The six /scrolls/*.pdf files do not exist; every one returned 404 live.
  assert.ok(!/href=\{scroll\.link\}/.test(SCROLLS), 'download href must not be rendered');
  assert.ok(!/Download Scroll/.test(SCROLLS), 'the misleading download label must be gone');
});

test('any scroll document still advertised must exist as a real static asset', () => {
  // If a future change re-introduces a link, it must point at a shipped file.
  const hrefs = [...SCROLLS.matchAll(/href="(\/scrolls\/[^"]+)"/g)].map(m => m[1]);
  for (const h of hrefs) {
    const asset = new URL(`../../public${h}`, import.meta.url);
    assert.ok(existsSync(asset), `advertised download has no backing file: ${h}`);
  }
});

test('scroll cards state availability truthfully and point at the request form', () => {
  assert.ok(SCROLLS.includes('Preparing for Release'));
  assert.ok(SCROLLS.includes('Request a copy using the form below.'));
  assert.match(SCROLLS, /disabled/, 'the action must be genuinely disabled');
  assert.match(SCROLLS, /aria-disabled="true"/);
});

test('the scroll request form is still offered', () => {
  assert.ok(SCROLLS.includes('ContactScrollForm'), 'members must still be able to request scrolls');
});

/* ------------------------------------------------------------- contact -- */

test('REGRESSION: the contact address can break rather than widen the page', () => {
  // Measured: one unbreakable 256px token in a 256px row whose icon takes the
  // first 64px — it landed at x=352 on a 320px screen, 32px of page overflow.
  const span = (CONTACT.match(/<span className="([^"]*)">contact@blockchainministries\.io<\/span>/) || [])[1];
  assert.ok(span, 'the contact address span must still exist');
  assert.match(span, /\bbreak-words\b/, 'the address must be allowed to break when it cannot fit');
  assert.match(span, /\bmin-w-0\b/, 'a flex item needs min-w-0 to shrink below its content');
  // break-words only breaks when necessary, so wider screens are unaffected.
  assert.ok(!/\bbreak-all\b/.test(span), 'break-all would split the address even when it fits');
});

test('the contact address itself is unchanged and still shown', () => {
  assert.ok(CONTACT.includes('contact@blockchainministries.io'), 'the address must be displayed verbatim');
  assert.equal((CONTACT.match(/contact@blockchainministries\.io/g) || []).length, 1);
  // Not hidden at any width, and no page-level clipping was used to hide the
  // symptom instead of fixing it.
  const span = (CONTACT.match(/<span className="([^"]*)">contact@blockchainministries\.io<\/span>/) || [])[1] || '';
  assert.ok(!/\bhidden\b/.test(span), 'the address must never be hidden');
  assert.ok(!/overflow-x-hidden|overflow-x-clip/.test(CONTACT), 'no page-level overflow bandage');
});

/* -------------------------------------------------------------- donate -- */

test('REGRESSION: no developer/configuration copy is shown to visitors', () => {
  for (const leak of [
    'price IDs are placeholders',
    'Stripe dashboard',
    'Replace with your actual Price ID',
    'You must create products',
  ]) {
    // The tier objects still carry placeholder ids in code comments; what must
    // never appear is instructional copy inside RENDERED text.
    const rendered = TIERS.split('return (')[1] || '';
    assert.ok(!rendered.includes(leak), `developer copy rendered to visitors: ${leak}`);
  }
});

test('M14.1: availability comes from the server, not a mirrored price list', () => {
  // The frontend no longer holds ANY price id, so there is nothing left to
  // drift out of sync with the server catalogue.
  for (const id of ['price_supporter_tier', 'price_guardian_tier', 'price_archangel_tier']) {
    assert.ok(!TIERS.includes(id), `the frontend must not name a Stripe price: ${id}`);
    assert.ok(!DONATE.includes(id));
  }
  assert.ok(!/price_id/.test(TIERS), 'no price_id may cross the wire from the browser');
  assert.match(TIERS, /tier: tier\.key/, 'the browser names a tier, never a price');
  assert.match(TIERS, /tier\.available/, 'availability is read from the server config');
  assert.match(DONATE, /api\.get\('\/donations\/config'\)/, 'the page must load the server catalogue');
});

test('tier actions stay disabled and truthful while giving is not configured', () => {
  // Post-M14: the gate STRENGTHENED from `tier.available` (a real Stripe
  // Price exists) to `canCheckout(tier)` (a real Price AND a configured
  // Stripe account). A Price id alone could otherwise enable a button the
  // server refuses. Same guarantee, strictly harder to satisfy.
  assert.match(TIERS, /disabled=\{!canCheckout\(tier\)\}/);
  assert.match(TIERS, /aria-disabled=\{!canCheckout\(tier\)\}/);
  assert.match(TIERS, /stripeReady && tier\.available/, 'both conditions must be required');
  assert.ok(TIERS.includes("'Coming Soon'"));
  assert.ok(TIERS.includes('not yet open for enrolment'));
  assert.ok(TIERS.includes('contact the ministry'));
});

test('the checkout code path is preserved for when Stripe is configured', () => {
  assert.ok(TIERS.includes('handleCheckout'), 'checkout handler must remain');
  assert.ok(TIERS.includes("mode: 'subscription'"), 'subscription call must remain');
  assert.ok(TIERS.includes('/donations/stripe/checkout'), 'endpoint must remain');
});

test('M14.1: tiers promise no capability the ministry has not built', () => {
  // Ratified: tiers are monthly support levels. The old cards guaranteed
  // monthly EFT rewards, scroll access, priority support and DAO voting —
  // none implemented, all contradicting Terms §5.
  for (const promise of ['EFT Reward', 'DAO Voting', 'Priority Support', 'Scroll Access', 'Exclusive Previews', 'Community Badge', 'Direct Council']) {
    assert.ok(!TIERS_CODE.includes(promise), `unimplemented benefit promised: ${promise}`);
  }
  assert.ok(TIERS_CODE.includes('Ongoing monthly support'), 'tiers must describe what they actually are');
  // Tier identity now arrives from the server catalogue, so the component
  // carries only the three keys it styles — the names themselves are asserted
  // against worker/config/tiers.js in worker/routes/payments.test.js.
  for (const key of ['supporter', 'guardian', 'archangel']) {
    assert.ok(TIERS_CODE.includes(key), `tier ${key} must still be presentable`);
  }
  assert.match(TIERS_CODE, /tier\.amount_cents \/ 100/, 'the displayed price comes from the server');

  // M14 checkpoint — the owner has NOT approved "Supporter/Guardian/Archangel"
  // as ministry terminology, so no unapproved name may be rendered as though
  // it were. The level is identified by its monthly amount instead; the keys
  // above survive only as internal style/icon lookups, never as visible copy.
  assert.ok(!TIERS_CODE.includes('{tier.name}'), 'an unapproved tier name must not be displayed');
  for (const name of ['Supporter', 'Guardian', 'Archangel']) {
    assert.ok(!TIERS_CODE.includes(name), `unapproved branding rendered: ${name}`);
  }
  assert.match(TIERS_CODE, /names for these levels have not been settled/,
    'the page must say plainly that the naming is unsettled');
});

test('M14.1: the Donate page makes no tax or charitable claim', () => {
  for (const claim of ['tax deductible', 'tax-deductible', '501(c)', 'tax exempt', 'tax-exempt', 'charitable contribution', 'write-off']) {
    assert.ok(!DONATE.toLowerCase().includes(claim.toLowerCase()), `tax claim present: ${claim}`);
    assert.ok(!TIERS.toLowerCase().includes(claim.toLowerCase()));
  }
  // And it repeats the Terms principle rather than contradicting it.
  assert.ok(DONATE.includes('not a purchase of goods or services'));
});

test('M14.5: the DELETED payment surfaces stay deleted, and PayPal returns only with a backend', () => {
  // M14.1 removed PayPal and the XRP QR because neither had any server behind
  // it. M14.4 and M14.5 built those backends, so both rails are legitimately
  // back — but the specific components that lied are not, and neither is the
  // hard-coded address or the sitewide SDK provider.
  for (const gone of ['PaypalDonate', 'CryptoQRCode', 'cryptoAddresses', 'rhbwjNN6U6Zy6mzpsjWbnEg5RBy96TgiLw']) {
    assert.ok(!DONATE_CODE.includes(gone), `removed payment surface still referenced: ${gone}`);
  }
  assert.ok(!existsSync(new URL('./Donate/components/PaypalDonate.jsx', import.meta.url)));
  assert.ok(!existsSync(new URL('./Donate/components/CryptoQRCode.jsx', import.meta.url)));
  assert.ok(!existsSync(new URL('./Donate/components/StripeDonateForm.jsx', import.meta.url)));
  assert.ok(!existsSync(new URL('./Donate/components/checkoutAvailability.js', import.meta.url)));

  // The app root still does not wrap every page in PayPal's SDK provider.
  const MAIN = strip(readFileSync(new URL('./../main.jsx', import.meta.url), 'utf8'));
  assert.ok(!MAIN.includes('PayPal'), 'the sitewide PayPal script provider must stay gone');
  assert.ok(!MAIN.includes('paypal.com'), 'no page may load PayPal outside Donate');

  // PayPal is reached only through the M14.5 component, which is server-driven.
  assert.ok(DONATE_CODE.includes('PayPalGive'), 'PayPal must be offered as a first-class rail');
  const GIVE = strip(readFileSync(new URL('./Donate/components/PayPalGive.jsx', import.meta.url), 'utf8'));
  assert.match(GIVE, /donations\/paypal\/orders/, 'the order must be created by the server');
  assert.match(GIVE, /\/capture/, 'the capture must be performed by the server');
  // The legacy failure mode: a client-side "success" with nothing behind it.
  for (const overclaim of ['Payment successful', 'Donation successful', 'Thank you for your payment']) {
    assert.ok(!GIVE.includes(overclaim), `browser state announced as payment: ${overclaim}`);
  }
});

test('M14.1: checkout return states never assert that money moved', () => {
  assert.match(DONATE, /checkout === 'success'/);
  assert.match(DONATE, /checkout === 'cancelled'/);
  assert.ok(DONATE.includes('Payment confirmation may take a moment to appear'),
    'success copy must defer to the webhook, not the query parameter');
  assert.ok(DONATE.includes('No completed checkout was recorded'));
  // No claim of a completed payment, and no Stripe internals leaked.
  for (const overclaim of ['Payment successful', 'Payment received', 'Thank you for your payment', 'session_id', 'payment_intent']) {
    assert.ok(!DONATE.includes(overclaim), `overclaims or leaks: ${overclaim}`);
  }
});

test('M14.1: Stripe Elements is not revived', () => {
  for (const src of [TIERS, DONATE, readFileSync(new URL('./Donate/components/StripeOneTime.jsx', import.meta.url), 'utf8')]) {
    for (const banned of ['@stripe/react-stripe-js', '@stripe/stripe-js', 'loadStripe', 'PaymentElement', 'VITE_STRIPE_PUBLISHABLE_KEY']) {
      assert.ok(!src.includes(banned), `Elements dependency reintroduced: ${banned}`);
    }
  }
});

test('M12 configures no Stripe credentials', () => {
  assert.ok(!/sk_live|sk_test|STRIPE_SECRET/.test(TIERS));
});
