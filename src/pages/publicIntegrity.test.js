/**
 * M12 — public site integrity: no dead downloads, no developer copy.
 *
 * Run: node --test src/pages/publicIntegrity.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { checkoutEnabled, isPlaceholderPrice, CHECKOUT_ENABLED, PLACEHOLDER_PRICE_IDS }
  from './Donate/components/checkoutAvailability.js';

const SCROLLS = readFileSync(new URL('./Scrolls.jsx', import.meta.url), 'utf8');
const TIERS = readFileSync(new URL('./Donate/components/StripeTiers.jsx', import.meta.url), 'utf8');
const CONTACT = readFileSync(new URL('./Contact.jsx', import.meta.url), 'utf8');

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

test('checkout availability is derived from the price ids, not a loose flag', () => {
  assert.equal(CHECKOUT_ENABLED, false, 'placeholder prices must keep checkout closed');
  assert.equal(checkoutEnabled([{ priceId: 'price_supporter_tier' }]), false);
  assert.equal(checkoutEnabled([{ priceId: 'price_1RealStripeId' }]), true);
  assert.equal(checkoutEnabled([{ priceId: 'price_1Real' }, { priceId: 'price_guardian_tier' }]), false,
    'one placeholder is enough to keep it closed');
  assert.equal(checkoutEnabled([]), false);
  assert.equal(checkoutEnabled(null), false);
});

test('every placeholder id the Worker rejects is recognised here', () => {
  for (const id of ['price_supporter_tier', 'price_guardian_tier', 'price_archangel_tier']) {
    assert.ok(PLACEHOLDER_PRICE_IDS.includes(id));
    assert.equal(isPlaceholderPrice(id), true);
  }
  assert.equal(isPlaceholderPrice(''), true);
  assert.equal(isPlaceholderPrice(undefined), true);
  assert.equal(isPlaceholderPrice('price_1SomethingReal'), false);
});

test('tier actions are disabled and labelled truthfully while checkout is closed', () => {
  assert.match(TIERS, /disabled=\{!CHECKOUT_ENABLED\}/);
  assert.match(TIERS, /aria-disabled=\{!CHECKOUT_ENABLED\}/);
  assert.ok(TIERS.includes("'Coming Soon'"));
  assert.ok(TIERS.includes('not yet open for enrolment'));
  assert.ok(TIERS.includes('contact the ministry'));
});

test('the checkout code path is preserved for when Stripe is configured', () => {
  // M12 changes presentation only; it must not delete the working integration.
  assert.ok(TIERS.includes('handleCheckout'), 'checkout handler must remain');
  assert.ok(TIERS.includes("mode: 'subscription'"), 'subscription call must remain');
  assert.ok(TIERS.includes('/donations/stripe/checkout'), 'endpoint must remain');
});

test('M12 configures no Stripe credentials', () => {
  assert.ok(!/sk_live|sk_test|STRIPE_SECRET/.test(TIERS));
});
