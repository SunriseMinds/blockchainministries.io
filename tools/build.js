#!/usr/bin/env node
/**
 * Cross-platform build orchestrator (Windows cmd/PowerShell, Git Bash, Linux CI).
 * Replaces a POSIX `||`/`&&` chain in the npm "build" script that cmd.exe
 * mis-parses on Windows, silently skipping `vite build` while exiting 0.
 *
 * Steps, same order/semantics as before:
 *   1. generate-llms.js  — failure tolerated (never blocks the build)
 *   2. set-preview-flags.js — must succeed
 *   3. vite build (via Vite's JS API, not the CLI, so no shell/binary lookup is needed)
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const toolsDir = path.dirname(fileURLToPath(import.meta.url));

function runNodeScript(relativePath) {
  const result = spawnSync(process.execPath, [path.join(toolsDir, relativePath)], {
    stdio: 'inherit',
  });
  return result.status === 0;
}

if (!runNodeScript('generate-llms.js')) {
  console.warn('[build] generate-llms.js failed — continuing anyway');
}

if (!runNodeScript('set-preview-flags.js')) {
  console.error('[build] set-preview-flags.js failed');
  process.exit(1);
}

const { build } = await import('vite');
try {
  await build();
} catch (error) {
  console.error('[build] vite build failed:', error);
  process.exit(1);
}
