/**
 * Megaship Express — domain routes.
 *
 * Courier quoting → invoicing → payment → receipt. Every cross-cutting
 * concern (captcha, rate limiting, sessions, roles, audit, email, Stripe,
 * R2 access control) comes from the platform; this file is business only.
 */
import { json, readJson, clientIp, userAgent, notFound, conflict, badRequest } from '@reellink/core/http.js';
import * as v from '@reellink/core/validate.js';
import { requireDb } from '@reellink/database/d1.js';
import { requireAuth, requireAdmin } from '@reellink/auth/middleware.js';
import { requireTurnstile } from '@reellink/security/turnstile-middleware.js';
import { enforce } from '@reellink/security/ratelimit.js';
import { audit } from '@reellink/security/audit.js';
import { randomToken } from '@reellink/security/crypto.js';
import { kv } from '@reellink/storage/kv.js';
import * as r2 from '@reellink/files/r2.js';
import * as stripe from '@reellink/payments/stripe.js';
import { send, notifyAdmins } from '@reellink/email';
import { mountAuthRoutes } from '@reellink/auth/routes.js';
import { repos } from './repositories.js';
import { ACTIONS, keys, QUOTE_STATUSES, INVOICE_STATUSES } from './config.js';
import { templates, authTemplates } from './email-templates.js';

/** Human-friendly business identifiers. */
const quoteId = () => `Q-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomToken(4).replace(/[-_]/g, '').slice(0, 6).toUpperCase()}`;
const invoiceNumber = () => `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomToken(4).replace(/[-_]/g, '').slice(0, 6).toUpperCase()}`;
const receiptNumber = () => `RCPT-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${randomToken(4).replace(/[-_]/g, '').slice(0, 6).toUpperCase()}`;

/** Money is stored as REAL in this legacy schema; Stripe needs integer cents. */
const toCents = (amount) => Math.round(Number(amount) * 100);

