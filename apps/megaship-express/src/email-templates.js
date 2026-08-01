/**
 * Megaship Express email templates. BUSINESS content — the platform owns
 * transport (@reellink/email), each app owns its voice.
 */
const money = (amount, currency = 'USD') => `${Number(amount).toFixed(2)} ${String(currency).toUpperCase()}`;

export const templates = {
  quoteReceived: (quoteId) => ({
    subject: `Quote request ${quoteId} received — Megaship Express`,
    text: `Thank you for contacting Megaship Express.\n\nYour quote reference is ${quoteId}. Our team will review the details and respond shortly.\n\nYou can check the status of this request at any time using your reference number.`,
  }),
  invoiceSent: (invoiceNumber, total, currency, url) => ({
    subject: `Invoice ${invoiceNumber} — Megaship Express`,
    text: `Invoice ${invoiceNumber} for ${money(total, currency)} is now available.\n\nView and pay securely:\n${url}\n\nThank you for shipping with Megaship Express.`,
  }),
  receipt: (receiptNumber, invoiceNumber, amount, currency) => ({
    subject: `Receipt ${receiptNumber} — Megaship Express`,
    text: `We have received your payment of ${money(amount, currency)} for invoice ${invoiceNumber}.\n\nThis email is your receipt (${receiptNumber}). Thank you for your business.`,
  }),
};

/** Overrides for the platform's authentication emails (Megaship voice). */
export const authTemplates = {
  verifyEmail: (link) => ({
    subject: 'Verify your email — Megaship Express',
    text: `Welcome to Megaship Express.\n\nConfirm your email address:\n${link}\n\nThis link expires in 24 hours.`,
  }),
  passwordReset: (link) => ({
    subject: 'Reset your password — Megaship Express',
    text: `A password reset was requested for your Megaship Express account.\n\nReset it here:\n${link}\n\nThis link expires in 60 minutes.`,
  }),
};
