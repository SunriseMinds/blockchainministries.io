# R2 File Migration Plan

**Status: DESIGN.** No buckets created, no files moved.

## ⚠️ Blocking unknown: where the files are today
The schema references files — `scrolls.pdf_path` (NOT NULL) and `ordinations.credential_pdf_path` —
but:
- **No Supabase Storage client call exists anywhere in the frontend.**
- Supabase Storage buckets **could not be listed** (no storage tool available; SQL not permitted).

So the physical location of scroll PDFs and ordination credential PDFs is **unknown**. Possibilities:
Supabase Storage, the old Hostinger filesystem, generated on demand (`pdf-lib` and `html2canvas`
are dependencies — credentials may be generated client-side and never persisted), or not yet
existing at all.

**Owner action required before this plan can execute:**
1. Dashboard → Storage: list buckets and object counts, or run
   `SELECT id, name, public FROM storage.buckets;`
2. Inspect actual values: `SELECT id, title, pdf_path FROM public.scrolls LIMIT 20;` — the format
   (URL vs path vs key) reveals the backing store.
3. Confirm whether ordination credential PDFs are stored or generated per request.

## Target buckets
| Bucket | Binding | Contents | Access |
|---|---|---|---|
| `bm-public` | `PUBLIC_FILES` | published scrolls, minister photos, brand assets, OG images | world-readable via Worker |
| `bm-protected` | `PROTECTED_FILES` | ordination credential PDFs, member-only scrolls | **never public** |

## Key convention
```
bm-public/
  scrolls/<scroll_id>.pdf
  ministers/<minister_id>.jpg
  brand/eft-logo.png            # referenced by public/.well-known/xrp-ledger.toml
bm-protected/
  credentials/<ordination_id>.pdf
  scrolls-member/<scroll_id>.pdf
```
D1 stores the key only (`scrolls.r2_key`, `ordinations.credential_r2_key`, `ministers.photo_key`) —
never a full URL, so the storage host can change without a data migration.

## Access model
**Public objects** — `GET /api/files/public/:key` streams from `PUBLIC_FILES` with
`Cache-Control: public, max-age=31536000, immutable` for content-addressed keys. Serving through
the Worker (rather than enabling public bucket access) keeps headers and future authorization
consistent.

**Protected objects** — bucket has **no public access**. Flow:
1. Browser requests `GET /api/files/protected/:key`.
2. Worker validates the session cookie against `sessions`.
3. Worker checks entitlement in D1:
   - `credentials/<ordination_id>.pdf` → requester owns that ordination **and** it is `approved`, or requester is admin.
   - `scrolls-member/<scroll_id>.pdf` → scroll `visibility='member'` **and** requester has an `approved` membership, or admin.
4. On success, stream via `env.PROTECTED_FILES.get(key)`; on failure return **404** (not 403 — do
   not confirm existence).
5. Write an `audit_logs` entry (`file.download`).

Never issue long-lived public URLs for protected content. `Cache-Control: private, no-store` on
protected responses.

## Note on `xrp-ledger.toml`
`public/.well-known/xrp-ledger.toml` advertises
`logo_uri = https://blockchainministries.io/images/eft-logo.png`, but **no `images/` directory
exists in the repo** — that URL currently 404s. Migrating the logo to
`bm-public/brand/eft-logo.png` and serving it at that path fixes an existing broken reference.
(Out of scope for Phase 2 design; noted for the backlog.)

## Migration steps (after the blocking unknown is resolved)
1. Create buckets `bm-public`, `bm-protected` (no public access on the latter).
2. Add bindings to `wrangler.jsonc`.
3. Inventory source objects; produce a `source → target key` manifest.
4. **Owner classifies each scroll**: `public` / `member` / `admin` (Supabase had no such column;
   default `public` preserves today's behavior).
5. Upload: public objects → `bm-public`, protected → `bm-protected`.
6. Backfill `scrolls.r2_key`, `scrolls.visibility`, `ordinations.credential_r2_key`.
7. Validate (below).
8. Keep the original source intact until after the soak period — **do not delete anything.**

## Validation
| # | Check |
|---|---|
| R1 | Every `scrolls.r2_key` resolves to an existing object |
| R2 | Every non-null `ordinations.credential_r2_key` resolves |
| R3 | Object count and total bytes match the manifest |
| R4 | Checksums match for a sampled subset |
| R5 | **A protected key is NOT retrievable without a session** (anonymous request → 404) |
| R6 | A member cannot fetch another member's credential (→ 404) |
| R7 | An admin can fetch any protected object |
| R8 | Public objects load anonymously with correct `Content-Type` and cache headers |

R5 and R6 are the security-critical tests — run them before any cutover.

## Open questions for the owner
- Where do the PDFs live today? (blocks everything above)
- Are ordination credentials stored, or generated on demand with `pdf-lib`?
- Which scrolls are public vs member-only vs admin-only?
- Should protected downloads be watermarked or expiring?
- Retention/backup policy for `bm-protected`?
