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
node scripts/rollback-d1.mjs --target=<local|preview|production>          # dry run first
node scripts/rollback-d1.mjs --target=<local|preview|production> --apply
```
This is the existing, unedited `scripts/rollback-d1.mjs` — import-ministers.mjs
writes its journal lines as exactly `{status:"ok", table:"ministers", id}`
so rollback reads it with no changes.

**Known limitation, verified during this build, not fixed here (out of
scope: `scripts/rollback-d1.mjs` is frozen for this lane):** the installed
wrangler version (4.114.0, per `package-lock.json`) has no `--param` flag on
`d1 execute` at all (`wrangler d1 execute --help` lists none). `rollback-d1.mjs`
and the pre-existing `migrate-files-r2.mjs` both call `d1 execute ... --param`,
so `rollback-d1.mjs --target=local --apply` prints `X [ERROR] Unknown
argument: param` for every table and does NOT actually delete rows (verified
live against a local D1: rows survived a rollback --apply attempt). Its
dry-run mode works everywhere, including `--target=local`, because it never
shells out to wrangler. `import-ministers.mjs` (this lane, in scope) works
around the same wrangler behavior by inlining escaped SQL literals instead
of `--param` (see `sqlLiteral`/`inlineParams` in `import-ministers.mjs`) —
verified end-to-end against a local D1. Fixing `rollback-d1.mjs` itself
needs the owning lane; flagged in `result.json`'s `handoff`.

Also note: `rollback-d1.mjs` maps every non-production target (including
`local`) to wrangler's `--preview` flag, not `--local` — another reason its
`--apply` path needs the owning lane's attention before it can be trusted
against a local DB.

## Verification run performed for this build

- `node --test scripts/firestore/*.test.js` — 40/40 pass (transform mapping
  and edge cases, REST pagination against a mocked `fetch`, the journal
  format cross-checked against `rollback-d1.mjs`'s own parsing rule, the
  production approval guard, SQL literal escaping).
- `npm test` — 537/537 pass (unaffected; scripts/firestore is not in this
  glob, by design — see `handoff` in `result.json`).
- `npm run lint` — the same 25 pre-existing shadcn `import/no-unresolved`
  errors, zero new ones (`.mjs` files aren't matched by `eslint.config.mjs`'s
  `**/*.js`/`**/*.jsx` globs).
- End-to-end against a **local** D1 only: applied all 6 migrations with
  `--local`, ran export (`--from-file`, offline) -> transform -> import
  (`--target=local --apply`) against a 3-document fixture
  (`.migration/fixtures/ministers-export-fixture.json`, covers: full
  document, `hidden` doc, and an empty/fallback doc), queried the rows back,
  and exercised `rollback-d1.mjs --target=local` (dry-run: correct; apply:
  fails as documented above, rows unaffected).
- No Firestore access of any kind was performed. No preview or production
  writes were performed.
