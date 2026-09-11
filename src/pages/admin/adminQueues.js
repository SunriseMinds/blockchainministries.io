/**
 * M13 Phase 3 — the presentation/privacy boundary for admin operational queues.
 *
 * WHY THIS EXISTS
 * The four operational admin endpoints all return `SELECT *`. Rendering those
 * rows directly would put visitor IP addresses, internal user ids, private
 * consultation notes and — most seriously — the PRIVATE credential revocation
 * reason onto a screen that may be shared, screenshotted or projected.
 *
 * So nothing here ever spreads a raw row. Every projection builds a NEW object
 * containing only allow-listed keys. A field that is not named below cannot be
 * displayed, including fields that do not exist yet: a column added to D1
 * tomorrow stays invisible until someone deliberately adds it here.
 *
 * Pure by contract: no React, no fetch, no DOM, no storage, no env. Phase 4
 * consumes this; it does not get to improvise its own projections.
 */

/* ------------------------------------------------------------- formatters -- */

export const EMPTY = '—';

/** ISO -> local date-time, or EMPTY. Never throws on junk or null. */
export function formatWhen(value) {
  if (!value) return EMPTY;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return EMPTY;
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

/** Date-only variant for fields like `requested_at`. */
export function formatDate(value) {
  if (!value) return EMPTY;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? EMPTY : d.toLocaleDateString();
}

/** Display any stored string safely; blanks and non-strings degrade. */
export function text(value) {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return EMPTY;
  const t = value.trim();
  return t === '' ? EMPTY : t;
}

/** Status label. Unknown values are shown as-is (they are our own enums), never invented. */
export function formatStatus(value) {
  const t = text(value);
  if (t === EMPTY) return EMPTY;
  return t.charAt(0).toUpperCase() + t.slice(1).replace(/_/g, ' ');
}

/* ------------------------------------------------------ audit vocabulary -- */

/**
 * Human labels for the actions Blockchain Ministries actually emits
 * (worker/config/actions.js + the platform CORE_ACTIONS it inherits).
 * An action missing from this map is NOT invented — it falls back to its own
 * machine name, which is a safe internal identifier, never user data.
 */
export const ACTION_LABELS = Object.freeze({
  'ordination.apply': 'Ordination applied',
  'ordination.approve': 'Ordination approved',
  'ordination.reject': 'Ordination rejected',
  'membership.apply': 'Membership applied',
  'membership.approve': 'Membership approved',
  'membership.reject': 'Membership rejected',
  'credential.view': 'Credential viewed',
  'credential.revoke': 'Credential revoked',
  'credential.reissue': 'Credential reissued',
  'credential.notify_failed': 'Notification failed',
  'notify.failed': 'Notification failed',
  'contact.submit': 'Contact inquiry',
  'scroll_request.submit': 'Scroll request',
  'consultation.request': 'Consultation request',
  'donation.recorded': 'Donation recorded',
  'profile.update': 'Profile updated',
  'profile.role_change': 'Role changed',
  'auth.signup': 'Signed up',
  'auth.login.success': 'Signed in',
  'auth.login.failure': 'Sign-in failed',
  'auth.logout': 'Signed out',
  'auth.logout_all': 'Signed out everywhere',
  'auth.email_verified': 'Email verified',
  'auth.password_reset.request': 'Password reset requested',
  'auth.password_reset.complete': 'Password reset completed',
  'file.download': 'File downloaded',
  'file.upload': 'File uploaded',
  'file.delete': 'File deleted',
  'payment.recorded': 'Payment recorded',
});

export const formatAction = (action) =>
  ACTION_LABELS[action] || text(action);

/**
 * Metadata keys allowed in the LIST summary, per action.
 *
 * Deliberately absent:
 *   credential.revoke -> `reason`   the PRIVATE revocation reason (details only)
 *   notify.failed     -> `reason`   a failure string (details only)
 *   auth.login.failure -> `ip`      packages/auth records the caller IP here
 *   *.approve         -> `minting`  XRPL diagnostics, an object, not operational signal
 *
 * An action absent from this map contributes NO metadata to the list at all.
 */
const LIST_METADATA_KEYS = Object.freeze({
  'ordination.approve': ['credential_number'],
  'credential.view': ['credential_number'],
  'credential.revoke': ['credential_number'],
  'credential.reissue': ['credential_number', 'credential_version'],
  'notify.failed': ['audience', 'kind'],
  'donation.recorded': ['type'],
});

/**
 * Metadata keys allowed in the explicit DETAILS disclosure, per action.
 *
 * `credential.revoke` is the ONLY action whose `reason` may ever be shown, and
 * only here. The viewer is already requireAdmin-authorized and has chosen to
 * open one specific row — which is materially different from that text sitting
 * in a list on a shared screen.
 */
const DETAILS_METADATA_KEYS = Object.freeze({
  'ordination.approve': ['credential_number', 'credential_version', 'verify_slug'],
  'credential.view': ['credential_number', 'credential_version', 'as_admin'],
  'credential.revoke': ['credential_number', 'credential_version', 'revoked_at', 'reason'],
  'credential.reissue': ['credential_number', 'credential_version', 'issued_at'],
  'notify.failed': ['audience', 'kind', 'reason'],
  'donation.recorded': ['type'],
});

/** Human labels for metadata keys that may surface. */
const METADATA_LABELS = Object.freeze({
  credential_number: 'Credential No.',
  credential_version: 'Version',
  verify_slug: 'Verification code',
  revoked_at: 'Revoked at',
  issued_at: 'Issued at',
  as_admin: 'Viewed as admin',
  audience: 'Audience',
  kind: 'Notification',
  type: 'Type',
  reason: 'Reason',
});

/**
 * Parse `metadata_json` defensively.
 *
 * Rows written months ago, by older code, or corrupted in transit must never
 * break the Activity view. Anything that is not a plain JSON object — null,
 * malformed text, an array, a bare string or number — degrades to {}.
 */
export function safeMetadata(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || raw.trim() === '') return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

/** Project metadata through a per-action allow-list into label/value pairs. */
function projectMetadata(action, raw, allowMap) {
  const allowed = allowMap[action];
  if (!allowed) return [];
  const meta = safeMetadata(raw);
  const out = [];
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(meta, key)) continue;
    const value = meta[key];
    if (value === null || value === undefined || value === '') continue;
    if (typeof value === 'object') continue; // never render nested structures
    out.push({
      key,
      label: METADATA_LABELS[key] || key,
      value: typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value),
    });
  }
  return out;
}

