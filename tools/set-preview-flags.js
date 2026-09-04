#!/usr/bin/env node
/**
 * Turns on the Cloudflare-native frontend flag for non-production Workers
 * Builds only. Writes .env.production.local (git-ignored, Vite-native override
 * file) so `vite build` picks it up; writes nothing for production/local builds.
 *
 * Detection uses two Workers Builds injected variables (both added June 2025):
 *   WORKERS_CI      = "1"            → we are inside a Workers Builds CI run
 *   WORKERS_CI_BRANCH = <branch>     → the branch triggering the build
 *
 * A preview build is: WORKERS_CI=1  AND  branch is not "main".
 * WORKERS_CI is used as the primary gate so the flag is still written even
 * if WORKERS_CI_BRANCH is absent for any reason (unknown branch ≠ main branch).
 */
import fs from 'fs';

/** Pure: returns true when the given env indicates a preview (non-production) CI build. */
export function isPreviewBuild(env = process.env) {
  const isCI = env.WORKERS_CI === '1';
  const branch = env.WORKERS_CI_BRANCH || '';
  return isCI && branch !== 'main';
}

const branch = process.env.WORKERS_CI_BRANCH || '(unset)';
const isCI = process.env.WORKERS_CI === '1';

if (isPreviewBuild()) {
  fs.writeFileSync('.env.production.local', 'VITE_USE_CLOUDFLARE_API=true\n');
  console.log(`[set-preview-flags] CI=true branch="${branch}" — wrote .env.production.local (VITE_USE_CLOUDFLARE_API=true)`);
} else {
  console.log(`[set-preview-flags] CI=${isCI} branch="${branch}" — production/local build, no preview flags applied`);
}
