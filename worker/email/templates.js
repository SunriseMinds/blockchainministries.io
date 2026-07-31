/**
 * Blockchain Ministries email templates.
 *
 * BUSINESS CONTENT — deliberately NOT part of @reellink/email. The platform
 * owns transport (provider, retries, redaction); each application owns its own
 * voice and copy.
 */
import { send, notifyAdmins } from '@reellink/email';

export { send, notifyAdmins };

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

