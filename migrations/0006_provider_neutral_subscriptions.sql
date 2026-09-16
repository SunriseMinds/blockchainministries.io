-- Migration 0006: provider-neutral subscriptions (M14.5B).
--
-- 0001-0005 remain frozen and untouched.
--
-- WHY A REBUILD AND NOT ALTER TABLE
-- Three separate properties of the Stripe-only table make a PayPal
-- subscription literally unrepresentable, and SQLite can alter none of them
-- in place:
--
--   stripe_subscription_id TEXT NOT NULL UNIQUE
--     A PayPal subscription has no Stripe id. NOT NULL cannot be dropped by
--     ALTER TABLE.
--   stripe_customer_id TEXT NOT NULL
--     PayPal has no equivalent that is always present. Same problem.
--   status CHECK (... 'active','past_due','cancelled','incomplete')
--     PayPal adds SUSPENDED and EXPIRED. SQLite cannot alter a CHECK, and
--     widening it to free text would abandon the closed vocabulary that stops
--     a typo from inventing a billing state.
--
-- So the documented table-rebuild — create, copy, drop, rename — is the only
-- correct route, exactly as in 0005.
--
-- WHY NO `PRAGMA foreign_keys = OFF`
-- That pragma is needed only when OTHER tables hold foreign keys INTO the
-- table being rebuilt. Nothing references `subscriptions`: it is a leaf.
-- Verified by searching every migration AND the whole repository for
-- "REFERENCES subscriptions" — no match. Its own outbound reference to
-- users(id) is satisfied by the copied rows, which are the same rows that
-- already satisfied it.
--
-- That matters because D1 executes migrations over HTTP, and whether a
-- connection-scoped pragma survives into the same execution context is a
-- property of the platform, not of SQL. This migration does not need to find
-- out: it is correct with foreign keys ON, which is how D1 runs.
--
-- WHAT CHANGES, AND WHY EACH
--   provider                     NEW. The closed set of RATIFIED recurring
--                                rails and no more. DEFAULT 'stripe' so the
--                                copy below is unambiguous even though it
--                                names the value explicitly.
--   stripe_subscription_id
--     -> provider_subscription_id  Same column, same UNIQUE guarantee, honest
--                                name. UNIQUE is retained because it is what
--                                makes a redelivered lifecycle webhook a true
--                                no-op. It is global rather than per-provider:
--                                a Stripe id ("sub_...") and a PayPal id
--                                ("I-...") cannot collide in practice, and a
--                                global UNIQUE is the stronger guarantee.
--   stripe_customer_id
--     -> provider_customer_id      Now NULLABLE. Stripe always has a customer
--                                id; PayPal's subscriber is not the same kind
--                                of object and need not be stored to operate
--                                the rail. Forcing a placeholder into a
--                                NOT NULL column would put a lie in the
--                                database.
--   status                       CHECK widened by exactly two values,
--                                'suspended' and 'expired', which are
--                                PayPal's own documented lifecycle states
--                                (BILLING.SUBSCRIPTION.SUSPENDED / .EXPIRED).
--                                Nothing else is added.
--   last_event_id /
--   last_event_created           Carried over from 0004 unchanged. They are
--                                declared in the table body here rather than
--                                appended by ALTER, so the rebuilt schema
--                                reads in a sensible order.
--
-- ORDERING-UNIT NOTE (important, and enforced in the repository, not here):
-- `last_event_created` is an INTEGER whose UNIT is provider-specific —
-- Stripe's `event.created` is epoch SECONDS, PayPal's `create_time` is parsed
-- to epoch MILLISECONDS. That is safe because a comparison only ever happens
-- within ONE subscription row, and a row belongs to exactly one provider.
-- worker/db/repositories.js additionally refuses any event whose provider
-- disagrees with the stored row, so the units can never meet.
--
-- Both original indexes are recreated, plus one on `provider` so an
-- operational query can scope to a rail without a table scan.

CREATE TABLE subscriptions_new (
  id                       TEXT PRIMARY KEY,
  user_id                  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider                 TEXT NOT NULL DEFAULT 'stripe'
                             CHECK (provider IN ('stripe','paypal')),
  -- The provider's own subscription identifier. UNIQUE across every rail.
  provider_subscription_id TEXT NOT NULL UNIQUE,
  -- Stripe's customer id, or NULL. Not every rail has such an object.
  provider_customer_id     TEXT,
  status                   TEXT NOT NULL
                             CHECK (status IN ('active','past_due','cancelled',
                                               'incomplete','suspended','expired')),
  current_period_end       TEXT,
  -- M14.2 ordering metadata. See the unit note above.
  last_event_id            TEXT,
  last_event_created       INTEGER,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

-- Every existing row is Stripe, so the mapping is total and lossless: ids,
-- statuses, billing period, BOTH M14.2 ordering columns, both timestamps and
-- the user foreign key are copied verbatim; two columns are renamed in place
-- and one constant is introduced.
INSERT INTO subscriptions_new
  (id, user_id, provider, provider_subscription_id, provider_customer_id,
   status, current_period_end, last_event_id, last_event_created,
   created_at, updated_at)
SELECT
   id, user_id, 'stripe', stripe_subscription_id, stripe_customer_id,
   status, current_period_end, last_event_id, last_event_created,
   created_at, updated_at
FROM subscriptions;

DROP TABLE subscriptions;
ALTER TABLE subscriptions_new RENAME TO subscriptions;

CREATE INDEX idx_subscriptions_user     ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status   ON subscriptions(status);
CREATE INDEX idx_subscriptions_provider ON subscriptions(provider);
