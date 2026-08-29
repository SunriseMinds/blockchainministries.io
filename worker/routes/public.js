/**
 * Public + member routes: profile, contact, membership, ordination, scrolls,
 * donations, consultations, ministers.
 *
 * Authorization rule applied throughout: every ownership filter is bound to
 * ctx.session.user_id. A client-supplied user id is never trusted.
 */
import { json, readJson, clientIp, notFound, conflict, badRequest, HttpError } from '@reellink/core/http.js';
import { requireDb } from '@reellink/database/d1.js';
import { repos, fromJsonText } from '../db/repositories.js';
import * as v from '@reellink/core/validate.js';
import { enforce } from '@reellink/security/ratelimit.js';
import { audit } from '@reellink/security/audit.js';
import { ACTIONS } from '../config/actions.js';
import { send, templates, notifyAdmins } from '../email/templates.js';
import { requireAuth, requireVerifiedEmail } from '@reellink/auth/middleware.js';
import { requireTurnstile } from '@reellink/security/turnstile-middleware.js';
import * as stripe from '@reellink/payments/stripe.js';
import * as xrpl from '@reellink/xrpl/client.js';

export function mount(r) {
  /* ------------------------------------------------------------ profile -- */
  r.get('/api/profile', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    const user = await repos(db).users.byId(ctx.session.user_id);
    if (!user) throw notFound('Profile not found');
    return json({
      id: user.id,
      email: user.email,
      role: user.role,
      display_name: user.display_name,
      wallet_xrpl: user.wallet_xrpl,
      // stripe_customer_id is deliberately not exposed here — internal billing
      // linkage, not a client-facing profile field.
      created_at: user.created_at,
    });
  });

  /**
   * Only `display_name` and `wallet_xrpl` are ever accepted here. `role`,
   * `password_hash`, `email_verified`, `failed_login_count`, `locked_until`,
   * and `stripe_customer_id` are never read from the request body — this is
   * the privilege-escalation guard, enforced by `users.updateSelf()` only
   * having parameters for the two safe fields (see packages/auth/repositories.js).
   */
  r.patch('/api/profile', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    const body = await readJson(ctx.request);
    const displayName = v.str(body, 'display_name', { required: false, max: 120 });
    const walletXrpl = v.str(body, 'wallet_xrpl', { required: false, max: 64 });

    if (walletXrpl && !xrpl.isValidAddress(walletXrpl)) throw badRequest('Invalid XRPL address');

    await repos(db).users.updateSelf(ctx.session.user_id, { displayName, walletXrpl });
    await audit(ctx, ACTIONS.PROFILE_UPDATE, { entityType: 'user', entityId: ctx.session.user_id });
    const updated = await repos(db).users.byId(ctx.session.user_id);
    return json({ ok: true, profile: { display_name: updated.display_name, wallet_xrpl: updated.wallet_xrpl } });
  });

  /* ------------------------------------------------------------ contact -- */
  r.post('/api/contact', [requireTurnstile], async (ctx) => {
    const db = requireDb(ctx);
    const ip = clientIp(ctx.request);
    await enforce(ctx, 'publicForm', ip);

    const body = ctx.body;
    const id = await repos(db).contactInquiries.create({
      name: v.str(body, 'name', { max: 200 }),
      email: v.email(body),
      message: v.str(body, 'message', { max: 5000 }),
      inquiryType: v.str(body, 'inquiry_type', { required: false, max: 100 }),
      ip,
    });
    await notifyAdmins(ctx, {
      subject: 'New contact inquiry — Blockchain Ministries',
      text: `A new contact inquiry was submitted (id ${id}). View it in the admin dashboard.`,
    });
    await audit(ctx, ACTIONS.CONTACT_SUBMIT, { entityType: 'contact_inquiry', entityId: id });
    return json({ ok: true, id }, { status: 201 });
  });

  /* ------------------------------------------------------ scroll requests -- */
  r.post('/api/scrolls/requests', [requireTurnstile], async (ctx) => {
    const db = requireDb(ctx);
    const ip = clientIp(ctx.request);
    await enforce(ctx, 'publicForm', ip);

    const body = ctx.body;
    const id = await repos(db).scrollRequests.create({
      name: v.str(body, 'name', { max: 200 }),
      email: v.email(body),
      requestType: v.str(body, 'request_type', { max: 100 }),
      message: v.str(body, 'message', { required: false, max: 5000 }),
      ip,
    });
    await audit(ctx, ACTIONS.SCROLL_REQUEST_SUBMIT, { entityType: 'scroll_request', entityId: id });
    return json({ ok: true, id }, { status: 201 });
  });

  /* ------------------------------------------------------------ scrolls -- */
  r.get('/api/scrolls', [], async (ctx) => {
    const db = requireDb(ctx);
    const items = await repos(db).scrolls.listPublic(v.pagination(ctx.url));
    return json({ items }, { private: false });
  });

  /** Public verification for both ordinations and scrolls, by slug. */
  r.get('/api/verify/:slug', [], async (ctx) => {
    const db = requireDb(ctx);
    const repo = repos(db);
    const slug = ctx.params.slug;

    const ordination = await repo.ordinations.byVerifySlug(slug);
    if (ordination) {
      return json({
        type: 'ordination',
        data: {
          display_name: ordination.display_name,
          status: ordination.status,
          verify_slug: ordination.verify_slug,
          approved_at: ordination.approved_at,
        },
      }, { private: false });
    }

    const scroll = await repo.scrolls.byVerifySlug(slug);
    if (scroll) {
      return json({
        type: 'scroll',
        // r2_key and visibility are deliberately not exposed publicly.
        data: {
          title: scroll.title,
          verify_slug: scroll.verify_slug,
          chain_tx_hash: scroll.chain_tx_hash,
          published_at: scroll.published_at,
        },
      }, { private: false });
    }
    throw notFound('No record matches that verification code');
  });

  /* --------------------------------------------------------- membership -- */
  r.get('/api/membership/mine', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    const membership = await repos(db).memberships.byUser(ctx.session.user_id);
    return json({ membership: membership ?? null });
  });

  /**
   * The membership application form (src/pages/MembershipApply.jsx) collects
   * exactly two fields. Only those two are ever read from the request body —
   * arbitrary client JSON never reaches storage; anything else the client
   * sends is silently dropped, not merged in.
   */
  function buildMembershipApplication(body) {
    const displayName = v.str(body, 'displayName', { max: 120 });
    const walletXrpl = v.str(body, 'walletXrpl', { required: false, max: 64 });
    if (walletXrpl && !xrpl.isValidAddress(walletXrpl)) throw badRequest('Invalid XRPL address');
    return { displayName, walletXrpl };
  }

  r.post('/api/membership/apply', [requireVerifiedEmail], async (ctx) => {
    const db = requireDb(ctx);
    const body = await readJson(ctx.request);
    const application = buildMembershipApplication(body);
    const repo = repos(db);

    const existing = await repo.memberships.byUser(ctx.session.user_id);
    if (existing && existing.application_status !== 'rejected') {
      throw conflict('A membership application is already on file');
    }

    // The same validated payload also updates the user's own profile fields
    // (matches the live product's apply-for-membership behavior).
    await repo.users.updateSelf(ctx.session.user_id, {
      displayName: application.displayName,
      walletXrpl: application.walletXrpl,
    });

    const applicationJson = JSON.stringify(application);
    let membershipId;
    if (existing) {
      // existing.application_status === 'rejected' here (checked above).
      await repo.memberships.resubmit(existing.id, { applicationJson });
      membershipId = existing.id;
    } else {
      membershipId = await repo.memberships.create({ userId: ctx.session.user_id, applicationJson });
    }

    await send(ctx, { to: ctx.session.email, ...templates.applicationReceived('membership') });
    await audit(ctx, ACTIONS.MEMBERSHIP_APPLY, { entityType: 'membership', entityId: membershipId });
    return json({ ok: true, membership_id: membershipId }, { status: 201 });
  });

  /** Alias kept so the existing `join-membership` flow maps 1:1. */
  r.post('/api/membership/join', [requireVerifiedEmail], async (ctx) => {
    const db = requireDb(ctx);
    const body = await readJson(ctx.request);
    const membershipType = v.oneOf(body, 'membership_type', ['free', 'paid'], { required: false });
    const repo = repos(db);

    const existing = await repo.memberships.byUser(ctx.session.user_id);
    if (existing) return json({ ok: true, membership: existing, already_exists: true });

    const id = await repo.memberships.create({ userId: ctx.session.user_id, membershipType });
    await audit(ctx, ACTIONS.MEMBERSHIP_APPLY, { entityType: 'membership', entityId: id });
    return json({ ok: true, membership_id: id }, { status: 201 });
  });

  /* --------------------------------------------------------- ordination -- */
  r.get('/api/ordination/mine', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    const items = await repos(db).ordinations.listByUser(ctx.session.user_id);
    return json({ items });
  });

  /**
   * The ordination application form (src/pages/Ordination.jsx) collects
   * exactly three fields. Only those three are ever read from the request
   * body — arbitrary client JSON never reaches storage.
   */
  function buildOrdinationApplication(body) {
    return {
      fullName: v.str(body, 'fullName', { max: 200 }),
      reason: v.str(body, 'reason', { max: 5000 }),
      experience: v.str(body, 'experience', { required: false, max: 5000 }),
    };
  }

  r.post('/api/ordination/apply', [requireVerifiedEmail], async (ctx) => {
    const db = requireDb(ctx);
    const body = await readJson(ctx.request);
    const application = buildOrdinationApplication(body);
    const repo = repos(db);

    const ordinationId = await repo.ordinations.create({
      userId: ctx.session.user_id,
      applicationJson: JSON.stringify(application),
    });

    await send(ctx, { to: ctx.session.email, ...templates.applicationReceived('ordination') });
    await audit(ctx, ACTIONS.ORDINATION_APPLY, { entityType: 'ordination', entityId: ordinationId });
    return json({ ok: true, ordination_id: ordinationId }, { status: 201 });
  });

  /* ---------------------------------------------------------- donations -- */
  r.get('/api/donations/mine', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    const items = await repos(db).donations.listByUser(ctx.session.user_id, v.pagination(ctx.url));
    return json({ items });
  });

  /**
   * Create a Stripe PaymentIntent. Framework only — inert until
   * STRIPE_SECRET_KEY is configured (Phase 2D).
   */
  r.post('/api/donations/stripe/create-intent', [requireTurnstile], async (ctx) => {
    await enforce(ctx, 'payment', clientIp(ctx.request));
    const body = ctx.body;
    // $1 minimum, $100k ceiling — bounds the blast radius of a bad request.
    const amountCents = v.int(body, 'amount_cents', { min: 100, max: 10_000_000 });
    const currency = v.oneOf(body, 'currency', ['usd'], { required: false }) || 'usd';

    const intent = await stripe.createPaymentIntent(ctx, {
      amountCents,
      currency,
      metadata: { user_id: ctx.session?.user_id ?? '' },
      idempotencyKey: crypto.randomUUID(),
    });
    return json({ client_secret: intent.client_secret, id: intent.id }, { status: 201 });
  });

  /**
   * Hosted Stripe Checkout for one-off donations and recurring membership.
   * `mode=subscription` requires a real Stripe Price id — the ids currently in
   * the frontend (price_supporter_tier, …) are placeholders that exist in no
   * Stripe account, so they are rejected rather than silently failing later.
   */
  r.post('/api/donations/stripe/checkout', [requireTurnstile], async (ctx) => {
    await enforce(ctx, 'payment', clientIp(ctx.request));
    const body = ctx.body;
    const mode = v.oneOf(body, 'mode', ['payment', 'subscription'], { required: false }) || 'payment';
    const origin = ctx.env.SITE_URL || ctx.url.origin;

    let items;
    if (mode === 'subscription') {
      const price = v.str(body, 'price_id', { max: 120 });
      if (stripe.PLACEHOLDER_PRICE_IDS.includes(price)) {
        throw badRequest('This membership tier is not configured yet. Real Stripe Price ids are required.');
      }
      items = [{ price, quantity: 1 }];
    } else {
      items = [{ amountCents: v.int(body, 'amount_cents', { min: 100, max: 10_000_000 }), name: 'Donation' }];
    }

    const session = await stripe.createCheckoutSession(ctx, {
      mode,
      items,
      successUrl: `${origin}/donate?checkout=success`,
      cancelUrl: `${origin}/donate?checkout=cancelled`,
      customerEmail: ctx.session?.email,
      metadata: { user_id: ctx.session?.user_id ?? '' },
      idempotencyKey: crypto.randomUUID(),
    });
    return json({ id: session.id, url: session.url }, { status: 201 });
  });

  /**
   * Stripe webhook. Signature-verified over the RAW body; must never be
   * behind Turnstile or session auth.
   */
  r.post('/api/webhooks/stripe', [], async (ctx) => {
    const db = requireDb(ctx);
    const raw = await ctx.request.text();
    const event = await stripe.verifyWebhookSignature(ctx, raw, ctx.request.headers.get('Stripe-Signature'));

    const donation = stripe.donationFromEvent(event);
    if (!donation) return json({ received: true, ignored: event.type });

    // Unique stripe_event_id + INSERT OR IGNORE makes a redelivered webhook a no-op.
    const id = await repos(db).donations.recordIfNew(donation);
    if (id) await audit(ctx, ACTIONS.DONATION_RECORDED, { entityType: 'donation', entityId: id, metadata: { type: event.type } });
    return json({ received: true, recorded: Boolean(id) });
  });

  /* ------------------------------------------------------- consultations -- */
  r.post('/api/consultations', [requireTurnstile], async (ctx) => {
    const db = requireDb(ctx);
    await enforce(ctx, 'publicForm', clientIp(ctx.request));
    const body = ctx.body;
    const id = await repos(db).consultations.create({
      userId: ctx.session?.user_id ?? null,
      name: v.str(body, 'name', { max: 200 }),
      email: v.email(body),
      topic: v.str(body, 'topic', { required: false, max: 500 }),
      requestedAt: v.str(body, 'requested_at', { required: false, max: 40 }),
    });
    const topic = v.str(body, 'topic', { required: false, max: 500 });
    await send(ctx, { to: v.email(body), ...templates.consultationRequested(topic) });
    await notifyAdmins(ctx, {
      subject: 'New consultation request — Blockchain Ministries',
      text: `A new consultation request was submitted (id ${id}).`,
    });
    await audit(ctx, ACTIONS.CONSULTATION_REQUEST, { entityType: 'consultation', entityId: id });
    return json({ ok: true, id }, { status: 201 });
  });

  r.get('/api/consultations/mine', [requireAuth], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).consultations.listByUser(ctx.session.user_id) });
  });

  /* ---------------------------------------------------------- ministers -- */
  // Served from D1 only after the Firebase directory is migrated (later phase).
  r.get('/api/ministers', [], async (ctx) => {
    const db = requireDb(ctx);
    return json({ items: await repos(db).ministers.listPublished(v.pagination(ctx.url)) }, { private: false });
  });

  r.get('/api/ministers/:id', [], async (ctx) => {
    const db = requireDb(ctx);
    const minister = await repos(db).ministers.byId(ctx.params.id);
    if (!minister) throw notFound('Minister not found');
    return json(minister, { private: false });
  });

  /* --------------------------------------------------------- xrpl (read) -- */
  r.get('/api/xrpl/config', [], (ctx) =>
    json({ ...xrpl.config(ctx), trustline_url: xrpl.trustlineUrl(ctx) }, { private: false }));

  return r;
}

export { fromJsonText };
