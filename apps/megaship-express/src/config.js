/**
 * Megaship Express — application configuration.
 *
 * Courier quoting, invoicing and payment collection built on the Reellink
 * Cloud Platform. Only wiring lives here; behaviour lives in routes.js.
 */
import { defineActions } from '@reellink/security/audit.js';
import { keyspace } from '@reellink/files/r2.js';

export const APP = {
  name: 'megaship-express',
  flags: [],
};

/** Business audit verbs. Platform verbs (auth.*, file.*, payment.*) merge in. */
export const ACTIONS = defineActions({
  QUOTE_REQUESTED: 'quote.requested',
  QUOTE_STATUS_CHANGED: 'quote.status_changed',
  INVOICE_CREATED: 'invoice.created',
  INVOICE_SENT: 'invoice.sent',
  INVOICE_CANCELLED: 'invoice.cancelled',
  PAYMENT_RECORDED_MANUAL: 'payment.recorded_manual',
  RECEIPT_ISSUED: 'receipt.issued',
});

/**
 * R2 layout. Invoices and receipts are customer financial documents and live
 * in the PROTECTED bucket — never world-readable.
 */
export const keys = keyspace({
  invoicePdf: (invoiceNumber) => `invoices/${invoiceNumber}.pdf`,
  receiptPdf: (receiptNumber) => `receipts/${receiptNumber}.pdf`,
  brand: (name) => `brand/${name}`,
});

/** Quote lifecycle. */
export const QUOTE_STATUSES = ['new', 'reviewing', 'quoted', 'won', 'lost'];
/** Invoice lifecycle. */
export const INVOICE_STATUSES = ['draft', 'pending', 'sent', 'paid', 'cancelled'];
