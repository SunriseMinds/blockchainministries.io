/**
 * Default authentication email copy.
 *
 * Deliberately generic — applications override any of these by passing
 * `templates` to mountAuthRoutes() so the wording matches their voice.
 */
export const AUTH_EMAIL_TEMPLATES = {
  verifyEmail: (link) => ({
    subject: 'Verify your email address',
    text: `Confirm your email address:\n${link}\n\nThis link expires in 24 hours. If you did not create an account, ignore this message.`,
  }),
  loginLink: (link) => ({
    subject: 'Your login link',
    text: `Use this link to log in:\n${link}\n\nThis link expires in 15 minutes and can be used once. If you did not request this, ignore this message.`,
  }),
  passwordReset: (link) => ({
    subject: 'Reset your password',
    text: `A password reset was requested for your account.\n\nReset it here:\n${link}\n\nThis link expires in 60 minutes and can be used once. If you did not request this, ignore this message — your password is unchanged.`,
  }),
  passwordChanged: () => ({
    subject: 'Your password was changed',
    text: 'Your password was just changed and all active sessions were signed out. If this was not you, contact support immediately.',
  }),
};
