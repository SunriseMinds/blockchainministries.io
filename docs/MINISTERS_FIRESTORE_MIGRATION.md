# Ministers: Firestore -> D1 migration runbook

Moves the Firebase Firestore `ministers` collection into the D1 `ministers`
table (`migrations/0001_initial_schema.sql`). The Firestore document id is
preserved as `ministers.id` because `/minister/:id` is a live public URL.

All tooling lives under `scripts/firestore/`. Every script is dry-run by
default (nothing is written until you pass `--apply`), and every write is
journaled to `.migration/*.jsonl` (gitignored) so a rerun resumes and a
rollback has an exact list of what this tooling wrote.

Old frontend Firestore fields: `name`, `title`, `bio`, `imageUrl`,
`ordinationDate`, `specialties`. The **real document shape is unknown** —
export-ministers.mjs's field inventory and transform-ministers.mjs's
unmapped-fields report are how you find out what a real export actually
contains before trusting the mapping below.

## Field mapping

| D1 column | Source | Notes |
|---|---|---|
| `id` | Firestore doc id | preserved verbatim, never regenerated |
| `display_name` | `name` \|\| `displayName` | falls back to `"Unnamed Minister"` |
| `title` | `title` | |
| `bio` | `bio` | |
| `photo_key` | derived: `ministers/<id>.<ext>` | only when `imageUrl` is present; `<ext>` from the URL, default `jpg` |
| `ordination_id` | `ordinationId` (a real FK value) | **not** `ordinationDate` — a date can't be turned into a foreign key |
| `is_published` | `1` unless `published === false` or `hidden === true` | |
| `created_at` / `updated_at` | `createdAt`/`updatedAt`, else the doc's `createTime`/`updateTime`, else now | ISO-8601 |

Not written to D1 (reported instead): `specialties`, `ordinationDate`, and
any field not in the table above. transform-ministers.mjs's report lists
every unmapped field name and how many documents carry it — check that
report against a real export; a field showing up on most/all documents may
need a schema change before cutover, which is out of this lane's scope.

## Pipeline

```
export-ministers.mjs  ->  transform-ministers.mjs  ->  import-ministers.mjs
                                    |
                                    v
                          download-photos.mjs  ->  migrate-files-r2.mjs (existing)
```

### 1. Export

Offline, from a console/gcloud export (an array of docs, or `{documents: [...]}`):
```
node scripts/firestore/export-ministers.mjs --from-file=<path-to-export.json>
```

Online, read-only against the real Firestore project (requires a service
account with `datastore.readonly`; **never run this against production
without the mission's explicit go-ahead** — this lane has no Firestore
access and has not run this path against the real project):
```
node scripts/firestore/export-ministers.mjs --project=<gcp-project-id> \
  --credentials=<service-account.json>            # or set GOOGLE_APPLICATION_CREDENTIALS
```

Writes `.migration/ministers-export.json` and a field-inventory report
(`.migration/ministers-field-inventory-<ts>.json`). Read the inventory before
moving on — it's the only way to see the real field names/types/counts.

### 2. Transform

```
node scripts/firestore/transform-ministers.mjs
```

Reads `.migration/ministers-export.json`, writes:
- `.migration/ministers-rows.json` — the D1 rows
- `.migration/ministers-photo-manifest.json` — `{id, source, target}` per photo
- a transform report with unmapped-field counts and any per-document errors

Review the unmapped-fields list before importing.

### 3. Local import + smoke test

```
npx wrangler d1 migrations apply blockchain-ministries-db --local
node scripts/firestore/import-ministers.mjs --target=local            # dry run first
node scripts/firestore/import-ministers.mjs --target=local --apply
npx wrangler d1 execute blockchain-ministries-db --local \
  --command "SELECT id, display_name, is_published FROM ministers" --json
```

### 4. Preview import + verify

```
node scripts/firestore/import-ministers.mjs --target=preview            # dry run first
node scripts/firestore/import-ministers.mjs --target=preview --apply
```
Then hit the preview deployment's `/api/ministers` and confirm the ids,
display names and photo keys look right, and that unpublished/hidden
ministers are correctly excluded if that endpoint filters on
`is_published`.

### 5. [APPROVAL] Production import

Requires a production-deploy-class approval from the mission owner (this is
a production DB write). Do not run this step without one:
```
node scripts/firestore/import-ministers.mjs --target=production --i-have-approval=<RCC approval id>
```
Without `--i-have-approval=`, the script refuses outright — this is enforced
in code (`checkProductionGuard`), not just documented.

### 6. Photos

```
node scripts/firestore/download-photos.mjs            # dry run first
node scripts/firestore/download-photos.mjs --apply
node scripts/migrate-files-r2.mjs --source=.migration/ministers-photos     # existing script, unedited
```
`download-photos.mjs` only reads source URLs and writes to local disk under
`.migration/ministers-photos/ministers/<id>.<ext>` with a sha256 alongside —
it never talks to R2 or D1. The output directory is shaped so
`migrate-files-r2.mjs`'s existing `ministers/` path classification picks it
up unchanged.

