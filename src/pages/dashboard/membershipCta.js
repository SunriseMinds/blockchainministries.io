/**
 * Pure decision for the Member Dashboard's "Apply for Membership" CTA.
 *
 * A CTA to start a NEW application only makes sense when the user has no
 * membership record at all. Pending, approved, and rejected all mean an
 * application already exists on file, so none of them get this CTA — a
 * rejected applicant resubmits from /membership/apply directly, not via a
 * "new application" prompt on the dashboard.
 */
export function shouldShowApplyCta(membership) {
  return !membership;
}
