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
  loginLink: (link) => ({
    subject: 'Your Blockchain Ministries login link',
    text: `Use this link to log in to Blockchain Ministries:\n${link}\n\nThis link expires in 15 minutes and can be used once. If you did not request this, ignore this message.`,
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
  /**
   * M11 Phase 7 — approval and issuance are the same act (Q9), so the
   * ordination approval email now tells the member their credential exists
   * and how to reach it.
   *
   * `dateOfOrdination` is approved_at. issued_at is NOT mentioned: it moves on
   * reissue and is not an ordination date. No PDF is attached — the credential
   * is generated on demand and printed from the browser (Q7).
   */
  credentialIssued: ({ credentialNumber, dateOfOrdination, dashboardUrl, verifyUrl }) => ({
    subject: 'Your ordination has been approved — Blockchain Ministries',
    text: `Your ordination application has been approved, and your credential has been issued.

Credential No.: ${credentialNumber}
Date of Ordination: ${dateOfOrdination}

View and print your Certificate of Ordination from your dashboard:
${dashboardUrl}

Your credential can be verified publicly at:
${verifyUrl}

To save a PDF, open your credential and choose Print, then "Save as PDF".

If you have questions, please contact contact@blockchainministries.io.`,
  }),

  /**
   * M11 Q6 — the holder must be notified when their credential is revoked.
   *
   * The PRIVATE internal revocation reason is deliberately absent: the
   * ratified policy authorizes disclosing that a credential was revoked and
   * when, but never why. No legal claims are made about the member's standing.
   */
  credentialRevoked: ({ credentialNumber, revokedOn }) => ({
    subject: 'Your ordination credential has been revoked — Blockchain Ministries',
    text: `Your Blockchain Ministries ordination credential has been revoked.

Credential No.: ${credentialNumber}
Effective date: ${revokedOn}

The credential can no longer be viewed or downloaded from your dashboard, and public verification will now show it as revoked.

If you have questions about this decision, please contact contact@blockchainministries.io.`,
  }),

  /**
   * M11 Q8 — reissue restores the SAME credential. The wording is careful not
   * to imply a new ordination: `issued_at` moved, `approved_at` did not, so
   * the Date of Ordination on the certificate is unchanged.
   */
  credentialReissued: ({ credentialNumber, dateOfOrdination }) => ({
    subject: 'Your ordination credential has been reissued — Blockchain Ministries',
    text: `Your Blockchain Ministries ordination credential has been reissued and is valid again.

Credential No.: ${credentialNumber}
Date of Ordination: ${dateOfOrdination}

This is the same credential, restored. Your original date of ordination is unchanged. You can view and print it from your dashboard, and it can again be verified publicly through Blockchain Ministries.

If you have questions, please contact contact@blockchainministries.io.`,
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

