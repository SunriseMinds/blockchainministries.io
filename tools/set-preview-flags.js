#!/usr/bin/env node
/**
 * Turns on the Cloudflare-native frontend flag for every Workers Builds CI
 * run — preview branches AND production (main) alike. Writes
 * .env.production.local (git-ignored, Vite-native override file) so `vite
 * build` picks it up; writes nothing for a local, non-CI build (`npm run
 * dev`/manual `npm run build` on a developer machine), which still defaults
 * to Supabase mode unless the developer opts in via their own `.env.local`.
 *
 * M9.3: production silently building with VITE_USE_CLOUDFLARE_API=false was
 * the actual gap — this used to gate on "preview branch only" (isPreviewBuild
 * below), so a Workers Build of `main` got no flag at all. There is no longer
 * a scenario where a Workers-Builds-triggered build of this repo should
 * compile in Supabase mode, so the flag is now written for ANY such build;
 * isPreviewBuild is kept only to distinguish preview from production in the
 * log line (and is still separately useful/tested).
 *
 * Detection uses two Workers Builds injected variables (both added June 2025):
 *   WORKERS_CI      = "1"            → we are inside a Workers Builds CI run
 *   WORKERS_CI_BRANCH = <branch>     → the branch triggering the build
 */
import fs from 'fs';

/** Pure: true for any Workers Builds CI run — preview and production alike. */
export function isCloudflareModeBuild(env = process.env) {
  return env.WORKERS_CI === '1';
}

/** Pure: true when the given env indicates a preview (non-production) CI build. */
export function isPreviewBuild(env = process.env) {
  const branch = env.WORKERS_CI_BRANCH || '';
  return isCloudflareModeBuild(env) && branch !== 'main';
}

const branch = process.env.WORKERS_CI_BRANCH || '(unset)';
const isCI = process.env.WORKERS_CI === '1';

if (isCloudflareModeBuild()) {
  fs.writeFileSync('.env.production.local', 'VITE_USE_CLOUDFLARE_API=true\n');
  const kind = isPreviewBuild() ? 'preview' : 'production';
  console.log(`[set-preview-flags] CI=true branch="${branch}" (${kind}) — wrote .env.production.local (VITE_USE_CLOUDFLARE_API=true)`);
} else {
  console.log(`[set-preview-flags] CI=${isCI} branch="${branch}" — local build, no Cloudflare-mode flag applied`);
}
