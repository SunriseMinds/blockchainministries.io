/**
 * <APP_NAME> — application configuration.
 *
 * Identity, extra feature flags, audit vocabulary and R2 key layout. These are
 * the only "wiring" decisions an application makes.
 */
import { defineActions } from '@reellink/security/audit.js';
import { keyspace } from '@reellink/files/r2.js';

export const APP = {
  name: '<app-slug>',
  // Extra flags beyond the platform set. Unset === false, so a new flag is
  // inert until explicitly enabled.
  flags: [],
};

/** Business audit verbs; platform verbs (auth.*, file.*, …) are merged in. */
export const ACTIONS = defineActions({
  // EXAMPLE_CREATED: 'example.created',
});

/** R2 key layout owned by this application. */
export const keys = keyspace({
  // document: (id) => `documents/${id}.pdf`,
});