### 7. Rollback

```
node scripts/rollback-d1.mjs --target=local                                        # dry run
node scripts/rollback-d1.mjs --target=local --apply
node scripts/rollback-d1.mjs --target=preview                                      # dry run
node scripts/rollback-d1.mjs --target=preview --apply
node scripts/rollback-d1.mjs --target=production --i-have-approval=<RCC approval id>   # dry run
node scripts/rollback-d1.mjs --target=production --i-have-approval=<RCC approval id> --apply
```
Deletes ONLY the ids `import-ministers.mjs` journaled as written for that
target (`.migration/import-<target>.jsonl`), in reverse dependency order.
Rows created by real users after the import are never touched, because they
are not in the journal. `--target` defaults to `preview` if omitted — always
pass it explicitly. `--target=production` requires
`--i-have-approval=<RCC approval id>`, enforced in code, matching the
importer's guard.

**Fixed in this pass (previously broken — see git history for the earlier,
broken version):**
- `rollback-d1.mjs` used wrangler's `--param` flag, which the pinned wrangler
  version (4.114.0) does not support at all (`d1 execute --help` lists no
  `--param`). `--apply` therefore printed `Unknown argument: param` for every
  table and deleted nothing, while dry-run looked fine because it never
  shelled out. Fixed by reusing `sqlLiteral`/`inlineParams`
  (`scripts/lib/migrate-common.mjs`) to inline escaped SQL literals instead —
  the same approach `import-ministers.mjs` already used. Ids here come only
  from this tooling's own journal, never end-user input.
- `rollback-d1.mjs` had no `local` target and mapped every non-production
  target (including a would-be `local`) to wrangler's bare `--preview` flag.
  wrangler 4.x's `d1 execute` defaults to LOCAL, so bare `--preview` (no
  `--remote`) wrote to the local preview sqlite regardless of the intended
  target. Both scripts now share `d1TargetArgs()` in
  `scripts/lib/migrate-common.mjs`:
  - `local` -> `--local`
  - `preview` -> `--remote --preview` (the remote preview DB, id
    `88e30d07-1939-495a-8cf4-3088a2e8ef81`, `wrangler.jsonc`'s
    `preview_database_id`)
  - `production` -> `--remote` (bare `--remote` is produced only for
    `production`, never for `preview`)

Verified end-to-end against a **local** D1 (see the run log below): import
3 fixture rows with `--target=local --apply`, SELECT confirms 3 rows,
`rollback-d1.mjs --target=local --apply` succeeds (no `Unknown argument:
param` error), SELECT afterward confirms 0 rows.

## Verification run performed for this build

- `node --test "scripts/firestore/**/*.test.js"` — 54/54 pass: transform mapping
  and edge cases, REST pagination against a mocked `fetch`, the journal
  format cross-checked against `rollback-d1.mjs`'s own parsing rule, the
  production approval guard (import and rollback), the `d1TargetArgs`/
  `d1ExecuteArgs` mapping for all three targets plus the "`--remote` without
  `--preview` only for production" invariant, SQL literal escaping, and the
  rollback chunked-DELETE builder (escaping, 50-row chunking, empty input).
- `npm test` — 591/591 pass, including `scripts/firestore/**/*.test.js`
  (added to the `npm test` glob in `package.json`).
- `npm run lint` — the same 25 pre-existing shadcn `import/no-unresolved`
  errors, zero new ones (`.mjs` files aren't matched by `eslint.config.mjs`'s
  `**/*.js`/`**/*.jsx` globs).
- End-to-end against a **local** D1 only:
  - `npx wrangler d1 migrations apply blockchain-ministries-db --local` (all
    6 migrations already applied; confirmed idempotent).
  - export (`--from-file`, offline) -> transform -> import
    (`--target=local --apply`) against the 3-document fixture
    (`.migration/fixtures/ministers-export-fixture.json`: full document,
    `hidden` doc, empty/fallback doc) -> 3 rows inserted.
  - `SELECT id, display_name, is_published FROM ministers` confirmed the 3
    rows (`min-001` published, `min-002` unpublished/hidden, `min-003`
    fallback name, all present).
  - `node scripts/rollback-d1.mjs --target=local --apply` succeeded (no
    `--param` error); journal archived.
  - `SELECT COUNT(*) FROM ministers` afterward returned `0`.
- No Firestore access of any kind was performed. No preview or production
  reads or writes were performed (this lane has no remote D1 access at all,
  by policy — the preview/production flag mapping above is verified by unit
  test against wrangler's documented `d1 execute` flags, not by a live run).
