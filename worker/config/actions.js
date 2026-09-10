/**
 * Blockchain Ministries audit vocabulary.
 *
 * BUSINESS verbs only. Platform verbs (auth.*, profile.*, file.*, payment.*)
 * come from @reellink/security and are merged in by defineActions().
 */
import { defineActions } from '@reellink/security/audit.js';

export const ACTIONS = defineActions({
  MEMBERSHIP_APPLY: 'membership.apply',
  MEMBERSHIP_APPROVE: 'membership.approve',
  MEMBERSHIP_REJECT: 'membership.reject',
  ORDINATION_APPLY: 'ordination.apply',
  ORDINATION_APPROVE: 'ordination.approve',
  ORDINATION_REJECT: 'ordination.reject',
  // M11 — written only AFTER authorization succeeds, so the log records
  // genuine disclosures of a credential, never rejected attempts.
  CREDENTIAL_VIEW: 'credential.view',
  // M11 Phase 6 lifecycle. Written only after the state transition committed.
  // `credential.revoke` metadata carries the PRIVATE revocation reason: the
  // only reader of audit_logs in this application is GET /api/admin/audit-logs
  // behind requireAdmin, so this table is admin-only (see the phase report).
  CREDENTIAL_REVOKE: 'credential.revoke',
  CREDENTIAL_REISSUE: 'credential.reissue',
  // Notification delivery failed AFTER an authoritative state change. The
  // state stands; this records that the member was not reached.
  CREDENTIAL_NOTIFY_FAILED: 'credential.notify_failed',
  CONTACT_SUBMIT: 'contact.submit',
  SCROLL_REQUEST_SUBMIT: 'scroll_request.submit',
  CONSULTATION_REQUEST: 'consultation.request',
  DONATION_RECORDED: 'donation.recorded',
});
