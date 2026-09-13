/**
 * M10.1 — Cloudflare-mode admin overview data source.
 *
 * `/api/admin/memberships` and `/api/admin/ordinations` default to a single
 * status (used by the pending-approval queue elsewhere); the overview page
 * wants every status, so it passes `status=all` — a small addition to
 * those existing routes rather than a new endpoint (see worker/routes/admin.js).
 */
// Explicit extension: this module is imported directly by node --test, whose
// ESM loader does not do Vite's extensionless resolution.
import { projectDonation } from './adminQueues.js';

export const CLOUDFLARE_ADMIN_PATH = {
  profiles: '/admin/profiles',
  donations: '/admin/donations',
  scrolls: '/admin/scrolls',
  memberships: '/admin/memberships?status=all',
  ordinations: '/admin/ordinations?status=all',
};

/**
 * Adapts D1's own field names to the names AdminDashboard.jsx's existing
 * column definitions already expect (same convention as DashboardHome.jsx's
 * membership/ordination `status` mapping) — so the same render code works
 * for both the Cloudflare and Supabase data shapes.
 */
export function mapAdminRow(table, row) {
  if (table === 'memberships') return { ...row, status: row.application_status };
  if (table === 'scrolls') return { ...row, pdf_path: row.r2_key };
  // M14.3 — donations are provider-neutral and go through the M13 privacy
  // projection rather than being rendered raw. That is what drops `user_id`
  // and the internal provider transaction id, and what lets one column show
  // an amount whether the rail counts in cents or in drops.
  if (table === 'donations') return projectDonation(row);
  return row;
}
