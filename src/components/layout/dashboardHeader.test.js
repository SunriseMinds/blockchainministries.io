/**
 * Post-M13 — the authenticated dashboard header must survive phone widths.
 *
 * Run: node --test src/components/layout/dashboardHeader.test.js
 *
 * WHAT BROKE, AND WHY A SOURCE TEST IS THE RIGHT GUARD HERE
 * `header p-4` plus Tailwind's `container` (padding: 2rem) spend 96px of
 * horizontal room before any content, leaving 224px at 320px wide. The brand
 * (138px measured) and the action group (213px measured) were both flex items
 * with the default `min-width: auto`, so neither could shrink: 351px of rigid
 * content pinned to a fixed right edge of 399px, which is exactly the 79px of
 * page overflow at 320 and 9px at 390 that browser measurement recorded.
 *
 * The repair is entirely structural — wrap, and let the brand give way — so
 * the regressions worth guarding are structural too: someone deleting
 * `flex-wrap`, reintroducing a `hidden sm:` on a required action, or reaching
 * for `overflow-x-hidden` to make the symptom disappear. Real layout numbers
 * are proven by measuring a browser, not here; see the acceptance report.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const JSX = readFileSync(new URL('./DashboardLayout.jsx', import.meta.url), 'utf8');

/** Comments stripped — an assertion must not pass by matching prose. */
const CODE = JSX
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

