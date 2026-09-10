/**
 * M11 Phase 6 — public verification presentation logic.
 *
 * Extracted as a pure function so the VALID / REVOKED distinction is directly
 * testable, matching the pattern already used by membershipCta.js and
 * adminOverview.js (this repo has no React test harness; pure helpers plus
 * node:test are how frontend logic is covered here).
 *
 * The security-critical rule this encodes: a REVOKED credential must never be
 * rendered with the valid/positive presentation. `verified` and
 * `credential_status` both come from the server; presentation follows them and
 * never re-derives validity on the client.
 */

/** Server-side credential_status values. */
export const VALID = 'valid';
export const REVOKED = 'revoked';

/**
 * Map a verification payload to an explicit presentation contract.
 *
 * Accessibility: `label` and `statement` carry the status in TEXT. Colour is a
 * secondary cue only — never the sole signal — so the page remains readable in
 * grayscale, to a screen reader, and to a colour-blind viewer.
 *
 * @param {object} data the `data` object from GET /api/verify/:slug
 * @returns {{status:string, isValid:boolean, label:string, statement:string,
 *            tone:string, icon:string, showRevokedAt:boolean}}
 */
export function ordinationPresentation(data) {
  const isValid = data?.credential_status === VALID && data?.verified === true;

  if (isValid) {
    return {
      status: VALID,
      isValid: true,
      label: 'Verified',
      statement: 'This Blockchain Ministries ordination credential is valid.',
      tone: 'positive',
      icon: 'check',
      showRevokedAt: false,
    };
  }

  // Anything that is not explicitly valid is presented as revoked — fail
  // closed. An unrecognised or malformed status must never fall through to the
  // positive presentation.
  return {
    status: REVOKED,
    isValid: false,
    label: 'REVOKED',
    statement: 'This Blockchain Ministries ordination credential has been revoked.',
    tone: 'negative',
    icon: 'x',
    showRevokedAt: Boolean(data?.revoked_at),
  };
}

/**
 * The fields a verification page may display, in order.
 *
 * An allow-list, not a passthrough: even if the API were ever to return more
 * than it should, the page cannot render a private field it has no row for.
 * `revocation_reason` and `revoked_by` have no row here and never will.
 */
export function ordinationFields(data, presentation) {
  const rows = [
    { key: 'full_name', label: 'Minister', value: data?.full_name },
    { key: 'designation', label: 'Designation', value: data?.designation },
    { key: 'credential_number', label: 'Credential No.', value: data?.credential_number },
    { key: 'date_of_ordination', label: 'Date of Ordination', value: formatDate(data?.date_of_ordination) },
  ];
  if (presentation.showRevokedAt) {
    rows.push({ key: 'revoked_at', label: 'Revoked On', value: formatDate(data?.revoked_at) });
  }
  return rows.filter((r) => r.value);
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
}
