# R2 Storage Plan — Blockchain Ministries

> **Status: DESIGN / PROPOSAL.** No R2 buckets created. No files moved.

## What needs object storage
| Asset class | Source today | Sensitivity | Access |
|---|---|---|---|
| Sacred scroll PDFs | TBD (no Supabase Storage calls found; likely external or not yet wired) | Some public, some member/protected | Mixed |
| Minister / profile images | Firebase/Firestore data (temporary) | Public | Public read |
| Site imagery (e.g. `eft-logo.png` referenced in `xrp-ledger.toml`) | Not present in `public/` | Public | Public read |
| Protected documents (credentials, certificates) | TBD | Private | Signed/authorized only |

## Proposed buckets
1. **`bm-public`** — publicly readable assets (logos, published scroll previews,
   OG images). Optionally front with a custom domain / Cache.
2. **`bm-protected`** — member/admin-only documents (full scroll PDFs, certificates).
   **No public access**; served only through a Worker that checks the session.

## Access model
- **Public objects:** either enable public access on `bm-public` or serve via a
  Worker route with long-cache headers. Prefer Worker-fronted for consistent headers.
- **Protected objects:** never public. Flow:
  1. Frontend requests `GET /api/scrolls/:id/download`.
  2. Worker verifies session + entitlement (membership/ordination/role).
  3. Worker streams the object from `bm-protected` (via `R2` binding) **or** returns
     a short-lived signed URL. Streaming through the Worker is simplest and keeps the
     bucket fully private.
- **Uploads (admin):** `POST /api/admin/scrolls` (admin only) writes the PDF to
  `bm-protected` and stores the `r2_key` on the `scrolls` row (see schema map).

## Key/layout convention
```
bm-public/
  logos/eft-logo.png
  og/og-image.png
bm-protected/
  scrolls/<scroll_id>.pdf
  certificates/<ordination_id>.pdf
```

## Wrangler binding (illustrative — not yet added)
```
[[r2_buckets]]
binding = "R2_PUBLIC"
bucket_name = "bm-public"

[[r2_buckets]]
binding = "R2_PROTECTED"
bucket_name = "bm-protected"
```

## Migration steps (later phase)
1. Inventory where scroll PDFs and images currently live (confirm with owner —
   the export gives no storage endpoint).
2. Create buckets; upload public assets to `bm-public`, protected docs to `bm-protected`.
3. Backfill `scrolls.r2_key`.
4. Validate every published/protected record resolves to an existing object.
5. Verify protected objects are **not** reachable without a valid session.

## Open questions for owner
- Where are the scroll PDFs today? (No storage client is present in the frontend.)
- Which scrolls are public vs. member-only vs. admin-only?
- Should downloads be watermarked/expiring?
