#!/usr/bin/env node
/**
 * Turns on the Cloudflare-native frontend flag for non-production Workers
 * Builds only, using the branch name Workers Builds already injects
 * (WORKERS_CI_BRANCH) — no second build trigger or build-command override is
 * needed. Writes .env.production.local (git-ignored, Vite-native override
 * file) so `vite build` picks it up; writes nothing when the branch is
 * "main" or unset (local/dev builds), so production behavior is unchanged
 * by default.
 */
import fs from 'fs';

const branch = process.env.WORKERS_CI_BRANCH;
const isProductionBranch = !branch || branch === 'main';

if (isProductionBranch) {
  console.log(`[set-preview-flags] branch="${branch || '(unset)'}" — production/local build, no preview flags applied`);
} else {
  fs.writeFileSync('.env.production.local', 'VITE_USE_CLOUDFLARE_API=true\n');
  console.log(`[set-preview-flags] branch="${branch}" — wrote .env.production.local (VITE_USE_CLOUDFLARE_API=true)`);
}
