-- Migration 0005: provider-neutral donations + XRPL donation intents (M14.3).
--
-- 0001, 0002, 0003 and 0004 remain frozen and untouched.
--
-- WHY A REBUILD AND NOT ALTER TABLE
-- `donations.provider` carries CHECK (provider IN ('stripe')). SQLite cannot
-- alter a CHECK constraint, and weakening it to free text would abandon the
-- closed vocabulary that keeps a typo from inventing a payment rail. The only
-- correct route is the documented table-rebuild: create, copy, drop, rename.
--
-- WHY NO `PRAGMA foreign_keys = OFF`
-- That pragma is required only when OTHER tables hold foreign keys INTO the
-- table being rebuilt — dropping it would otherwise orphan them. Nothing in
-- this schema references `donations`: it is a leaf. Its own outbound
-- reference to users(id) is satisfied by the copied rows, which are the same
-- rows that already satisfied it. Verified by searching every migration for
-- "REFERENCES donations" — no match.
--
-- That matters because D1 executes migrations over HTTP, and whether a
-- connection-scoped pragma survives into the same execution context is a
-- property of the platform, not of SQL. This migration does not need to find
-- out: it is correct with foreign keys ON, which is how D1 runs.
--
-- WHAT CHANGES, AND WHY EACH
--   provider           CHECK widened to the three RATIFIED rails and no more.
--   stripe_event_id -> provider_event_id
--                      Same column, same UNIQUE guarantee, honest name. It is
--                      the idempotency key for every rail: Stripe's event.id,
--                      PayPal's webhook event id, and an XRPL transaction
--                      hash are each globally unique and immutable.
--   provider_charge_id -> provider_txn_id
--                      One provider-neutral reference rather than a column
--                      per rail (capture id, sale id, tx hash).
--   receipt_url     -> reference_url
--                      An XRPL explorer link is not a receipt. Keeping the
--                      old name would have made the schema state something
--                      untrue about two of the three rails.
--   amount_cents       Now NULLABLE — it is meaningless for XRP.
--   amount_drops       NEW. XRP is denominated in drops (1e-6 XRP), not
--                      cents. Forcing XRP into a cents column would silently
--                      misrepresent every ledger amount by six orders of
--                      magnitude. Ratified: keep the units apart.
--   CHECK chk_amount_units
--                      Makes the mixed-unit error unrepresentable: a fiat row
--                      must carry cents and no drops; an XRPL row must carry
--                      drops, no cents, and currency 'XRP'.
--   xrpl_destination_tag / xrpl_ledger_index
--                      The minimum durable reconciliation state. NOTHING
--                      secret: no seed, no key, no signed blob, no raw
--                      ledger payload.
--
-- All three original indexes are recreated; the charge index follows the
-- renamed column.
--
-- donation_intents is new: a destination tag reserved for an expected gift,
-- so an incoming XRPL payment can be attributed to a donor. The XRPL
-- verification flow itself is NOT implemented here.

CREATE TABLE donations_new (
  id                   TEXT PRIMARY KEY,
  -- NULL means anonymous (a gift given without signing in) OR unattributed
  -- (an XRPL payment that arrived with no tag, or a tag we cannot match).
  -- Both are real money the ministry received and must remain visible.
  user_id              TEXT REFERENCES users(id) ON DELETE SET NULL,
  provider             TEXT NOT NULL CHECK (provider IN ('stripe','paypal','xrpl')),
  -- Idempotency key across every rail. UNIQUE is what makes a redelivered
  -- webhook, or a twice-seen ledger transaction, a true no-op.
  provider_event_id    TEXT NOT NULL UNIQUE,
  -- The provider's own authoritative transaction reference.
  provider_txn_id      TEXT,
  amount_cents         INTEGER,
  amount_drops         INTEGER,
  currency             TEXT NOT NULL DEFAULT 'usd',
  status               TEXT NOT NULL,
  -- Stripe receipt URL, PayPal reference, or XRPL explorer URL. Public and
  -- safe by construction — never a private dashboard link.
  reference_url        TEXT,
  xrpl_destination_tag INTEGER,
  xrpl_ledger_index    INTEGER,
  created_at           TEXT NOT NULL,

  CONSTRAINT chk_amount_units CHECK (
    (provider IN ('stripe','paypal')
       AND amount_cents IS NOT NULL AND amount_cents >= 0
       AND amount_drops IS NULL)
    OR
    (provider = 'xrpl'
       AND amount_drops IS NOT NULL AND amount_drops >= 0
       AND amount_cents IS NULL
       AND currency = 'XRP')
  ),
  -- A destination tag is a 32-bit unsigned integer on the XRP Ledger.
  CONSTRAINT chk_xrpl_tag CHECK (
    xrpl_destination_tag IS NULL
    OR (provider = 'xrpl' AND xrpl_destination_tag BETWEEN 0 AND 4294967295)
  )
);

