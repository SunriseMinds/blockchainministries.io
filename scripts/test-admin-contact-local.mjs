#!/usr/bin/env node
/**
 * M10.1 local integration test — admin overview endpoints (D1-backed, not
 * Supabase) and the contact/scroll-request routes, against a real Workers
 * runtime (Miniflare via `wrangler dev --local`, the existing
 * wrangler.test.jsonc — no remote Cloudflare resource touched).
 *
 * Run: node scripts/test-admin-contact-local.mjs
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = 18801;
const BASE = `http://127.0.0.1:${PORT}`;
const PERSIST_DIR = mkdtempSync(path.join(tmpdir(), 'bm-m101-d1-'));

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

/** wrangler d1 execute has no --param flag — values are inlined (test-only, controlled inputs, never user input). */
function sqlStr(v) {
  return `'${String(v).replace(/'/g, "''")}'`;
}
function d1Exec(sql) {
  const cmdArgs = [
    path.join(ROOT, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute',
    'blockchain-ministries-db', '--local', '--config', 'wrangler.test.jsonc',
    '--persist-to', PERSIST_DIR, '--json', '--command', sql,
  ];
  return JSON.parse(execFileSync(process.execPath, cmdArgs, { cwd: ROOT, encoding: 'utf8' }));
}

async function waitForReady(child, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const onData = (d) => {
      buf += d.toString();
      if (buf.includes('Ready on')) { child.stdout.off('data', onData); resolve(); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (d) => { buf += d.toString(); });
    setTimeout(() => reject(new Error(`wrangler dev did not become ready in time. Output:\n${buf}`)), timeoutMs);
  });
}

async function main() {
  console.log('=== Applying migrations 0001 + 0002 to a fresh local D1 ===');
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
    await fetch(`${BASE}/api/health`); // warm-up, see M9.8 script

    /* ------------------------------------------------------- CONTACT FORM -- */
    console.log('=== POST /api/contact — validation (missing name) ===');
    let res = await fetch(`${BASE}/api/contact`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'fixture@example.invalid', message: 'hi' }),
    });
    check('missing required field -> 400', res.status === 400);

    console.log('\n=== POST /api/contact — success ===');
    res = await fetch(`${BASE}/api/contact`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Fixture Sender', email: 'fixture@example.invalid', message: 'Integration test message', inquiry_type: 'General Inquiry' }),
    });
    const contactBody = await res.json();
    check('valid submission -> 201', res.status === 201);
    check('response has an id', Boolean(contactBody.id));
    const contactRow = d1Exec(`SELECT * FROM contact_inquiries WHERE id = ${sqlStr(contactBody.id)}`).at(0).results[0];
    check('D1 row created with correct fields', contactRow?.name === 'Fixture Sender' && contactRow?.inquiry_type === 'General Inquiry');
    d1Exec(`DELETE FROM contact_inquiries WHERE id = ${sqlStr(contactBody.id)}`);

    /* --------------------------------------------------- SCROLL REQUEST -- */
    console.log('\n=== POST /api/scrolls/requests — validation (missing request_type) ===');
    res = await fetch(`${BASE}/api/scrolls/requests`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Fixture Sender', email: 'fixture@example.invalid' }),
    });
    check('missing required field -> 400', res.status === 400);

    console.log('\n=== POST /api/scrolls/requests — success ===');
    res = await fetch(`${BASE}/api/scrolls/requests`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Fixture Sender', email: 'fixture@example.invalid', request_type: 'Diplomatic Credentials', message: 'Integration test' }),
    });
    const scrollBody = await res.json();
    check('valid submission -> 201', res.status === 201);
    check('response has an id', Boolean(scrollBody.id));
    const scrollRow = d1Exec(`SELECT * FROM scroll_requests WHERE id = ${sqlStr(scrollBody.id)}`).at(0).results[0];
    check('D1 row created with correct fields', scrollRow?.name === 'Fixture Sender' && scrollRow?.request_type === 'Diplomatic Credentials');
    d1Exec(`DELETE FROM scroll_requests WHERE id = ${sqlStr(scrollBody.id)}`);

    /* -------------------------------------------------- ADMIN OVERVIEW -- */
    console.log('\n=== Set up a synthetic admin session ===');
    const email = `m101-admin-${Date.now()}@example.invalid`;
    await fetch(`${BASE}/api/auth/signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, display_name: 'M101 Admin Fixture' }),
    });
    const userId = d1Exec(`SELECT id FROM users WHERE email = ${sqlStr(email)}`).at(0).results[0].id;

    const rawToken = randomToken();
    const tokenId = crypto.randomUUID();
    const tokenHash = sha256Hex(rawToken);
    const expiresAt = new Date(Date.now() + 900000).toISOString();
    d1Exec(
      `INSERT INTO login_tokens (id, user_id, token_hash, expires_at, consumed_at, created_at) VALUES (${sqlStr(tokenId)}, ${sqlStr(userId)}, ${sqlStr(tokenHash)}, ${sqlStr(expiresAt)}, NULL, datetime('now'))`,
    );

    // Consume with a manual cookie jar (single fetch call, capture Set-Cookie ourselves).
    const consumeRes = await fetch(`${BASE}/api/auth/login-link/consume`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: rawToken }),
    });
    const setCookie = consumeRes.headers.get('set-cookie');
    const cookieHeader = setCookie ? setCookie.split(';')[0] : '';
    check('login-link consume established a session', consumeRes.status === 200 && Boolean(cookieHeader));

    console.log('\n=== Admin endpoints reject a non-admin member ===');
    res = await fetch(`${BASE}/api/admin/profiles`, { headers: { Cookie: cookieHeader } });
    check('non-admin -> 403', res.status === 403);

    console.log('\n=== Promote to admin in D1 (simulates an already-admin account) ===');
    d1Exec(`UPDATE users SET role = 'admin' WHERE id = ${sqlStr(userId)}`);

    console.log('\n=== Admin overview endpoints (same session, now admin) ===');
    for (const [label, path_] of [
      ['profiles', '/api/admin/profiles'],
      ['donations', '/api/admin/donations'],
      ['scrolls', '/api/admin/scrolls'],
      ['memberships (status=all)', '/api/admin/memberships?status=all'],
      ['ordinations (status=all)', '/api/admin/ordinations?status=all'],
    ]) {
      const r = await fetch(`${BASE}${path_}`, { headers: { Cookie: cookieHeader } });
      const body = await r.json();
      check(`${label} -> 200 with items array`, r.status === 200 && Array.isArray(body.items));
    }

    console.log('\n=== Cleanup (local disposable D1 only) ===');
    d1Exec(`DELETE FROM sessions WHERE user_id = ${sqlStr(userId)}`);
    d1Exec(`DELETE FROM login_tokens WHERE user_id = ${sqlStr(userId)}`);
    d1Exec(`DELETE FROM users WHERE id = ${sqlStr(userId)}`);
    console.log('done.');
  } finally {
    child.kill();
    await new Promise((r) => setTimeout(r, 500));
    try { rmSync(PERSIST_DIR, { recursive: true, force: true }); }
    catch (e) { console.warn(`(non-fatal) could not remove temp dir ${PERSIST_DIR}: ${e.message}`); }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
