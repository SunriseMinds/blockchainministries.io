/**
 * Platform audit repository. `audit_logs` is append-only and owned by the
 * platform — every Reellink application gets the same audit surface.
 */
import { q, nowIso, uuid, page } from '@reellink/database/d1.js';

export const auditLogs = (db) => ({
  async record({
    actorUserId = null, actorEmail = null, action, entityType = null,
    entityId = null, metadata = null, ip = null, userAgent = null,
  }) {
    const id = uuid();
    await q(db).run(
      `INSERT INTO audit_logs
         (id, actor_user_id, actor_email, action, entity_type, entity_id, metadata_json, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, actorUserId, actorEmail, action, entityType, entityId,
       metadata == null ? null : JSON.stringify(metadata), ip, userAgent, nowIso()],
    );
    return id;
  },

  list(opts) {
    const p = page(opts);
    return q(db).all(`SELECT * FROM audit_logs ORDER BY created_at DESC${p.clause}`, p.params);
  },

  listByEntity(entityType, entityId, opts) {
    const p = page(opts);
    return q(db).all(
      `SELECT * FROM audit_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC${p.clause}`,
      [entityType, entityId, ...p.params],
    );
  },
});