-- Every existing row is Stripe fiat, so the mapping is total and lossless:
-- ids, timestamps, amounts, currency, status and the user foreign key are
-- copied verbatim; only three columns are renamed in place.
INSERT INTO donations_new
  (id, user_id, provider, provider_event_id, provider_txn_id,
   amount_cents, amount_drops, currency, status, reference_url,
   xrpl_destination_tag, xrpl_ledger_index, created_at)
SELECT
   id, user_id, provider, stripe_event_id, provider_charge_id,
   amount_cents, NULL, currency, status, receipt_url,
   NULL, NULL, created_at
FROM donations;

DROP TABLE donations;
ALTER TABLE donations_new RENAME TO donations;

CREATE INDEX idx_donations_user    ON donations(user_id);
CREATE INDEX idx_donations_created ON donations(created_at);
CREATE INDEX idx_donations_txn     ON donations(provider_txn_id);

-- ---------------------------------------------------------------- intents --
-- A destination tag reserved for one expected XRP gift, so a payment arriving
-- at the ministry address can be attributed to the donor who intended it.
--
-- `destination_tag` is UNIQUE GLOBALLY and never reused, not merely unique
-- among open intents. A tag that has expired can still receive a late
-- payment — the donor's wallet does not know about our expiry — and reusing
-- it would credit that money to the wrong person. Tags are cheap; there are
-- over four billion.
--
-- Double confirmation is prevented by the status transition in the
-- repository (UPDATE ... WHERE status = 'open' changes 0 rows on a retry),
-- reinforced by the CHECK below, which makes a confirmed row without its
-- evidence, or an unconfirmed row carrying evidence, unrepresentable.
CREATE TABLE donation_intents (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT REFERENCES users(id) ON DELETE SET NULL,
  provider              TEXT NOT NULL DEFAULT 'xrpl' CHECK (provider IN ('xrpl')),
  destination_tag       INTEGER NOT NULL UNIQUE
                          CHECK (destination_tag BETWEEN 0 AND 4294967295),
  expected_amount_drops INTEGER CHECK (expected_amount_drops IS NULL OR expected_amount_drops > 0),
  currency              TEXT NOT NULL DEFAULT 'XRP' CHECK (currency = 'XRP'),
  status                TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','confirmed','expired')),
  expires_at            TEXT NOT NULL,
  created_at            TEXT NOT NULL,
  confirmed_at          TEXT,
  -- The ledger transaction hash that satisfied this intent. Matches
  -- donations.provider_event_id for the resulting donation row.
  provider_event_id     TEXT,

  CONSTRAINT chk_intent_confirmation CHECK (
    (status = 'confirmed' AND confirmed_at IS NOT NULL AND provider_event_id IS NOT NULL)
    OR
    (status <> 'confirmed' AND confirmed_at IS NULL AND provider_event_id IS NULL)
  )
);

CREATE INDEX idx_intents_status  ON donation_intents(status);
CREATE INDEX idx_intents_user    ON donation_intents(user_id);
CREATE INDEX idx_intents_expires ON donation_intents(expires_at);
