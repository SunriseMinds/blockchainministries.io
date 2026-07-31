/**
 * Transactional email.
 *
 * Cloudflare Workers cannot open raw SMTP sockets, so the SMTP_* settings from
 * the Hostinger export are unusable here (risk R-10). This module abstracts an
 * HTTP email API behind one interface.
 *
 * PROVIDER NOT YET CHOSEN — owner decision pending. Until EMAIL_PROVIDER is
 * configured, send() logs and returns {sent:false} instead of throwing, so
 * flows remain testable; callers must not treat delivery as guaranteed.
 */
import { HttpError } from './http.js';

const FROM_FALLBACK = 'noreply@blockchainministries.io';

/**
 * @param {object} ctx
 * @param {{to:string, subject:string, text:string, html?:string}} message
 * @returns {Promise<{sent:boolean, provider:string, reason?:string}>}
 */
export async function send(ctx, { to, subject, text, html }) {
  const provider = (ctx.env.EMAIL_PROVIDER || '').toLowerCase();
  const from = ctx.env.EMAIL_FROM || FROM_FALLBACK;

  if (!provider) {
    console.warn(`[email] provider not configured; would send "${subject}" to ${redact(to)}`);
    return { sent: false, provider: 'none', reason: 'EMAIL_PROVIDER not configured' };
  }

  switch (provider) {
    case 'resend':
      return sendResend(ctx, { from, to, subject, text, html });
    case 'postmark':
      return sendPostmark(ctx, { from, to, subject, text, html });
    case 'mailchannels':
      return sendMailChannels({ from, to, subject, text, html });
    default:
      throw new HttpError(500, 'email_misconfigured', `Unknown EMAIL_PROVIDER: ${provider}`);
  }
}

async function sendResend(ctx, m) {
  const key = requireKey(ctx);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: m.from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
  });
  return finish(res, 'resend');
}

async function sendPostmark(ctx, m) {
  const key = requireKey(ctx);
  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: { 'X-Postmark-Server-Token': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ From: m.from, To: m.to, Subject: m.subject, TextBody: m.text, HtmlBody: m.html }),
  });
  return finish(res, 'postmark');
}

async function sendMailChannels(m) {
  const res = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: m.to }] }],
      from: { email: m.from, name: 'Blockchain Ministries' },
      subject: m.subject,
      content: [
        { type: 'text/plain', value: m.text },
        ...(m.html ? [{ type: 'text/html', value: m.html }] : []),
      ],
    }),
  });
  return finish(res, 'mailchannels');
}

function requireKey(ctx) {
  const key = ctx.env.EMAIL_API_KEY;
  if (!key) throw new HttpError(500, 'email_misconfigured', 'EMAIL_API_KEY is not configured');
  return key;
}

async function finish(res, provider) {
  if (!res.ok) {
    console.error(`[email] ${provider} failed: ${res.status}`);
    return { sent: false, provider, reason: `provider returned ${res.status}` };
  }
  return { sent: true, provider };
}

function redact(addr) {
  const [user, domain] = String(addr).split('@');
  if (!domain) return '***';
  return `${user.slice(0, 2)}***@${domain}`;
}

/* ------------------------------------------------------------- templates -- */
export const templates = {
  verifyEmail: (link) => ({
    subject: 'Verify your email — Blockchain Ministries',
    text: `Welcome to Blockchain Ministries.\n\nConfirm your email address:\n${link}\n\nThis link expires in 24 hours. If you did not create an account, ignore this message.`,
  }),
  passwordReset: (link) => ({
    subject: 'Reset your password — Blockchain Ministries',
    text: `A password reset was requested for your account.\n\nReset it here:\n${link}\n\nThis link expires in 60 minutes and can be used once. If you did not request this, ignore this message — your password is unchanged.`,
  }),
  passwordChanged: () => ({
    subject: 'Your password was changed — Blockchain Ministries',
    text: 'Your password was just changed and all active sessions were signed out. If this was not you, contact contact@blockchainministries.io immediately.',
  }),
  applicationReceived: (kind) => ({
    subject: `Your ${kind} application was received — Blockchain Ministries`,
    text: `We have received your ${kind} application. You will be notified once it has been reviewed.`,
  }),
  applicationApproved: (kind) => ({
    subject: `Your ${kind} has been approved — Blockchain Ministries`,
    text: `Your ${kind} application has been approved. Sign in to your dashboard to view the details.`,
  }),
  applicationRejected: (kind) => ({
    subject: `Update on your ${kind} application — Blockchain Ministries`,
    text: `Thank you for your interest. After review, your ${kind} application was not approved at this time. You are welcome to contact us with any questions.`,
  }),
  consultationRequested: (topic) => ({
    subject: 'Your consultation request was received — Blockchain Ministries',
    text: `We have received your consultation request${topic ? ` regarding "${topic}"` : ''}. We will contact you to arrange a time.`,
  }),
  donationReceipt: (amountCents, currency) => ({
    subject: 'Thank you for your offering — Blockchain Ministries',
    text: `We gratefully acknowledge your gift of ${(amountCents / 100).toFixed(2)} ${String(currency).toUpperCase()}. Thank you for supporting the mission.`,
  }),
};

/**
 * Notify the ministry's own inbox (contact form, new applications, new
 * consultations). Falls back to the public contact address.
 */
export async function notifyAdmins(ctx, { subject, text }) {
  const to = ctx.env.ADMIN_NOTIFY_EMAIL || 'contact@blockchainministries.io';
  return send(ctx, { to, subject, text });
}
