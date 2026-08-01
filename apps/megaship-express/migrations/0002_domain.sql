-- Megaship Express domain schema.
--
-- This is the schema ALREADY LIVE in `megaship-express-leads`, captured here so
-- new environments (preview/dev) can be built identically. It is written with
-- IF NOT EXISTS so applying it to production is a safe no-op — production
-- tables and their records are never recreated, altered or dropped.
--
-- Applied AFTER the platform migrations:
--   packages/auth/migrations/0001_identity.sql
--   packages/security/migrations/0001_audit.sql
--
-- Note: these tables predate the platform and use INTEGER AUTOINCREMENT keys
-- with their own business identifiers (quote_id, invoice_number,
-- receipt_number). That is deliberate — adopting the real schema beats
-- rewriting live data to match a convention.

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  contact_name TEXT NOT NULL,
  company TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  service TEXT NOT NULL,
  package_type TEXT NOT NULL,
  weight_kg REAL, length_cm REAL, width_cm REAL, height_cm REAL,
  contents TEXT,
  pickup_address1 TEXT NOT NULL, pickup_address2 TEXT,
  pickup_city TEXT NOT NULL, pickup_state TEXT NOT NULL, pickup_postal TEXT NOT NULL,
  pickup_datetime TEXT,
  dropoff_address1 TEXT NOT NULL, dropoff_address2 TEXT,
  dropoff_city TEXT NOT NULL, dropoff_state TEXT NOT NULL, dropoff_postal TEXT NOT NULL,
  dropoff_deadline TEXT,
  notes TEXT, ip TEXT, user_agent TEXT, country TEXT,
  email_status TEXT NOT NULL DEFAULT 'pending', email_error TEXT,
  internal_notes TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_email      ON quotes (email);
CREATE INDEX IF NOT EXISTS idx_quotes_ip_created ON quotes (ip, created_at);
CREATE INDEX IF NOT EXISTS idx_quotes_status     ON quotes (status);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL UNIQUE,
  quote_id TEXT,
  created_at TEXT NOT NULL, updated_at TEXT,
  issue_date TEXT NOT NULL, due_date TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  customer_name TEXT NOT NULL, customer_email TEXT NOT NULL, customer_phone TEXT,
  billing_address1 TEXT, billing_address2 TEXT,
  billing_city TEXT, billing_state TEXT, billing_postal TEXT,
  service_summary TEXT,
  line_items TEXT NOT NULL DEFAULT '[]',
  currency TEXT NOT NULL DEFAULT 'USD',
  subtotal REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  notes TEXT, terms TEXT,
  sent_at TEXT, viewed_at TEXT, paid_at TEXT,
  created_by TEXT, cancelled_at TEXT, archived_at TEXT, pending_since TEXT
);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_email   ON invoices (customer_email);
CREATE INDEX IF NOT EXISTS idx_invoices_quote   ON invoices (quote_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status  ON invoices (status);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT NOT NULL,
  created_at TEXT NOT NULL,
  amount REAL NOT NULL,
  method TEXT, reference TEXT, note TEXT,
  provider TEXT, provider_order_id TEXT, provider_transaction_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice      ON payments (invoice_number);
CREATE INDEX IF NOT EXISTS idx_payments_provider_txn ON payments (provider_transaction_id);

CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  receipt_number TEXT NOT NULL UNIQUE,
  invoice_number TEXT NOT NULL,
  created_at TEXT NOT NULL,
  amount REAL NOT NULL,
  payment_method TEXT,
  emailed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_receipts_invoice ON receipts (invoice_number);