export function mountRoutes(r) {
  // Platform authentication (signup/login/logout/session/verify/reset).
  // Not reimplemented here — only the copy is ours.
  mountAuthRoutes(r, { templates: authTemplates });

  /* =============================================================== quotes == */

  /**
   * Public quote request. This endpoint previously had no protection at all;
   * it is now captcha-verified, rate limited and fully validated.
   */
  r.post('/api/quotes', [requireTurnstile], async (ctx) => {
    const db = requireDb(ctx);
    const ip = clientIp(ctx.request);
    await enforce(ctx, 'publicForm', ip);

    const b = ctx.body;
    const id = quoteId();
    await repos(db).quotes.create({
      quoteId: id,
      contactName: v.str(b, 'contact_name', { max: 200 }),
      company: v.str(b, 'company', { required: false, max: 200 }),
      email: v.email(b),
      phone: v.str(b, 'phone', { required: false, max: 50 }),
      service: v.str(b, 'service', { max: 100 }),
      packageType: v.str(b, 'package_type', { max: 100 }),
      weightKg: b.weight_kg == null ? null : v.int(b, 'weight_kg', { min: 0, max: 100000 }),
      lengthCm: b.length_cm == null ? null : v.int(b, 'length_cm', { min: 0, max: 100000 }),
      widthCm: b.width_cm == null ? null : v.int(b, 'width_cm', { min: 0, max: 100000 }),
      heightCm: b.height_cm == null ? null : v.int(b, 'height_cm', { min: 0, max: 100000 }),
      contents: v.str(b, 'contents', { required: false, max: 2000 }),
      pickupAddress1: v.str(b, 'pickup_address1', { max: 200 }),
      pickupAddress2: v.str(b, 'pickup_address2', { required: false, max: 200 }),
      pickupCity: v.str(b, 'pickup_city', { max: 120 }),
      pickupState: v.str(b, 'pickup_state', { max: 120 }),
      pickupPostal: v.str(b, 'pickup_postal', { max: 40 }),
      pickupDatetime: v.str(b, 'pickup_datetime', { required: false, max: 40 }),
      dropoffAddress1: v.str(b, 'dropoff_address1', { max: 200 }),
      dropoffAddress2: v.str(b, 'dropoff_address2', { required: false, max: 200 }),
      dropoffCity: v.str(b, 'dropoff_city', { max: 120 }),
      dropoffState: v.str(b, 'dropoff_state', { max: 120 }),
      dropoffPostal: v.str(b, 'dropoff_postal', { max: 40 }),
      dropoffDeadline: v.str(b, 'dropoff_deadline', { required: false, max: 40 }),
      notes: v.str(b, 'notes', { required: false, max: 4000 }),
      ip,
      userAgent: userAgent(ctx.request),
      country: ctx.request.headers.get('CF-IPCountry') || null,
    });

    // Email delivery is tracked on the row so failures are visible, not silent.
    const mail = await send(ctx, { to: v.email(b), ...templates.quoteReceived(id) });
    await repos(db).quotes.markEmail(id, mail.sent ? 'sent' : 'failed', mail.sent ? null : mail.reason);
    await notifyAdmins(ctx, {
      subject: `New quote request ${id} — Megaship Express`,
      text: `Quote ${id} was submitted by ${v.email(b)}.`,
    });

    await audit(ctx, ACTIONS.QUOTE_REQUESTED, { entityType: 'quote', entityId: id });
    return json({ ok: true, quote_id: id, email_sent: mail.sent }, { status: 201 });
  });

  /** Public status lookup by reference. Returns no PII beyond the status. */
  r.get('/api/quotes/:quoteId/status', [], async (ctx) => {
    const db = requireDb(ctx);
    const quote = await repos(db).quotes.byQuoteId(ctx.params.quoteId);
    if (!quote) throw notFound('Quote not found');
    return json({ quote_id: quote.quote_id, status: quote.status, created_at: quote.created_at });
  });

  /* ============================================================== invoices == */

  /** A signed-in customer sees only invoices issued to their own address. */
  r.get('/api/invoices/mine', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    const items = await repos(db).invoices.listByEmail(ctx.session.email, v.pagination(ctx.url));
    return json({ items });
  });

  /** Invoice PDF — protected R2; ownership checked before streaming. */
  r.get('/api/invoices/:invoiceNumber/pdf', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    const invoice = await repos(db).invoices.byNumber(ctx.params.invoiceNumber);
    // 404 rather than 403 so invoice numbers cannot be probed.
    if (!invoice) throw notFound('Invoice not found');
    if (ctx.session.role !== 'admin' && invoice.customer_email !== ctx.session.email) {
      throw notFound('Invoice not found');
    }
    const obj = await r2.download(ctx, r2.BUCKETS.PROTECTED, keys.invoicePdf(invoice.invoice_number));
    await audit(ctx, ACTIONS.FILE_DOWNLOAD, { entityType: 'invoice', entityId: invoice.invoice_number });
    return r2.toResponse(obj, { isPublic: false });
  });

  /* ============================================================== payments == */

  /** Hosted Stripe Checkout for an outstanding invoice. */
  r.post('/api/invoices/:invoiceNumber/checkout', [requireTurnstile], async (ctx) => {
    const db = requireDb(ctx);
    await enforce(ctx, 'payment', clientIp(ctx.request));
    const invoice = await repos(db).invoices.byNumber(ctx.params.invoiceNumber);
    if (!invoice) throw notFound('Invoice not found');
    if (invoice.status === 'paid') throw conflict('Invoice is already paid');
    if (invoice.status === 'cancelled') throw conflict('Invoice is cancelled');

    const due = Number(invoice.total) - Number(invoice.amount_paid);
    if (due <= 0) throw conflict('Nothing outstanding on this invoice');

    const origin = ctx.env.SITE_URL || ctx.url.origin;
    const session = await stripe.createCheckoutSession(ctx, {
      mode: 'payment',
      items: [{ amountCents: toCents(due), currency: (invoice.currency || 'usd').toLowerCase(),
                name: `Invoice ${invoice.invoice_number}` }],
      successUrl: `${origin}/invoice/${invoice.invoice_number}?paid=1`,
      cancelUrl: `${origin}/invoice/${invoice.invoice_number}?cancelled=1`,
      customerEmail: invoice.customer_email,
      // Carried back on the webhook so the payment can be attributed.
      metadata: { invoice_number: invoice.invoice_number },
      idempotencyKey: crypto.randomUUID(),
    });
    return json({ id: session.id, url: session.url }, { status: 201 });
  });

  /**
   * Stripe webhook. Signature-verified over the RAW body — never behind
   * Turnstile or a session.
   */
  r.post('/api/webhooks/stripe', [], async (ctx) => {
    const db = requireDb(ctx);
    const raw = await ctx.request.text();
    const event = await stripe.verifyWebhookSignature(ctx, raw, ctx.request.headers.get('Stripe-Signature'));
    const payment = stripe.donationFromEvent(event);
    if (!payment || payment.status !== 'succeeded') {
      return json({ received: true, ignored: event.type });
    }

    const invNumber = event.data?.object?.metadata?.invoice_number;
    if (!invNumber) return json({ received: true, ignored: 'no invoice_number in metadata' });

    const repo = repos(db);
    // Idempotency: a replayed webhook must not double-credit an invoice.
    if (await repo.payments.byProviderTxn(payment.providerId)) {
      return json({ received: true, duplicate: true });
    }

    const amount = payment.amountCents / 100;
    await repo.payments.record({
      invoiceNumber: invNumber, amount, method: 'card', provider: 'stripe',
      providerTransactionId: payment.providerId,
    });
    const { settled } = await repo.invoices.applyPayment(invNumber, amount);

    if (settled) {
      const rcpt = receiptNumber();
      await repo.receipts.create({ receiptNumber: rcpt, invoiceNumber: invNumber, amount, paymentMethod: 'card' });
      const invoice = await repo.invoices.byNumber(invNumber);
      if (invoice) await send(ctx, { to: invoice.customer_email, ...templates.receipt(rcpt, invNumber, amount, invoice.currency) });
      await audit(ctx, ACTIONS.RECEIPT_ISSUED, { entityType: 'receipt', entityId: rcpt });
    }

    await audit(ctx, ACTIONS.PAYMENT_RECORDED, { entityType: 'invoice', entityId: invNumber, metadata: { provider: 'stripe', settled } });
    return json({ received: true, recorded: true, settled });
  });

  /* ================================================================= admin == */

  r.get('/api/admin/quotes', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const status = ctx.url.searchParams.get('status') || undefined;
    if (status && !QUOTE_STATUSES.includes(status)) throw badRequest('Invalid status filter');
    return json({ items: await repos(db).quotes.list({ status, ...v.pagination(ctx.url) }) });
  });

  r.post('/api/admin/quotes/:quoteId/status', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const body = await readJson(ctx.request);
    const status = v.oneOf(body, 'status', QUOTE_STATUSES);
    const changed = await repos(db).quotes.setStatus(ctx.params.quoteId, status);
    if (!changed) throw conflict(`Quote is already ${status} or does not exist`);
    await audit(ctx, ACTIONS.QUOTE_STATUS_CHANGED, { entityType: 'quote', entityId: ctx.params.quoteId, metadata: { status } });
    return json({ ok: true, quote_id: ctx.params.quoteId, status });
  });

  r.get('/api/admin/invoices', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const status = ctx.url.searchParams.get('status') || undefined;
    if (status && !INVOICE_STATUSES.includes(status)) throw badRequest('Invalid status filter');
    return json({ items: await repos(db).invoices.list({ status, ...v.pagination(ctx.url) }) });
  });

  /** Raise an invoice, optionally from an existing quote. */
  r.post('/api/admin/invoices', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const b = await readJson(ctx.request);
    const repo = repos(db);

    const quoteRef = v.str(b, 'quote_id', { required: false, max: 60 });
    if (quoteRef && !(await repo.quotes.byQuoteId(quoteRef))) throw badRequest('Unknown quote_id');

    const lineItems = b.line_items ?? [];
    if (!Array.isArray(lineItems) || lineItems.length === 0) throw badRequest('At least one line item is required');
    const subtotal = lineItems.reduce((sum, li) => sum + Number(li.amount ?? 0), 0);
    const discount = Number(b.discount_amount ?? 0);
    const taxRate = Number(b.tax_rate ?? 0);
    const taxAmount = Number((((subtotal - discount) * taxRate) / 100).toFixed(2));
    const total = Number((subtotal - discount + taxAmount).toFixed(2));
    if (total < 0) throw badRequest('Invoice total cannot be negative');

    const number = invoiceNumber();
    await repo.invoices.create({
      invoiceNumber: number,
      quoteId: quoteRef,
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: v.str(b, 'due_date', { required: false, max: 20 }),
      customerName: v.str(b, 'customer_name', { max: 200 }),
      customerEmail: v.email(b, 'customer_email'),
      customerPhone: v.str(b, 'customer_phone', { required: false, max: 50 }),
      billingAddress1: v.str(b, 'billing_address1', { required: false, max: 200 }),
      billingAddress2: v.str(b, 'billing_address2', { required: false, max: 200 }),
      billingCity: v.str(b, 'billing_city', { required: false, max: 120 }),
      billingState: v.str(b, 'billing_state', { required: false, max: 120 }),
      billingPostal: v.str(b, 'billing_postal', { required: false, max: 40 }),
      serviceSummary: v.str(b, 'service_summary', { required: false, max: 1000 }),
      lineItems: JSON.stringify(lineItems),
      currency: (v.str(b, 'currency', { required: false, max: 3 }) || 'USD').toUpperCase(),
      subtotal, discountAmount: discount, taxRate, taxAmount, total,
      notes: v.str(b, 'notes', { required: false, max: 4000 }),
      terms: v.str(b, 'terms', { required: false, max: 4000 }),
      createdBy: ctx.session.email,
    });

    await audit(ctx, ACTIONS.INVOICE_CREATED, { entityType: 'invoice', entityId: number, metadata: { total } });
    return json({ ok: true, invoice_number: number, total }, { status: 201 });
  });

  /** Send an invoice. Idempotent: only draft → sent transitions. */
  r.post('/api/admin/invoices/:invoiceNumber/send', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const repo = repos(db);
    const invoice = await repo.invoices.byNumber(ctx.params.invoiceNumber);
    if (!invoice) throw notFound('Invoice not found');

    const moved = await repo.invoices.transition(invoice.invoice_number, 'draft', 'sent', 'sent_at');
    if (!moved) throw conflict(`Invoice is already ${invoice.status}`);

    const origin = ctx.env.SITE_URL || ctx.url.origin;
    await send(ctx, {
      to: invoice.customer_email,
      ...templates.invoiceSent(invoice.invoice_number, invoice.total, invoice.currency, `${origin}/invoice/${invoice.invoice_number}`),
    });
    await audit(ctx, ACTIONS.INVOICE_SENT, { entityType: 'invoice', entityId: invoice.invoice_number });
    return json({ ok: true, invoice_number: invoice.invoice_number, status: 'sent' });
  });

  /** Record a payment received outside Stripe (bank transfer, cash). */
  r.post('/api/admin/invoices/:invoiceNumber/payments', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const b = await readJson(ctx.request);
    const repo = repos(db);
    const invoice = await repo.invoices.byNumber(ctx.params.invoiceNumber);
    if (!invoice) throw notFound('Invoice not found');
    if (invoice.status === 'cancelled') throw conflict('Invoice is cancelled');

    const amountCents = v.int(b, 'amount_cents', { min: 1, max: 100_000_000 });
    const amount = amountCents / 100;
    await repo.payments.record({
      invoiceNumber: invoice.invoice_number, amount,
      method: v.str(b, 'method', { required: false, max: 40 }) || 'manual',
      reference: v.str(b, 'reference', { required: false, max: 120 }),
      note: v.str(b, 'note', { required: false, max: 500 }),
    });
    const { settled } = await repo.invoices.applyPayment(invoice.invoice_number, amount);

    let receipt = null;
    if (settled) {
      receipt = receiptNumber();
      await repo.receipts.create({ receiptNumber: receipt, invoiceNumber: invoice.invoice_number, amount, paymentMethod: 'manual' });
      await audit(ctx, ACTIONS.RECEIPT_ISSUED, { entityType: 'receipt', entityId: receipt });
    }
    await audit(ctx, ACTIONS.PAYMENT_RECORDED_MANUAL, { entityType: 'invoice', entityId: invoice.invoice_number, metadata: { amount, settled } });
    return json({ ok: true, settled, receipt_number: receipt }, { status: 201 });
  });

  r.post('/api/admin/invoices/:invoiceNumber/cancel', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const repo = repos(db);
    const invoice = await repo.invoices.byNumber(ctx.params.invoiceNumber);
    if (!invoice) throw notFound('Invoice not found');
    if (invoice.status === 'paid') throw conflict('A paid invoice cannot be cancelled');
    const moved = await repo.invoices.transition(invoice.invoice_number, invoice.status, 'cancelled', 'cancelled_at');
    if (!moved) throw conflict('Invoice could not be cancelled');
    await audit(ctx, ACTIONS.INVOICE_CANCELLED, { entityType: 'invoice', entityId: invoice.invoice_number });
    return json({ ok: true, status: 'cancelled' });
  });

  r.get('/api/admin/invoices/:invoiceNumber/payments', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).payments.listByInvoice(ctx.params.invoiceNumber) });
  });

  /** Upload a rendered invoice PDF into the protected bucket. */
  r.put('/api/admin/invoices/:invoiceNumber/pdf', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const invoice = await repos(db).invoices.byNumber(ctx.params.invoiceNumber);
    if (!invoice) throw notFound('Invoice not found');
    const res = await r2.upload(ctx, r2.BUCKETS.PROTECTED, keys.invoicePdf(invoice.invoice_number),
      ctx.request.body, { contentType: 'application/pdf' });
    await audit(ctx, ACTIONS.FILE_UPLOAD, { entityType: 'invoice', entityId: invoice.invoice_number });
    return json({ ok: true, ...res }, { status: 201 });
  });

  /** Dashboard counters, cached briefly in KV to avoid repeated scans. */
  r.get('/api/admin/stats', [requireAdmin], async (ctx) => {
    const db = requireDb(ctx);
    const cache = kv(ctx.env, { namespace: 'megaship:stats' });
    const stats = await cache.remember('dashboard', 60, async () => {
      const repo = repos(db);
      const [newQuotes, unpaid] = await Promise.all([
        repo.quotes.list({ status: 'new', limit: 200 }),
        repo.invoices.list({ status: 'sent', limit: 200 }),
      ]);
      return {
        new_quotes: newQuotes.length,
        unpaid_invoices: unpaid.length,
        outstanding_total: unpaid.reduce((s, i) => s + (Number(i.total) - Number(i.amount_paid)), 0),
      };
    });
    return json(stats);
  });

  return r;
}
