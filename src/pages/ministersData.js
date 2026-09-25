/**
 * Ministers directory — pure data mapping between the D1-backed
 * `/api/ministers` shape (`id, display_name, title, bio, photo_key`) and the
 * view model the pages render.
 *
 * `photo_key` is an R2 key in the `bm-public` bucket, following the
 * `ministers/<id>.<ext>` convention (see docs/R2_FILE_MIGRATION_PLAN.md) and
 * served publicly by the Worker route `GET /api/files/public/:key+`
 * (worker/routes/files.js). `imageUrl` is derived from it when `photo_key` is
 * a non-empty, safe key; otherwise it stays undefined and the avatar falls
 * back to initials, same as it already does for a minister with no photo.
 */

/**
 * Builds the public file-serving URL for an R2 key, or `undefined` when the
 * key is missing or unsafe. Slashes are kept as path separators (each
 * segment is encoded on its own) so nested keys like `ministers/m1.jpg`
 * still round-trip through the Worker's `:key+` catch-all route. Keys with a
 * leading `/` or a `..` segment are rejected rather than encoded.
 */
export function photoUrl(key) {
  if (typeof key !== 'string' || key.length === 0) return undefined;
  if (key.startsWith('/')) return undefined;
  const segments = key.split('/');
  if (segments.some((segment) => segment === '..')) return undefined;
  return `/api/files/public/${segments.map(encodeURIComponent).join('/')}`;
}

/** `"Jordan Rivers"` -> `"JR"`; a single name -> its first initial; empty -> `"BM"`. */
export function getInitials(name) {
  if (!name) return 'BM';
  const names = String(name).trim().split(/\s+/).filter(Boolean);
  if (names.length === 0) return 'BM';
  if (names.length === 1) return names[0].charAt(0).toUpperCase();
  return `${names[0].charAt(0)}${names[names.length - 1].charAt(0)}`.toUpperCase();
}

/**
 * Maps one `/api/ministers` row onto the shape the pages already render.
 * `null`/`undefined` in -> `null` out, so a caller can filter defensively.
 */
export function mapMinister(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    name: row.display_name || '',
    title: row.title || '',
    bio: row.bio || '',
    imageUrl: photoUrl(row.photo_key),
  };
}

/** Maps a `/api/ministers` list response (`{items}`) into view models, dropping anything malformed. */
export function mapMinisters(response) {
  const items = Array.isArray(response?.items) ? response.items : [];
  return items.map(mapMinister).filter(Boolean);
}
