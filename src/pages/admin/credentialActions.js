/**
 * M11 Phase 7 — admin credential lifecycle controls.
 *
 * Pure and tested. Decides which single lifecycle action an approved
 * ordination offers, and validates a revocation reason before any request is
 * sent, so an accidental click cannot revoke and a blank reason cannot reach
 * the API.
 */

/** Matches the server-side bound in worker/routes/admin.js. */
export const REASON_MAX = 1000;

/**
 * @param {object} o an admin ordination row (GET /api/admin/ordinations)
 * @returns {{action:'revoke'|'reissue'|null, state:string, label:string,
 *            credentialNumber:string|null, version:number|null, requiresReason:boolean}}
 */
export function credentialAction(o) {
  const credentialNumber = o?.credential_number ?? null;
  const version = o?.credential_version ?? null;
  const none = { action: null, credentialNumber, version, requiresReason: false };

  // Not a credential at all — approval alone is not issuance (pre-M11 rows).
  if (!o?.issued_at) {
    return { ...none, state: 'not_issued', label: 'No credential issued' };
  }

  if (o?.revoked_at) {
    return {
      action: 'reissue',
      state: 'revoked',
      label: 'Revoked',
      credentialNumber,
      version,
      requiresReason: false,
    };
  }

  return {
    action: 'revoke',
    state: 'valid',
    label: 'Valid',
    credentialNumber,
    version,
    requiresReason: true,
  };
}

/**
 * Client-side guard for the revocation reason. The server validates again —
 * this exists so the confirmation dialog cannot submit an empty reason, not as
 * a security control.
 *
 * @returns {{ok:boolean, value:string, error:string|null}}
 */
export function validateReason(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return { ok: false, value, error: 'A revocation reason is required.' };
  if (value.length > REASON_MAX) {
    return { ok: false, value, error: `Reason must be ${REASON_MAX} characters or fewer.` };
  }
  return { ok: true, value, error: null };
}

/**
 * Confirmation copy. Revocation is destructive to the member's standing, so
 * the dialog names the credential explicitly rather than saying "this item".
 */
export function confirmCopy(action, credentialNumber) {
  if (action === 'revoke') {
    return {
      title: 'Revoke this credential?',
      body: `Credential ${credentialNumber ?? ''} will stop working immediately. The minister will no longer be able to view or print it, and public verification will show it as REVOKED. The minister is notified by email; the internal reason below is never shared with them or shown publicly.`,
      confirmLabel: 'Revoke Credential',
    };
  }
  return {
    title: 'Reissue this credential?',
    body: `Credential ${credentialNumber ?? ''} will become valid again. The credential number, verification link and original Date of Ordination are unchanged — only the issue version advances. The minister is notified by email.`,
    confirmLabel: 'Reissue Credential',
  };
}
