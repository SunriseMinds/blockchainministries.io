/**
 * M11 Phase 7 — member credential presentation for the dashboard.
 *
 * Pure and tested, following the pattern already used by membershipCta.js and
 * verifyStatus.js. The rule it encodes: an active "View Credential" action is
 * offered ONLY when the server says the credential is available. Availability
 * is never re-derived on the client.
 */

/**
 * @param {object} o one item from GET /api/ordination/mine
 * @returns {{state:string, label:string, detail:string, canView:boolean,
 *            href:string|null, credentialNumber:string|null, verifyPath:string|null}}
 */
export function credentialView(o) {
  const base = {
    credentialNumber: o?.credential_number ?? null,
    verifyPath: o?.verify_slug ? `/verify/${o.verify_slug}` : null,
    href: null,
    canView: false,
  };

  if (o?.credential_available === true) {
    return {
      ...base,
      state: 'available',
      label: 'Credential issued',
      detail: 'Your Certificate of Ordination is ready to view and print.',
      canView: true,
      // Opened as a top-level navigation so the HttpOnly session cookie is
      // sent; the Worker renders the document per request (there is no file).
      href: `/api/ordination/${o.id}/credential`,
    };
  }

  // Revoked is reported truthfully and distinctly — never as a generic
  // "unavailable" — but WITHOUT the private reason, which the API never sends.
  if (o?.credential_revoked === true) {
    return {
      ...base,
      state: 'revoked',
      label: 'Credential revoked',
      detail: 'This credential has been revoked and can no longer be viewed. Please contact the ministry with any questions.',
    };
  }

  if (o?.status === 'pending') {
    return { ...base, state: 'pending', label: 'Under review', detail: 'Your application is with the council.' };
  }

  if (o?.status === 'rejected') {
    return { ...base, state: 'rejected', label: 'Not approved', detail: 'Please contact the ministry for more information.' };
  }

  // Approved but never issued — every pre-M11 row looks like this.
  return {
    ...base,
    state: 'unavailable',
    label: 'Credential unavailable',
    detail: 'No credential is currently available for this ordination.',
  };
}
