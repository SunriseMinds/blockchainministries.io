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
import { HttpError } from '@reellink/core/http.js';

// Applications set EMAIL_FROM / EMAIL_FROM_NAME; this is only a last resort.
const FROM_FALLBACK = 'noreply@example.com';

/**
 * @param {object} ctx
 * @param {{to:string, subject:string, text:string, html?:string}} message
 * @returns {Promise<{sent:boolean, provider:string, reason?:string}>}
 */
export async function send(ctx, { to, subject, text, html }) {
  const provider = (ctx.env.EMAIL_PROVIDER || '').toLowerCase();
  const from = ctx.env.EMAIL_FROM || FROM_FALLBACK;
  const fromName = ctx.env.EMAIL_FROM_NAME || undefined;

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
      return sendMailChannels({ from, fromName, to, subject, text, html });
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
      from: { email: m.from, name: m.fromName || 'Notification' },
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

/**
 * Notify the application's own operations inbox (new submissions, alerts).
 * The destination is configuration, never hard-coded business content.
 */
export async function notifyAdmins(ctx, { subject, text }) {
  const to = ctx.env.ADMIN_NOTIFY_EMAIL;
  if (!to) {
    console.warn('[email] ADMIN_NOTIFY_EMAIL not configured; skipping admin notification');
    return { sent: false, provider: 'none', reason: 'ADMIN_NOTIFY_EMAIL not configured' };
  }
  return send(ctx, { to, subject, text });
}
