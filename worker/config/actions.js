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
  CONTACT_SUBMIT: 'contact.submit',
  SCROLL_REQUEST_SUBMIT: 'scroll_request.submit',
  CONSULTATION_REQUEST: 'consultation.request',
  DONATION_RECORDED: 'donation.recorded',
  // M9.4 one-time legacy-data migration (Supabase -> D1). One row per
  // migrated entity; entity_type/entity_id on the audit row distinguish a
  // migrated user from a migrated contact inquiry.
  LEGACY_DATA_MIGRATED: 'legacy_data.migrated',
});
