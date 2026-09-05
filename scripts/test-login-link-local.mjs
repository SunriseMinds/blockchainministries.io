#!/usr/bin/env node
/**
 * M9.8 magic-link auth: local integration test against a real Workers
 * runtime (Miniflare via `wrangler dev --local`), using wrangler.test.jsonc
 * — the existing local-only config (LOCAL D1/KV/R2, no real Cloudflare
 * resource touched, no secrets). Applies migrations 0001+0002 to a fresh,
 * disposable local persist directory, starts a local dev server, drives the
 * real HTTP routes end-to-end, and tears everything down.
 *
 * This is the closest thing this repo has to a route-level test suite —
 * there is no framework here for testing Worker routes in isolation from a
 * running Worker, so this drives the actual thing instead of mocking it.
 *
 * Run: node scripts/test-login-link-local.mjs
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 18799;
const BASE = `http://127.0.0.1:${PORT}`;
const PERSIST_DIR = mkdtempSync(path.join(tmpdir(), 'bm-m98-d1-'));

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}`); }
}

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}
function randomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

async function postJson(pathname, body) {
  const t0 = performance.now();
  const res = await fetch(`${BASE}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const ms = performance.now() - t0;
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data, ms, headers: res.headers };
}

function d1Exec(sql) {
  return execFileSync(
    process.execPath,
    [
      path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute',
      'blockchain-ministries-db', '--local', '--config', 'wrangler.test.jsonc',
      '--persist-to', PERSIST_DIR, '--json', '--command', sql,
    ],
    { cwd: ROOT, encoding: 'utf8' },
  );
}

async function waitForReady(child, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (d) => {
      buf += d.toString();
      if (buf.includes('Ready on')) {
        child.stdout.off('data', onData);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => { buf += d.toString(); });
    setTimeout(() => reject(new Error(`wrangler dev did not become ready in time. Output:\n${buf}`)), timeoutMs);
  });
}

async function main() {
  console.log('=== Applying migrations 0001 + 0002 to a fresh local D1 (disposable, gitignored temp dir) ===');
  execFileSync(
    process.execPath,
    [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'migrations', 'apply',
      'blockchain-ministries-db', '--local', '--config', 'wrangler.test.jsonc', '--persist-to', PERSIST_DIR],
    { cwd: ROOT, stdio: 'inherit' },
  );

  console.log('\n=== Starting local wrangler dev (Miniflare, no remote resource touched) ===');
  const child = spawn(
    process.execPath,
    [path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'dev',
      '--config', 'wrangler.test.jsonc', '--local', '--persist-to', PERSIST_DIR, '--port', String(PORT)],
    { cwd: ROOT },
  );
  child.on('error', (e) => console.error('spawn error', e));

  try {
    await waitForReady(child);
    console.log('Ready.\n');

    // Warm-up call so the isolate's first-request JIT/startup cost doesn't
    // get mistaken for KDF cost in the signup timing check below.
    await fetch(`${BASE}/api/health`);

    // ---- SIGNUP ---------------------------------------------------------
    console.log('=== Signup ===');
    const email = `m98-test-${Date.now()}@example.invalid`;
    const signupRes = await postJson('/api/auth/signup', { email, display_name: 'M98 Test' });
    check('signup returns 201', signupRes.status === 201);
    // Threshold is generous (wall time, includes two D1 writes + an email
    // send — I/O wait, not CPU) — the point is proving the ABSENCE of a
    // ~220-650ms Argon2id/PBKDF2-class spike (measured in M9.6), not
    // asserting a tight performance budget.
    check('signup has no Argon2/PBKDF2-class CPU spike (well under 200ms)', signupRes.ms < 200);
    console.log(`    (signup wall time: ${signupRes.ms.toFixed(1)} ms)`);

    const userRow = JSON.parse(d1Exec(`SELECT id, password_hash, email_verified FROM users WHERE email = '${email}'`)).at(0).results[0];
    check('signup uses the unusable sentinel format, not a real hash', userRow.password_hash.startsWith('!migrated:'));
    check('signup does not pre-verify email (only login-link consumption does)', userRow.email_verified === 0);
    const userId = userRow.id;

    // ---- REQUEST: malformed email ---------------------------------------
    console.log('\n=== Request: malformed email ===');
    const malformed = await postJson('/api/auth/login-link/request', { email: 'not-an-email' });
    check('malformed email is rejected (400)', malformed.status === 400);

    // ---- REQUEST: known vs unknown email, anti-enumeration ---------------
    console.log('\n=== Request: known vs unknown email (anti-enumeration) ===');
    const knownRes = await postJson('/api/auth/login-link/request', { email });
    const unknownRes = await postJson('/api/auth/login-link/request', { email: `nobody-${Date.now()}@example.invalid` });
    check('known-email request returns 200', knownRes.status === 200);
    check('unknown-email request returns 200 (not 404/differentiated)', unknownRes.status === 200);
    check('response body is byte-identical for known vs unknown email', JSON.stringify(knownRes.data) === JSON.stringify(unknownRes.data));

    const tokenRow = JSON.parse(d1Exec(`SELECT token_hash FROM login_tokens WHERE user_id = '${userId}' ORDER BY created_at DESC LIMIT 1`)).at(0).results[0];
    check('raw token is never stored — only its hash is in D1', tokenRow.token_hash.length === 64 && /^[0-9a-f]+$/.test(tokenRow.token_hash));

    // ---- REQUEST: rate limiting -------------------------------------------
    console.log('\n=== Request: rate limiting (policy allows 5 per 15 min) ===');
    let rateLimited = false;
    for (let i = 0; i < 6; i++) {
      const r = await postJson('/api/auth/login-link/request', { email });
      if (r.status === 429) { rateLimited = true; break; }
    }
    check('6th rapid request in the window is rate-limited (429)', rateLimited);

    // ---- CONSUME: invalid / expired / valid / reused ---------------------
    console.log('\n=== Consume: invalid token ===');
    const invalidRes = await postJson('/api/auth/login-link/consume', { token: randomToken() });
    check('unknown token is rejected (400)', invalidRes.status === 400);

    console.log('\n=== Consume: expired token ===');
    const expiredToken = randomToken();
    const expiredHash = sha256Hex(expiredToken);
    d1Exec(`INSERT INTO login_tokens (id, user_id, token_hash, expires_at, consumed_at, created_at) VALUES ('m98-expired', '${userId}', '${expiredHash}', '2020-01-01T00:00:00.000Z', NULL, '2020-01-01T00:00:00.000Z')`);
    const expiredRes = await postJson('/api/auth/login-link/consume', { token: expiredToken });
    check('expired token is rejected (400)', expiredRes.status === 400);

    console.log('\n=== Consume: valid token creates a session ===');
    const validToken = randomToken();
    const validHash = sha256Hex(validToken);
    const futureIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    d1Exec(`INSERT INTO login_tokens (id, user_id, token_hash, expires_at, consumed_at, created_at) VALUES ('m98-valid', '${userId}', '${validHash}', '${futureIso}', NULL, '${new Date().toISOString()}')`);
    const validRes = await postJson('/api/auth/login-link/consume', { token: validToken });
    check('valid token consumption returns 200', validRes.status === 200);
    check('response contains the user (session established)', validRes.data?.user?.id === userId);
    check('email_verified is now true (proof of email ownership via link click)', validRes.data?.user?.email_verified === true);
    const sessionCount = JSON.parse(d1Exec(`SELECT count(*) c FROM sessions WHERE user_id = '${userId}'`)).at(0).results[0].c;
    check('exactly one session row now exists for this user', sessionCount === 1);
    check('consume fits comfortably inside Free CPU budget (no KDF call)', validRes.ms < 100);
    console.log(`    (consume wall time: ${validRes.ms.toFixed(1)} ms)`);

    console.log('\n=== Consume: reused token cannot create a second session ===');
    const reuseRes = await postJson('/api/auth/login-link/consume', { token: validToken });
    check('reusing the same token is rejected (400)', reuseRes.status === 400);
    const sessionCountAfterReuse = JSON.parse(d1Exec(`SELECT count(*) c FROM sessions WHERE user_id = '${userId}'`)).at(0).results[0].c;
    check('still exactly one session row (no second session created)', sessionCountAfterReuse === 1);

    // ---- cleanup ------------------------------------------------------
    console.log('\n=== Cleanup (local disposable D1 only) ===');
    d1Exec(`DELETE FROM sessions WHERE user_id = '${userId}'`);
    d1Exec(`DELETE FROM login_tokens WHERE user_id = '${userId}'`);
    d1Exec(`DELETE FROM users WHERE id = '${userId}'`);
    console.log('done.');
  } finally {
    child.kill();
    // Miniflare may still hold file handles open for a moment after kill();
    // this is disposable OS-temp-dir cleanup, not a test result, so don't
    // let a transient EBUSY here mask the actual pass/fail summary above.
    await new Promise((r) => setTimeout(r, 500));
    try {
      rmSync(PERSIST_DIR, { recursive: true, force: true });
    } catch (e) {
      console.warn(`(non-fatal) could not remove temp dir ${PERSIST_DIR}: ${e.message}`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
