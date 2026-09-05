# Firebase Inventory

Firebase remains **temporarily** in place for the ministers directory, per owner instruction. This
documents the full extent of the dependency so it can be migrated separately later.

## Project configuration
`src/lib/firebase.js` — hard-coded web config (not secret; Firebase web API keys are public
identifiers, secured by Security Rules, not by obscurity):

| Field | Value |
|---|---|
| `projectId` | `blockchainministries-io` |
| `authDomain` | `blockchainministries-io.firebaseapp.com` |
| `storageBucket` | `blockchainministries-io.appspot.com` |
| `messagingSenderId` | `375405039719` |
| `apiKey` | `AIzaSyB1cW9PGLeyW_y1kZAQy5CySjHH-6UVvK` (public) |

Initializes and exports:
```js
export const auth = getAuth(app);   // exported but NEVER used
export const db   = getFirestore(app);
```

## Actual usage — 2 files, read-only

| File | Call | Target |
|---|---|---|
| `src/pages/Ministers.jsx:18-19` | `getDocs(collection(db, 'ministers'))` | list all ministers |
| `src/pages/MinisterProfile.jsx:22-23` | `getDoc(doc(db, 'ministers', ministerId))` | single minister by id |

**That is the entire dependency.** One collection, `ministers`. Read-only — no writes, no deletes,
no Firebase Auth, no Firebase Storage usage anywhere in the codebase.

## Notes & findings

**Two parallel identity systems.** `getAuth(app)` is exported but never consumed; all
authentication is Supabase. Firebase Auth is effectively dormant — confirm no other client (mobile
app, admin tool) relies on it before decommissioning.

**Document shape is NOT RETRIEVED.** No Firebase MCP tooling is available in this environment and
outbound network is blocked, so the `ministers` document fields, document count, and Security
Rules could not be read. The frontend renders whatever fields exist. To retrieve:
- Console → Firestore → `ministers` (fields + count)
- Console → Firestore → Rules (must confirm public read is intended)

**Security Rules unknown.** Since the collection is read from an unauthenticated public page, rules
presumably allow public read. If they instead allow public **write**, that is a live exposure.
Confirm in the console.

**Bundle cost.** The `firebase` package (^10.7.1) is a heavy dependency retained for one read-only
collection — it is the dominant contributor to the ~297 KB `avatar-*.js` chunk observed in builds.
Removing it after migration is a meaningful performance win.

## Future migration (NOT part of Phase 2)
When the owner approves, `ministers` maps cleanly to a D1 table — already included in the proposed
Phase 2B schema so the seam exists ahead of time:

```sql
CREATE TABLE ministers (
  id           TEXT PRIMARY KEY,      -- preserve Firestore document id (public URLs use it)
  display_name TEXT NOT NULL,
  title        TEXT,
  bio          TEXT,
  photo_key    TEXT,                  -- R2 bm-public object key
  ordination_id TEXT REFERENCES ordinations(id),
  is_published INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX idx_ministers_published ON ministers(is_published);
```

Migration outline (later phase): export via Firebase Admin SDK → transform documents to rows →
upload photos to `bm-public` → import to D1 → repoint `Ministers.jsx` / `MinisterProfile.jsx` at
`GET /api/ministers` and `GET /api/ministers/:id` → remove the `firebase` dependency.

**Preserve Firestore document ids** — `/minister/:ministerId` URLs are public and must not break.

## Status
- ✅ Keep Firebase operational for now.
- ❌ Do not migrate, modify, or remove in Phase 2.
- 📋 Owner action: confirm Firestore Security Rules and whether any non-web client uses Firebase Auth.