/* -------------------------------------------------------- row projections -- */

/** Contact inquiry. `ip` is deliberately dropped. */
export function projectInquiry(row) {
  return {
    id: text(row?.id),
    received: formatWhen(row?.created_at),
    name: text(row?.name),
    email: text(row?.email),
    type: text(row?.inquiry_type),
    status: formatStatus(row?.status),
    message: text(row?.message),
  };
}

/** Scroll request. `ip` is deliberately dropped. */
export function projectScrollRequest(row) {
  return {
    id: text(row?.id),
    received: formatWhen(row?.created_at),
    name: text(row?.name),
    email: text(row?.email),
    requestType: text(row?.request_type),
    status: formatStatus(row?.status),
    message: text(row?.message),
  };
}

/** Consultation. `user_id` and internal `notes` are deliberately dropped. */
export function projectConsultation(row) {
  return {
    id: text(row?.id),
    received: formatWhen(row?.created_at),
    name: text(row?.name),
    email: text(row?.email),
    topic: text(row?.topic),
    requested: formatDate(row?.requested_at),
    status: formatStatus(row?.status),
  };
}

/**
 * Audit row -> LIST summary.
 *
 * Drops `actor_user_id`, `ip`, `user_agent` and — critically — never carries
 * `metadata_json` in any form. `summary` is built only from allow-listed keys,
 * so a private `reason` cannot reach it even for an action that stores one.
 */
export function projectActivity(row) {
  const action = text(row?.action);
  const parts = projectMetadata(row?.action, row?.metadata_json, LIST_METADATA_KEYS);
  return {
    id: text(row?.id),
    when: formatWhen(row?.created_at),
    action: formatAction(row?.action),
    actionKey: action,
    actor: text(row?.actor_email),
    entity: row?.entity_type ? `${text(row.entity_type)}${row?.entity_id ? ` · ${text(row.entity_id)}` : ''}` : EMPTY,
    summary: parts.length ? parts.map((p) => p.value).join(' · ') : EMPTY,
    hasDetails: projectMetadata(row?.action, row?.metadata_json, DETAILS_METADATA_KEYS).length > 0,
  };
}

/**
 * Audit row -> explicit DETAILS disclosure.
 *
 * Separate on purpose: Phase 4 has to call this deliberately for one row. It
 * is the only path on which `credential.revoke`'s private reason can appear,
 * and it is still allow-listed per action, so a stray `reason` key on any
 * other action stays hidden.
 */
export function projectActivityDetails(row) {
  return projectMetadata(row?.action, row?.metadata_json, DETAILS_METADATA_KEYS);
}

/* --------------------------------------------------------------- queues -- */

/**
 * The four operational queues. Paths match worker/routes/admin.js exactly and
 * use the `/admin/...` convention the existing api client expects (it prefixes
 * `/api`, see src/lib/cloudflareApi.js and adminOverview.js).
 */
export const QUEUES = Object.freeze({
  inquiries: Object.freeze({
    key: 'inquiries',
    label: 'Inquiries',
    path: '/admin/contact-inquiries',
    project: projectInquiry,
    columns: Object.freeze([
      { key: 'received', label: 'Received' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
      { key: 'message', label: 'Message', wide: true },
    ]),
    empty: 'No contact inquiries yet.',
    error: 'Could not load contact inquiries.',
  }),

  scrollRequests: Object.freeze({
    key: 'scrollRequests',
    label: 'Scroll Requests',
    path: '/admin/scroll-requests',
    project: projectScrollRequest,
    columns: Object.freeze([
      { key: 'received', label: 'Received' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'requestType', label: 'Request Type' },
      { key: 'status', label: 'Status' },
      { key: 'message', label: 'Message', wide: true },
    ]),
    empty: 'No scroll requests yet.',
    error: 'Could not load scroll requests.',
  }),

  consultations: Object.freeze({
    key: 'consultations',
    label: 'Consultations',
    path: '/admin/consultations',
    project: projectConsultation,
    columns: Object.freeze([
      { key: 'received', label: 'Received' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'topic', label: 'Topic' },
      { key: 'requested', label: 'Requested' },
      { key: 'status', label: 'Status' },
    ]),
    empty: 'No consultation requests yet.',
    error: 'Could not load consultation requests.',
  }),

  activity: Object.freeze({
    key: 'activity',
    label: 'Activity',
    path: '/admin/audit-logs',
    project: projectActivity,
    details: projectActivityDetails,
    columns: Object.freeze([
      { key: 'when', label: 'When' },
      { key: 'action', label: 'Action' },
      { key: 'actor', label: 'Actor' },
      { key: 'entity', label: 'Entity' },
      { key: 'summary', label: 'Details' },
    ]),
    empty: 'No recorded activity yet.',
    error: 'Could not load activity.',
  }),
});

/** Project a whole response safely; a non-array degrades to []. */
export function projectRows(queueKey, items) {
  const queue = QUEUES[queueKey];
  if (!queue || !Array.isArray(items)) return [];
  return items.map((row) => queue.project(row));
}
