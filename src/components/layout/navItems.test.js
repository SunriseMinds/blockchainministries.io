/**
 * M12 — header navigation model and mobile-menu behaviour.
 *
 * Asserts against the REAL Header.jsx / App.jsx source as well as the pure
 * model, so a future edit that drops the menu button, reverts the breakpoint,
 * or points a link at a non-existent route fails here.
 *
 * Run: node --test src/components/layout/navItems.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRIMARY_LINKS, SECONDARY_LINKS, authActions, mobileMenuItems } from './navItems.js';

const HEADER = readFileSync(new URL('./Header.jsx', import.meta.url), 'utf8');
const APP = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8');
const LAYOUT = readFileSync(new URL('./MainLayout.jsx', import.meta.url), 'utf8');

/* ------------------------------------------------------- routes are real -- */

test('every nav destination is a route that actually exists in App.jsx', () => {
  const declared = [...APP.matchAll(/path="([^"]+)"/g)].map(m => m[1]);
  const routes = new Set(declared.map(p => (p.startsWith('/') ? p : `/${p}`)));
  routes.add('/'); // index route

  for (const l of [...PRIMARY_LINKS, ...SECONDARY_LINKS]) {
    assert.ok(routes.has(l.to), `nav points at a non-existent route: ${l.to}`);
  }
  for (const a of [...authActions(null), ...authActions({ id: 'u' })]) {
    if (a.to) assert.ok(routes.has(a.to), `auth action points at a non-existent route: ${a.to}`);
  }
});

test('REGRESSION: /membership is never used (the orphaned Navigation.jsx dead link)', () => {
  for (const l of [...PRIMARY_LINKS, ...SECONDARY_LINKS]) {
    assert.notEqual(l.to, '/membership');
  }
  assert.ok(!HEADER.includes('"/membership"'), 'Header must not link to the non-existent /membership');
});

/* --------------------------------------------------------- auth awareness -- */

test('logged out: Login, Join Us and Donate — never Dashboard or Logout', () => {
  const keys = authActions(null).map(a => a.key);
  assert.deepEqual(keys, ['login', 'join', 'donate']);
  assert.ok(!keys.includes('dashboard'));
  assert.ok(!keys.includes('logout'));
});

test('logged in: Dashboard and Logout — never guest-only actions', () => {
  const keys = authActions({ id: 'u-1', email: 'a@b.test' }).map(a => a.key);
  assert.deepEqual(keys, ['dashboard', 'logout']);
  for (const guest of ['login', 'join', 'donate']) {
    assert.ok(!keys.includes(guest), `guest-only action leaked to a signed-in user: ${guest}`);
  }
});

test('logout is an action, not a link', () => {
  const logout = authActions({ id: 'u' }).find(a => a.key === 'logout');
  assert.equal(logout.action, 'logout');
  assert.equal(logout.to, undefined);
});

/* ------------------------------------------------- mobile menu completeness -- */

test('the mobile menu exposes every desktop destination plus the auth actions', () => {
  const out = mobileMenuItems(null);
  const labels = out.links.map(l => l.label);
  for (const l of PRIMARY_LINKS) {
    assert.ok(labels.includes(l.label), `mobile menu is missing desktop link: ${l.label}`);
  }
  // and the roomier menu adds the destinations the desktop bar has no width for
  assert.ok(labels.includes('Ordination'));
  assert.ok(labels.includes('Recognition'));
  assert.deepEqual(out.actions.map(a => a.key), ['login', 'join', 'donate']);

  const signedIn = mobileMenuItems({ id: 'u' });
  assert.deepEqual(signedIn.actions.map(a => a.key), ['dashboard', 'logout']);
  assert.deepEqual(signedIn.links.map(l => l.label), labels, 'links must not depend on auth state');
});

test('desktop and mobile render from the SAME source, so they cannot drift', () => {
  assert.ok(HEADER.includes('PRIMARY_LINKS.map'), 'desktop bar must render from PRIMARY_LINKS');
  assert.ok(HEADER.includes('mobile.links.map'), 'mobile menu must render from the shared model');
  assert.ok(HEADER.includes('mobileMenuItems'), 'Header must consume the shared model');
});

/* ------------------------------------------------------------- breakpoint -- */

test('REGRESSION: the desktop bar is revealed at lg, not md (768px overflow fix)', () => {
  assert.ok(HEADER.includes('hidden lg:flex'), 'desktop bar must be hidden below lg');
  assert.ok(!HEADER.includes('hidden md:flex'), 'md reveal caused ~131px overflow at 768px');
  assert.ok(HEADER.includes('lg:hidden'), 'menu button must be visible below lg');
});

/* ------------------------------------------------------- menu control a11y -- */

test('the menu control is a real button with an accessible name and state', () => {
  assert.match(HEADER, /type="button"/);
  assert.match(HEADER, /aria-label=\{menuOpen \? 'Close menu' : 'Open menu'\}/);
  assert.match(HEADER, /aria-expanded=\{menuOpen\}/);
  assert.match(HEADER, /aria-controls="mobile-menu"/);
  assert.match(HEADER, /id="mobile-menu"/);
  assert.match(HEADER, /focus-visible:ring/, 'focus must be visible');
});

test('Escape closes the menu and restores focus to the control', () => {
  assert.match(HEADER, /e\.key === 'Escape'/);
  assert.match(HEADER, /menuButtonRef\.current\?\.focus\(\)/);
  assert.match(HEADER, /document\.addEventListener\('keydown'/);
  assert.match(HEADER, /removeEventListener\('keydown'/, 'listener must be cleaned up');
});

test('the menu closes on navigation and on route change (covers Back/Forward)', () => {
  assert.match(HEADER, /onClick=\{\(\) => setMenuOpen\(false\)\}/, 'links must close the menu');
  assert.match(HEADER, /useEffect\(\(\) => \{ setMenuOpen\(false\); \}, \[location\.pathname\]\)/);
});

test('no body scroll-lock is introduced, so no scroll can be stranded', () => {
  assert.ok(!/document\.body\.style\.overflow/.test(HEADER), 'scroll-lock risks a stuck page');
});

test('nav has a landmark label and the layout offers a skip link', () => {
  assert.match(HEADER, /aria-label="Main navigation"/);
  assert.match(LAYOUT, /href="#main-content"/);
  assert.match(LAYOUT, /id="main-content"/);
  assert.match(LAYOUT, /Skip to content/);
});

/* ------------------------------------------------------------ generic 404 -- */

test('unknown paths say "Page Not Found", not "Scroll Not Found"', () => {
  assert.ok(APP.includes('404 - Page Not Found'));
  assert.ok(!APP.includes('404 - Scroll Not Found'), 'scroll-specific copy must not be the site-wide 404');
});

test('REGRESSION: verification routes are untouched by the 404 change', () => {
  assert.match(APP, /path="verify\/:slug"\s+element=\{<Verify\s*\/>\}/);
  assert.match(APP, /path="verify"\s+element=\{<Verify\s*\/>\}/);
  const verifyIdx = APP.indexOf('path="verify"');
  const catchAll = APP.indexOf('path="*"');
  assert.ok(verifyIdx > -1 && verifyIdx < catchAll, '/verify must precede the catch-all');
});
