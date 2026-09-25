/**
 * Ministers directory — pure data mapping between the D1-backed
 * `/api/ministers` shape (`id, display_name, title, bio, photo_key`) and the
 * view model the pages render.
 *
 * There is deliberately no image URL derived from `photo_key` here: no route
 * serves minister photos from R2 yet (see docs/R2_FILE_MIGRATION_PLAN.md,
 * still DESIGN status), so `imageUrl` stays undefined and the avatar falls
 * back to initials, same as it already does for a minister with no photo.
 */

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
    // No photo-serving route exists yet — see module comment.
    imageUrl: undefined,
  };
}

/** Maps a `/api/ministers` list response (`{items}`) into view models, dropping anything malformed. */
export function mapMinisters(response) {
  const items = Array.isArray(response?.items) ? response.items : [];
  return items.map(mapMinister).filter(Boolean);
}
