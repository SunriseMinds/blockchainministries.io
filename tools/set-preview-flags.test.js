/**
 * Regression tests for the preview-build flag detection in set-preview-flags.js.
 *
 * Root cause of the M9.1 signup bug: when WORKERS_CI_BRANCH was absent,
 * isProductionBranch was true, VITE_USE_CLOUDFLARE_API was never written,
 * and the preview SPA built with USE_CLOUDFLARE_API=false — routing Join.jsx
 * to supabase.functions.invoke() instead of the Cloudflare Worker path.
 *
 * Run: node --test tools/set-preview-flags.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPreviewBuild } from './set-preview-flags.js';

test('CI on preview branch → flag should be set', () => {
  assert.equal(isPreviewBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'claude/blockchain-ministries-github-4lpvcf' }), true);
});

test('CI on main branch → flag must NOT be set (production deploy)', () => {
  assert.equal(isPreviewBuild({ WORKERS_CI: '1', WORKERS_CI_BRANCH: 'main' }), false);
});

test('CI with branch absent → still a preview build (not main)', () => {
  // Regression: old code treated !branch as production; new code treats
  // WORKERS_CI=1 + branch!="main" as preview even when branch is unset.
  assert.equal(isPreviewBuild({ WORKERS_CI: '1' }), true);
});

test('local dev — WORKERS_CI absent → flag must NOT be set', () => {
  assert.equal(isPreviewBuild({ WORKERS_CI_BRANCH: 'some-feature' }), false);
});

test('empty env → flag must NOT be set', () => {
  assert.equal(isPreviewBuild({}), false);
});
