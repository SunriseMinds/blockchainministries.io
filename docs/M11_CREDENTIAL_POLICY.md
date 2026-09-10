# M11 — Ordination Credential Policy Contract

**Status: RATIFIED by the owner (Phase 1).** This is the authoritative policy
input for M11. Implementation must conform to it and must not extend it —
anything not decided here is *not* ministry policy and requires a new owner
decision, not an engineering guess.

Scope: Blockchain Ministries only.

## Ratified decisions

| # | Decision | Ruling |
|---|---|---|
| Q1 | **Expiration** | **None.** A credential is valid until revoked. No `expires_at`, no renewal, no grace period. |
| Q2 | **Credential number** | Format `BM-XXXXXXXX` — 8 uppercase alphanumerics. Non-sequential, opaque, safe for public display. Collision-checked before issuance. Permanent once assigned; never regenerated, including on reissue. |
| Q3 | **Name of record** | `application_json.fullName` — the name the applicant supplied under *"Your full name as it should appear on credentials."* Used on the credential **and** on public verification. `users.display_name` must **not** be substituted once a credential is issued. |
| Q4 | **Wording** | Fixed; see [Credential copy](#credential-copy) below. No claims about marriage authority or jurisdictional recognition. |
| Q5 | **Signature / seal** | No invented signature or seal. A typeset line reads *"Authorized Ministry Representative."* The renderer may leave room for future image assets; none are required now. |
| Q6 | **Revocation** | Admin-only. Internal reason **required**. Member is notified. Public verification shows **REVOKED** clearly and may show the revocation date, but **never** the reason. A revoked credential cannot be viewed or downloaded by the member. |
| Q7 | **Archival PDF / R2** | Not required. **R2 stays disabled**; no buckets, no server-side PDF generation. D1 metadata + dynamically generated credential HTML. The member prints/saves to PDF from the browser. |
| Q8 | **Reissue** | Admin-only. Preserves `credential_number`, `verify_slug`, and the original `approved_at`. Increments `credential_version`. Moves `issued_at` to the reissue timestamp. |
| Q9 | **Approval = issuance** | One action. Approving assigns the credential number, sets `issued_at`, sets `credential_version = 1`, and makes the credential immediately available. Must stay **inside the existing idempotent approval UPDATE**. |
| Q10 | **Public ministers directory** | No auto-publish. Directory integration is out of M11 scope. |
| Q11 | **XRPL** | Independent of M11. Signing/minting stays disabled and is not fixed in this milestone. The known `tx_hash` persistence defect is backlog only. |

## Credential copy

Fixed wording. Do not paraphrase.

- **Title:** Certificate of Ordination
- **Designation:** Ordained Minister
- **Body:**

  > Blockchain Ministries hereby recognizes **[Full Name]** as an Ordained
  > Minister, having completed and received approval through the ministry's
  > ordination process.
  >
  > This credential affirms their ordination through Blockchain Ministries and
  > remains valid unless formally revoked by the ministry.

- **Fields:** Date of Ordination · Credential No. · Verification (QR + public URL)
- **Footer:** Blockchain Ministries / Authorized Ministry Representative

`[Full Name]` is `application_json.fullName` (Q3), HTML-escaped at render time.

## Derived engineering rules

These follow directly from the rulings above and are binding on implementation:

1. **`issued_at IS NOT NULL`** is the authoritative "has a credential been
   issued" test — not `credential_number`, and not `status`.
2. **Availability** is `issued_at IS NOT NULL AND revoked_at IS NULL`. The
   existing `credential_available` boolean on `GET /api/ordination/mine` takes
   this meaning, replacing `Boolean(credential_r2_key)`. Field name and type do
   not change, so no client contract breaks.
3. **Revocation is orthogonal to `status`.** `status` keeps its original CHECK
   (`pending`/`approved`/`rejected`) from the frozen 0001; revocation lives in
   `revoked_at`. This mirrors how `memberships` separates `application_status`
   from `payment_status`.
4. **A revoked credential verifies AS REVOKED**, never as "not found" (Q6) —
   otherwise third parties cannot distinguish revocation from a bad code.
5. **`verify_slug` is immutable** for the life of the ordination. It is a public
   URL that may be printed on a credential (risk R-13,
   `docs/MIGRATION_RISK_REGISTER.md`).
6. **No shared-package changes.** `packages/*` are `@reellink/*` platform
   packages consumed by other projects in this monorepo. M11 lands entirely in
   `worker/`, `src/`, and `migrations/`.
7. **`credential_r2_key` stays** — unchanged and unused. It is a forward hook if
   Q7 is ever revisited, not a live field.

## Open items deliberately NOT decided

Nothing further is authorized. In particular, no policy exists yet for:
member-initiated reissue requests, credential design/branding beyond the fixed
copy above, ministry seal or signature imagery, or directory publication. Each
requires a fresh owner decision.

## Related

- `migrations/0003_ordination_credentials.sql` — schema encoding this contract
- `docs/MIGRATION_RISK_REGISTER.md` — R-13 (`verify_slug` is a public contract)
