/**
 * M10.1 — Cloudflare-mode admin overview data source.
 *
 * `/api/admin/memberships` and `/api/admin/ordinations` default to a single
 * status (used by the pending-approval queue elsewhere); the overview page
 * wants every status, so it passes `status=all` — a small addition to
 * those existing routes rather than a new endpoint (see worker/routes/admin.js).
 */
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
  return row;
}