/** The header's outer flex row. */
const HEADER_ROW = (CODE.match(/<div className="container mx-auto flex[^"]*">/) || [])[0] || '';

/** The action group: from the brand link's close to the end of the header. */
const ACTIONS = CODE.slice(CODE.indexOf('</Link>') + 7, CODE.indexOf('</header>'));

/* ------------------------------------------------------- the bandage -- */

test('REGRESSION: no overflow is hidden to mask the defect', () => {
  for (const bandage of ['overflow-x-hidden', 'overflow-hidden', 'overflow-x-clip', 'max-w-screen']) {
    assert.ok(!CODE.includes(bandage), `layout must not clip an axis to hide overflow: ${bandage}`);
  }
  // `truncate` is allowed — it contains overflow-hidden but applies to one
  // text node so it can shrink, which is the opposite of clipping the page.
  assert.ok(CODE.includes('truncate'), 'the brand must be allowed to give way');
});

/* ---------------------------------------------------------- wrapping -- */

test('the header row wraps instead of forcing a fixed width', () => {
  assert.match(HEADER_ROW, /\bflex-wrap\b/, 'the header row must wrap');
  assert.match(HEADER_ROW, /\bitems-center\b/);
  assert.match(HEADER_ROW, /gap-y-/, 'wrapped rows need vertical spacing');
});

test('the action group wraps on its own', () => {
  const group = (ACTIONS.match(/<div className="flex[^"]*">/) || [])[0] || '';
  assert.match(group, /\bflex-wrap\b/, 'the actions must wrap, not overflow');
  assert.match(group, /gap-y-/);
});

test('the brand can shrink rather than push the page wider', () => {
  // A flex item defaults to min-width:auto and cannot shrink below its
  // content — which is precisely what pinned the old header open.
  assert.match(CODE, /<Link[^>]*className="flex min-w-0 items-center/, 'the brand link needs min-w-0');
  assert.match(CODE, /<span className="min-w-0 truncate font-bold/, 'the brand text must truncate');
  assert.match(CODE, /<LayoutDashboard className="w-8 h-8 shrink-0/, 'the brand icon must not squash');
});

test('the admin sub-navigation wraps too', () => {
  const nav = (CODE.match(/<div className="container mx-auto flex flex-wrap items-center gap-2 p-2">/) || [])[0];
  assert.ok(nav, 'the admin nav row must wrap at narrow widths');
});

/* ------------------------------------------- required actions remain -- */

test('every required header action is still present', () => {
  for (const action of ['Member View', 'Set EFT TrustLine', 'Logout']) {
    assert.ok(CODE.includes(action), `required action removed: ${action}`);
  }
  assert.ok(CODE.includes('handleLogout'), 'logout must still sign out');
  assert.ok(CODE.includes('trustlineUrl'), 'the trustline destination must remain');
  assert.match(CODE, /\{isAdmin \? 'Admin Sanctuary' : 'Minister Dashboard'\}/,
    'the role indication must remain in the heading');
});

test('REGRESSION: no required action is hidden at phone widths', () => {
  // Set EFT TrustLine used to be `hidden sm:inline-flex` — invisible below
  // 640px, where most members are. Nothing actionable may be display-hidden.
  for (const chunk of ACTIONS.split('<Button')) {
    if (!/Member View|Set EFT TrustLine|Logout/.test(chunk)) continue;
    const label = /Member View/.test(chunk) ? 'Member View'
      : /Set EFT TrustLine/.test(chunk) ? 'Set EFT TrustLine' : 'Logout';
    const classes = (chunk.match(/className="([^"]*)"/) || [])[1] || '';
    assert.ok(!/\bhidden\b/.test(classes), `${label} must not be hidden at any width`);
  }
  assert.ok(!CODE.includes('hidden sm:inline-flex'), 'the old TrustLine hide must be gone');
});

test('the identity text is the only thing that yields, and it is not an action', () => {
  const welcome = (CODE.match(/<span className="([^"]*)">Welcome,/) || [])[1] || '';
  assert.match(welcome, /hidden .*sm:block/, 'identity text may yield at phone widths');
  assert.match(welcome, /truncate/, 'a long email must not widen the row');
  assert.match(welcome, /max-w-/, 'identity text needs a ceiling');
  // It carries no href and no handler — hiding it removes no capability.
  assert.ok(!/Welcome,[^<]*<\/span>\s*<a|onClick[^>]*>Welcome/.test(CODE));
});

/* ------------------------------------------------------ accessibility -- */

test('actions keep accessible names and are not reduced to bare icons', () => {
  // Each control pairs its icon with visible text, so none depends on an
  // icon alone for its accessible name.
  assert.match(ACTIONS, /<Shield className="w-4 h-4 mr-2" \/>\s*\n?\s*Member View/);
  assert.match(ACTIONS, /<LogOut className="w-4 h-4 mr-2" \/>\s*\n?\s*Logout/);
  assert.ok(ACTIONS.includes('Set EFT TrustLine'));
  // The external link keeps its safe-target attributes.
  assert.match(ACTIONS, /target="_blank" rel="noopener noreferrer"/);
});

test('the trustline link is a thumb-sized target now that phones can reach it', () => {
  // As a desktop-only text link it was 20px tall (`p-0 h-auto`); the buttons
  // beside it are 36px.
  const chunk = ACTIONS.split('<Button').find((c) => c.includes('Set EFT TrustLine')) || '';
  assert.match(chunk, /min-h-9/, 'the trustline target must match the buttons beside it');
});

test('logout remains a real button and the rest remain real links', () => {
  assert.match(ACTIONS, /<Button onClick=\{handleLogout\}/);
  assert.match(ACTIONS, /<Link to="\/dashboard">/);
  assert.match(ACTIONS, /<a href=\{trustlineUrl\}/);
});

/* ----------------------------------------------------------- desktop -- */

test('desktop behaviour is preserved', () => {
  // Wrapping is a narrow-width consequence, not a layout change: at 768+
  // the row still fits on one line, and these are what keep it looking the
  // same there.
  assert.match(HEADER_ROW, /justify-between/, 'brand left, actions right on one line');
  assert.match(HEADER_ROW, /gap-x-4/);
  assert.ok(CODE.includes('sticky top-0 z-50'), 'the header must stay sticky');
  assert.ok(CODE.includes('container mx-auto'), 'alignment with <main> must be preserved');
});

test('no authentication or routing behaviour changed', () => {
  assert.match(CODE, /const isAdmin = profile\?\.role === 'admin'/);
  assert.match(CODE, /to=\{isAdmin \? "\/admin" : "\/dashboard"\}/);
  assert.match(CODE, /await signOut\(\);/);
  assert.match(CODE, /navigate\('\/'\);/);
  assert.ok(CODE.includes("{ name: 'Dashboard', href: '/admin'"), 'admin nav links unchanged');
  assert.ok(CODE.includes("{ name: 'Management', href: '/admin/management'"));
});
