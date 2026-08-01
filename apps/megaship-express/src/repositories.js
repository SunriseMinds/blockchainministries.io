/**
 * Megaship Express — domain repositories.
 *
 * These map to the EXISTING production schema in `megaship-express-leads`
 * (quotes / invoices / payments / receipts). The schema was adopted as-is;
 * no table was recreated or altered, so live records remain untouched.
 *
 * Note: these tables use INTEGER AUTOINCREMENT primary keys and carry their
 * own business identifiers (quote_id, invoice_number, receipt_number), which
 * is why they do not follow the platform's TEXT-uuid convention.
 */
import { q, page, nowIso, defineRepos } from '@reellink/database/d1.js';
import { authRepos } from '@reellink/auth/repositories.js';
import { auditLogs } from '@reellink/security/audit-repo.js';

/* ----------------------------------------------------------------- quotes -- */
const quotes = (db) => ({
  byQuoteId: (quoteId) => q(db).first('SELECT * FROM quotes WHERE quote_id = ?', [quoteId]),

  list({ status, ...opts } = {}) {
    const p = page(opts);
    if (status) {
      return q(db).all(
        `SELECT * FROM quotes WHERE status = ? ORDER BY created_at DESC${p.clause}`,
        [status, ...p.params],
      );
    }
    return q(db).all(`SELECT * FROM quotes ORDER BY created_at DESC${p.clause}`, p.params);
  },

  async create(quote) {
    const ts = nowIso();
    await q(db).run(
      `INSERT INTO quotes (
         quote_id, created_at, updated_at, status,
         contact_name, company, email, phone,
         service, package_type, weight_kg, length_cm, width_cm, height_cm, contents,
         pickup_address1, pickup_address2, pickup_city, pickup_state, pickup_postal, pickup_datetime,
         dropoff_address1, dropoff_address2, dropoff_city, dropoff_state, dropoff_postal, dropoff_deadline,
         notes, ip, user_agent, country, email_status
       ) VALUES (?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        quote.quoteId, ts, ts,
        quote.contactName, quote.company, quote.email, quote.phone,
        quote.service, quote.packageType, quote.weightKg, quote.lengthCm, quote.widthCm, quote.heightCm, quote.contents,
        quote.pickupAddress1, quote.pickupAddress2, quote.pickupCity, quote.pickupState, quote.pickupPostal, quote.pickupDatetime,
        quote.dropoffAddress1, quote.dropoffAddress2, quote.dropoffCity, quote.dropoffState, quote.dropoffPostal, quote.dropoffDeadline,
        quote.notes, quote.ip, quote.userAgent, quote.country,
      ],
    );
    return quote.quoteId;
  },

  /** Idempotent transition: changes 0 rows if the status already matches. */
  async setStatus(quoteId, status) {
    const meta = await q(db).run(
      'UPDATE quotes SET status = ?, updated_at = ? WHERE quote_id = ? AND status != ?',
      [status, nowIso(), quoteId, status],
    );
    return (meta.changes ?? 0) === 1;
  },

  setInternalNotes: (quoteId, notes) =>
    q(db).run('UPDATE quotes SET internal_notes = ?, updated_at = ? WHERE quote_id = ?', [notes, nowIso(), quoteId]),

  markEmail: (quoteId, status, error = null) =>
    q(db).run('UPDATE quotes SET email_status = ?, email_error = ? WHERE quote_id = ?', [status, error, quoteId]),

  /** Abuse signal: how many quotes has this IP filed recently? */
  countRecentByIp: (ip, sinceIso) =>
    q(db).value('SELECT COUNT(*) FROM quotes WHERE ip = ? AND created_at > ?', [ip, sinceIso]),
});

/* --------------------------------------------------------------- invoices -- */
const invoices = (db) => ({
  byNumber: (invoiceNumber) => q(db).first('SELECT * FROM invoices WHERE invoice_number = ?', [invoiceNumber]),

  list({ status, ...opts } = {}) {
    const p = page(opts);
    if (status) {
      return q(db).all(
        `SELECT * FROM invoices WHERE status = ? ORDER BY created_at DESC${p.clause}`,
        [status, ...p.params],
      );
    }
    return q(db).all(`SELECT * FROM invoices ORDER BY created_at DESC${p.clause}`, p.params);
  },

  /** A customer may only ever see their own invoices. */
  listByEmail: (email, opts) => {
    const p = page(opts);
    return q(db).all(
      `SELECT invoice_number, issue_date, due_date, status, currency, total, amount_paid, paid_at
         FROM invoices WHERE customer_email = ? ORDER BY created_at DESC${p.clause}`,
      [email, ...p.params],
    );
  },

  async create(inv) {
    const ts = nowIso();
    await q(db).run(
      `INSERT INTO invoices (
         invoice_number, quote_id, created_at, updated_at, issue_date, due_date, status,
         customer_name, customer_email, customer_phone,
         billing_address1, billing_address2, billing_city, billing_state, billing_postal,
         service_summary, line_items, currency,
         subtotal, discount_amount, tax_rate, tax_amount, total, amount_paid,
         notes, terms, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        inv.invoiceNumber, inv.quoteId, ts, ts, inv.issueDate, inv.dueDate,
        inv.customerName, inv.customerEmail, inv.customerPhone,
        inv.billingAddress1, inv.billingAddress2, inv.billingCity, inv.billingState, inv.billingPostal,
        inv.serviceSummary, inv.lineItems, inv.currency,
        inv.subtotal, inv.discountAmount, inv.taxRate, inv.taxAmount, inv.total,
        inv.notes, inv.terms, inv.createdBy,
      ],
    );
    return inv.invoiceNumber;
  },

  /** Idempotent status transition from an expected state. */
  async transition(invoiceNumber, fromStatus, toStatus, extraColumn = null) {
    const sets = ['status = ?', 'updated_at = ?'];
    const params = [toStatus, nowIso()];
    if (extraColumn) { sets.push(`${extraColumn} = ?`); params.push(nowIso()); }
    params.push(invoiceNumber, fromStatus);
    const meta = await q(db).run(
      `UPDATE invoices SET ${sets.join(', ')} WHERE invoice_number = ? AND status = ?`,
      params,
    );
    return (meta.changes ?? 0) === 1;
  },

  /** Apply a payment; marks paid once the balance is cleared. */
  async applyPayment(invoiceNumber, amount) {
    await q(db).run(
      'UPDATE invoices SET amount_paid = amount_paid + ?, updated_at = ? WHERE invoice_number = ?',
      [amount, nowIso(), invoiceNumber],
    );
    const meta = await q(db).run(
      `UPDATE invoices SET status = 'paid', paid_at = ?, updated_at = ?
        WHERE invoice_number = ? AND amount_paid >= total AND status != 'paid'`,
      [nowIso(), nowIso(), invoiceNumber],
    );
    return { settled: (meta.changes ?? 0) === 1 };
  },
});

