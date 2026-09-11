/**
 * M12 — the single source of truth for header navigation.
 *
 * Pure and tested, following the pattern used by membershipCta.js,
 * verifyStatus.js and credentialCard.js (this repo has no React test harness;
 * pure helpers plus node:test are how frontend logic is covered here).
 *
 * Desktop and mobile render from THIS list, so the two can never drift apart —
 * which is the specific failure mode the orphaned Navigation.jsx represents:
 * a second, competing nav that was never auth-aware and still points at
 * `/membership`, a route that does not exist.
 *
 * Every `to` below is an existing route in src/App.jsx. No routes are invented.
 */

/** Public destinations, shown to everyone. Mirrors the existing desktop order. */
export const PRIMARY_LINKS = Object.freeze([
  { to: '/', label: 'Home', end: true },
  { to: '/about', label: 'About' },
  { to: '/ministries', label: 'Ministries' },
  { to: '/scrolls', label: 'Scrolls' },
  { to: '/token', label: 'Token' },
  { to: '/contact', label: 'Contact' },
]);

/**
 * Destinations that only make sense in the roomier mobile menu. The desktop
 * bar deliberately stays as-is (it is already at its width budget), but a
 * phone menu has vertical space, so it also surfaces Ordination and
 * Recognition rather than hiding them behind the footer.
 */
export const SECONDARY_LINKS = Object.freeze([
  { to: '/ordination', label: 'Ordination' },
  { to: '/recognition', label: 'Recognition' },
]);

/**
 * Auth-aware actions. Derived from the SAME `user` object the header already
 * consumes from AuthProvider — no second auth state source is introduced.
 *
 * @param {object|null} user
 * @returns {Array<{key:string, label:string, to?:string, action?:'logout', variant:string}>}
 */
export function authActions(user) {
  if (user) {
    return [
      { key: 'dashboard', label: 'Dashboard', to: '/dashboard', variant: 'outline' },
      { key: 'logout', label: 'Logout', action: 'logout', variant: 'ghost' },
    ];
  }
  return [
    { key: 'login', label: 'Login', to: '/login', variant: 'outline' },
    { key: 'join', label: 'Join Us', to: '/join', variant: 'outline' },
    { key: 'donate', label: 'Donate', to: '/donate', variant: 'primary' },
  ];
}

/** Everything the mobile menu shows, in order. */
export function mobileMenuItems(user) {
  return {
    links: [...PRIMARY_LINKS, ...SECONDARY_LINKS],
    actions: authActions(user),
  };
}
