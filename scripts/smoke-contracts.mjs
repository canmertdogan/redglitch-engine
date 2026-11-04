#!/usr/bin/env node
/**
 * Redglitch Tool Rescue — API contract smoke.
 *
 * Boots the Express server on a free port and verifies the contracts the
 * Studio tools depend on. No project is created and no user data is touched:
 * the single write test round-trips a scratch file under data/ and deletes it.
 *
 * Usage: node scripts/smoke-contracts.mjs [--verbose]
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const verbose = process.argv.includes('--verbose');

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function req(port, method, urlPath, body, headers = {}) {
  return new Promise((resolve) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const r = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: urlPath,
      headers: {
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
        ...headers,
      },
    }, (res) => {
      let buf = '';
      res.on('data', (d) => { buf += d; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(buf); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, body: buf, json });
      });
    });
    r.on('error', (e) => resolve({ status: 0, error: String(e) }));
    if (data) r.write(data);
    r.end();
  });
}

const checks = [];
const check = (name, fn) => checks.push({ name, fn });

check('GET /api/system/stats → 200 JSON with cpu/mem', async (p) => {
  const r = await req(p, 'GET', '/api/system/stats');
  return r.status === 200 && r.json && typeof r.json === 'object';
});

check('GET /api/projects/current → 200 with name', async (p) => {
  const r = await req(p, 'GET', '/api/projects/current');
  return r.status === 200 && r.json && typeof r.json.name === 'string';
});

for (const ep of ['items', 'npcs', 'quests', 'enemies', 'skills', 'variables']) {
  check(`GET /api/${ep} → 200 array`, async (p) => {
    const r = await req(p, 'GET', `/api/${ep}`);
    return r.status === 200 && Array.isArray(r.json);
  });
}

check('GET /dunyalar/definitions/achievements.json → 200 (overlay, editor path)', async (p) => {
  const r = await req(p, 'GET', '/dunyalar/definitions/achievements.json');
  return r.status === 200 && Array.isArray(r.json);
});

check('GET /api/dialogues → 200 (file object or array fallback)', async (p) => {
  const r = await req(p, 'GET', '/api/dialogues');
  if (r.status !== 200) return false;
  if (Array.isArray(r.json)) return true; // route falls back to [] when missing
  return Array.isArray(r.json?.conversations) && Array.isArray(r.json?.characters);
});

check('GET /api/fx/list → 200 array', async (p) => {
  const r = await req(p, 'GET', '/api/fx/list');
  return r.status === 200 && Array.isArray(r.json);
});

check('GET /api/shaders/list → 200 array', async (p) => {
  const r = await req(p, 'GET', '/api/shaders/list');
  return r.status === 200 && Array.isArray(r.json);
});

check('GET /api/logic/list → 200 array', async (p) => {
  const r = await req(p, 'GET', '/api/logic/list');
  return r.status === 200 && Array.isArray(r.json);
});

check('GET /api/audio/map → 200 JSON', async (p) => {
  const r = await req(p, 'GET', '/api/audio/map');
  return r.status === 200 && r.json && typeof r.json === 'object';
});

check('GET /api/audio/assets → 200', async (p) => {
  const r = await req(p, 'GET', '/api/audio/assets');
  return r.status === 200;
});

check('GET /api/audio/discover-events → 200', async (p) => {
  const r = await req(p, 'GET', '/api/audio/discover-events');
  return r.status === 200;
});

check('GET /api/levels → 200 { levels: [...] }', async (p) => {
  const r = await req(p, 'GET', '/api/levels');
  return r.status === 200 && Array.isArray(r.json?.levels);
});

check('GET /api/levels/<first>.json → 200 JSON level', async (p) => {
  const list = await req(p, 'GET', '/api/levels');
  const first = list.json?.levels?.[0];
  if (!first) return 'SKIP (no levels in ROOT starter data)';
  const r = await req(p, 'GET', `/api/levels/${encodeURIComponent(first)}.json`);
  return r.status === 200 && r.json && typeof r.json === 'object';
});

check('GET /api/levels/<missing>.json → 404', async (p) => {
  const r = await req(p, 'GET', '/api/levels/definitely-not-a-level-xyz.json');
  return r.status === 404;
});

check('GET /api/assets → 200 { assets: [...] } envelope', async (p) => {
  const r = await req(p, 'GET', '/api/assets');
  return r.status === 200 && Array.isArray(r.json?.assets);
});

check('GET /api/ide/tree → 200 array', async (p) => {
  const r = await req(p, 'GET', '/api/ide/tree');
  return r.status === 200 && Array.isArray(r.json);
});

check('GET /api/ide/list?dir=engine/fonts → 200 array (public fallback)', async (p) => {
  const r = await req(p, 'GET', '/api/ide/list?dir=engine/fonts');
  if (r.status === 403) return false; // guard must allow engine/ prefix
  return r.status === 200 && Array.isArray(r.json);
});

check('GET /api/ide/read data/characters/hero.json → 200', async (p) => {
  const r = await req(p, 'GET', '/api/ide/read?file=' + encodeURIComponent('data/characters/hero.json'));
  return r.status === 200 && typeof r.body === 'string' && r.body.includes('"name"');
});

check('GET /api/templates/quest → 200', async (p) => {
  const r = await req(p, 'GET', '/api/templates/quest');
  return r.status === 200 && Array.isArray(r.json);
});

check('POST /api/ide/write → read → delete roundtrip', async (p) => {
  const file = 'data/.smoke-contract.tmp';
  const w = await req(p, 'POST', '/api/ide/write', { file, content: 'smoke-contract-ok' });
  if (w.status !== 200 || !w.json?.success) return false;
  const r = await req(p, 'GET', '/api/ide/read?file=' + encodeURIComponent(file));
  if (r.status !== 200 || !r.body.includes('smoke-contract-ok')) return false;
  const d = await req(p, 'POST', '/api/ide/delete', { file });
  return d.status === 200 && d.json?.success !== false;
});

async function waitForServer(port, proc, serverLog) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) throw new Error(`Server exited early (code ${proc.exitCode}).\n${serverLog()}`);
    const r = await req(port, 'GET', '/api/system/stats');
    if (r.status === 200) return;
    await new Promise((res) => setTimeout(res, 250));
  }
  throw new Error(`Server did not become ready in 25s.\n${serverLog()}`);
}

const port = await findFreePort();
const lines = [];
const server = spawn(process.execPath, ['server.js'], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port), REDGLITCH_HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (d) => { lines.push(d.toString()); if (lines.length > 40) lines.shift(); });
server.stderr.on('data', (d) => { lines.push(d.toString()); if (lines.length > 40) lines.shift(); });
const serverLog = () => lines.join('');

try {
  await waitForServer(port, server, serverLog);
  console.log(`[contracts] server ready on :${port} — ${checks.length} checks`);
  let passed = 0, failed = 0, skipped = 0;
  for (const { name, fn } of checks) {
    let ok;
    try {
      ok = await fn(port);
    } catch (err) {
      ok = false;
      if (verbose) console.error(`  exception: ${err?.message || err}`);
    }
    if (typeof ok === 'string' && ok.startsWith('SKIP')) {
      skipped++;
      console.log(`  SKIP  ${name}`);
    } else if (ok) {
      passed++;
      if (verbose) console.log(`  ok    ${name}`);
    } else {
      failed++;
      console.error(`  FAIL  ${name}`);
    }
  }
  console.log(`[contracts] ${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exitCode = failed ? 1 : 0;
} catch (err) {
  console.error(`[contracts] ${err?.message || err}`);
  process.exitCode = 2;
} finally {
  server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 400));
  if (server.exitCode === null) server.kill('SIGKILL');
  // Belt-and-braces cleanup of the scratch file in case delete failed mid-test.
  try { fs.rmSync(path.join(ROOT, 'data', '.smoke-contract.tmp'), { force: true }); } catch { /* best effort */ }
}