/* --------------------------------------------------------------- payments -- */
const payments = (db) => ({
  listByInvoice: (invoiceNumber) =>
    q(db).all('SELECT * FROM payments WHERE invoice_number = ? ORDER BY created_at DESC', [invoiceNumber]),

  /** Webhook idempotency: a provider transaction is recorded at most once. */
  byProviderTxn: (providerTransactionId) =>
    q(db).first('SELECT * FROM payments WHERE provider_transaction_id = ?', [providerTransactionId]),

  async record({ invoiceNumber, amount, method = null, reference = null, note = null,
                 provider = null, providerOrderId = null, providerTransactionId = null }) {
    const meta = await q(db).run(
      `INSERT INTO payments (invoice_number, created_at, amount, method, reference, note,
                             provider, provider_order_id, provider_transaction_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceNumber, nowIso(), amount, method, reference, note, provider, providerOrderId, providerTransactionId],
    );
    return meta.last_row_id ?? null;
  },
});

/* --------------------------------------------------------------- receipts -- */
const receipts = (db) => ({
  byNumber: (receiptNumber) => q(db).first('SELECT * FROM receipts WHERE receipt_number = ?', [receiptNumber]),
  listByInvoice: (invoiceNumber) =>
    q(db).all('SELECT * FROM receipts WHERE invoice_number = ? ORDER BY created_at DESC', [invoiceNumber]),
  async create({ receiptNumber, invoiceNumber, amount, paymentMethod = null }) {
    await q(db).run(
      `INSERT INTO receipts (receipt_number, invoice_number, created_at, amount, payment_method)
       VALUES (?, ?, ?, ?, ?)`,
      [receiptNumber, invoiceNumber, nowIso(), amount, paymentMethod],
    );
    return receiptNumber;
  },
  markEmailed: (receiptNumber) =>
    q(db).run('UPDATE receipts SET emailed_at = ? WHERE receipt_number = ?', [nowIso(), receiptNumber]),
});

export const repos = defineRepos((db) => ({
    ...authRepos(db),
    auditLogs: auditLogs(db),
    quotes: quotes(db),
    invoices: invoices(db),
    payments: payments(db),
    receipts: receipts(db),
  }));
