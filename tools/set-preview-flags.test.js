/**
 * Regression tests for the Cloudflare-mode build flag detection in
 * set-preview-flags.js.
 *
 * Root cause of the M9.1 signup bug: when WORKERS_CI_BRANCH was absent,
 * isProductionBranch was true, VITE_USE_CLOUDFLARE_API was never written,
 * and the preview SPA built with USE_CLOUDFLARE_API=false — routing Join.jsx
 * to supabase.functions.invoke() instead of the Cloudflare Worker path.
 *
 * M9.3 root cause: isCloudflareModeBuild (the actual write gate) used to be
 * "CI AND branch != main" — meaning a Workers Build of `main` (production)
 * got no flag at all and silently compiled in Supabase mode. The gate is now
 * "CI" alone; isPreviewBuild only distinguishes preview from production for
 * logging, it no longer gates whether the flag is written.
 *
 * Run: node --test tools/set-preview-flags.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCloudflareModeBuild, isPreviewBuild } from './set-preview-flags.js';

test('isCloudflareModeBuild: CI on preview branch → true', () => {
  assert.equal(isCloudflareModeBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'claude/blockchain-ministries-github-4lpvcf' }), true);
});

test('isCloudflareModeBuild: CI on main branch → true (M9.3 fix — production must build Cloudflare mode too)', () => {
  assert.equal(isCloudflareModeBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }), true);
});

test('isCloudflareModeBuild: CI with branch absent → still true', () => {
  assert.equal(isCloudflareModeBuild({ WORKERS_CI: '1' }), true);
});

test('isCloudflareModeBuild: local dev — WORKERS_CI absent → false', () => {
  assert.equal(isCloudflareModeBuild({ WORKERS_CI_BRANCH: 'some-feature' }), false);
});

test('isCloudflareModeBuild: empty env → false', () => {
  assert.equal(isCloudflareModeBuild({}), false);
});

test('isPreviewBuild: CI on preview branch → true', () => {
  assert.equal(isPreviewBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'claude/blockchain-ministries-github-4lpvcf' }), true);
});

test('isPreviewBuild: CI on main branch → false (classified as production, not preview)', () => {
  assert.equal(isPreviewBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }), false);
});

test('isPreviewBuild: CI with branch absent → still a preview build (not main)', () => {
  // Regression: old code treated !branch as production; new code treats
  // WORKERS_CI=1 + branch!="main" as preview even when branch is unset.
  assert.equal(isPreviewBuild({ WORKERS_CI: '1' }), true);
});

test('isPreviewBuild: local dev — WORKERS_CI absent → false', () => {
  assert.equal(isPreviewBuild({ WORKERS_CI_BRANCH: 'some-feature' }), false);
});

test('isPreviewBuild: empty env → false', () => {
  assert.equal(isPreviewBuild({}), false);
});
