#!/usr/bin/env node
/**
 * Redglitch Tool Rescue — smoke harness (orchestrator).
 *
 * Boots the Express server on a free port, loads every registered Studio tool
 * (plus the unregistered public pages) in a hidden Electron window and writes:
 *   docs/tools/audit.json   (raw data)
 *   docs/tools/AUDIT.md     (human report, regenerated every run)
 * Screenshots land in docs/tools/smoke/<id>.png
 *
 * Usage:
 *   node scripts/smoke-tools.mjs [--ci] [--filter=<substr>] [--no-shots] [--verbose]
 *
 *   --ci          exit 1 when any *registered* tool fails the smoke check
 *   --filter=foo  only run tools whose id or src contains "foo"
 *   --no-shots    skip screenshots
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STUDIO_JS = path.join(ROOT, 'public', 'js', 'Studio.js');
const DOCS_DIR = path.join(ROOT, 'docs', 'tools');
const SHOTS_DIR = path.join(DOCS_DIR, 'smoke');
const TMP_PREFIX = path.join(os.tmpdir(), 'redglitch-smoke-');

const args = process.argv.slice(2);
const flag = {
  ci: args.includes('--ci'),
  noShots: args.includes('--no-shots'),
  verbose: args.includes('--verbose'),
  filter: (args.find((a) => a.startsWith('--filter=')) || '').split('=')[1] || null,
};
if (args.includes('--help')) {
  console.log('Usage: node scripts/smoke-tools.mjs [--ci] [--filter=<substr>] [--no-shots] [--verbose] [--jobs=N]');
  process.exit(0);
}
// Filtered runs get their own report files so they never clobber the full audit.
const SLUG = flag.filter ? flag.filter.replace(/[^a-z0-9_-]/gi, '_') : null;
const AUDIT_JSON = path.join(DOCS_DIR, SLUG ? `audit.${SLUG}.json` : 'audit.json');
const AUDIT_MD = path.join(DOCS_DIR, SLUG ? `AUDIT.${SLUG}.md` : 'AUDIT.md');

// Pages that ship in public/ but are not part of the Studio tool registry.
const UNREGISTERED = [
  'index.html',
  'launcher.html',
  'splash.html',
  'slot_selection.html',
  'campaign_browser.html',
  'campaign_launcher.html',
  'campaign_runtime.html',
  'iso_play.html',
  'docs.html',
  'credits.html',
  'preferences.html',
  'logic_editor.html',
  'tools.html',
];

function parseToolsFromStudioJs(source) {
  const tools = [];
  const re = /\{\s*id:\s*'([^']+)'([^}]*)\}/g;
  let m;
  while ((m = re.exec(source))) {
    const id = m[1];
    const body = m[2];
    const src = body.match(/src:\s*'([^']+)'/)?.[1];
    const category = body.match(/category:\s*'([^']+)'/)?.[1] || '';
    const title = body.match(/title:\s*'([^']+)'/)?.[1] || id;
    const status = body.match(/status:\s*'([^']+)'/)?.[1] || 'stable';
    // Hidden entries stay in the registry for future revival but are not part of the product surface.
    if (src && status !== 'hidden') tools.push({ id, src, category, title, group: 'registered' });
  }
  return tools;
}

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

function httpGet(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false, status: 0 }); });
    req.on('error', () => resolve({ ok: false, status: 0 }));
  });
}

async function waitForServer(port, proc, serverLog) {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`Server exited early (code ${proc.exitCode}).\n${serverLog()}`);
    }
    const res = await httpGet(`http://127.0.0.1:${port}/api/system/stats`);
    if (res.ok) return port;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not become ready within 25s.\n${serverLog()}`);
}

function gitValue(args) {
  const res = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return (res.stdout || '').trim();
}

function classify(r) {
  if (r.crashed || r.timedOut || !r.loadOk) return 'FAIL';
  if (r.mainFrameStatus && r.mainFrameStatus >= 400) return 'FAIL';
  if ((r.bodyTextLen ?? 0) === 0 && (r.bodyChildren ?? 0) === 0 && !r.hasRoot) return 'FAIL';
  if ((r.consoleErrors?.length ?? 0) > 0) return 'WARN';
  if ((r.failedRequests?.length ?? 0) > 0) return 'WARN';
  if ((r.httpErrors?.length ?? 0) > 0) return 'WARN';
  return 'OK';
}

// Chromium in isolated "smoke-*" partitions reports cache misses for these
// same-origin font/icon files even though they fetch fine (verified with
// curl) — they are audit noise, not tool failures. Excluded from verdicts.
const NOISE_RE = /(\/fonts\/VT323\.ttf|\/fonts\/fonts\.css|\/lib\/fontawesome\/webfonts\/|\/fonts\.googleapis\.com|\/fonts\.gstatic\.com|\/s\/vt323\/)/;
function isNoiseFailure(entry) {
  return entry && entry.error === 'net::ERR_CACHE_MISS' && NOISE_RE.test(String(entry.url || ''));
}

function stripNoise(r) {
  const before = (r.failedRequests || []).length;
  r.failedRequests = (r.failedRequests || []).filter((f) => !isNoiseFailure(f));
  r.httpErrors = (r.httpErrors || []).filter((h) => !isNoiseFailure(h));
  r.noiseFiltered = before - r.failedRequests.length;
  return r;
}

function syntheticCrash(tool, why, electronLog = '') {
  return {
    id: tool.id,
    src: tool.src,
    group: tool.group || 'registered',
    url: tool.src,
    loadOk: false,
    timedOut: /timeout/i.test(why),
    crashed: true,
    mainFrameStatus: null,
    consoleErrors: [{ level: 'error', message: `smoke crashed: ${why}`, sourceId: 'electron', lineNumber: null }],
    consoleWarnings: [],
    failedRequests: [],
    httpErrors: [],
    bodyTextLen: 0,
    bodyChildren: 0,
    hasRoot: false,
    rootChildren: 0,
    title: '',
    loadMs: 0,
    screenshot: null,
    rawLog: String(electronLog).slice(-2000),
  };
}

function fmtRow(cells) {
  return `| ${cells.join(' | ')} |`;
}

function buildMarkdown(report) {
  const { meta, results } = report;
  const lines = [];
  lines.push('# Tool Smoke Audit');
  lines.push('');
  lines.push('> Regenerated by `scripts/smoke-tools.mjs` — manual notes belong in PRs, not in this file.');
  lines.push('');
  const noiseTotal = results.reduce((acc, r) => acc + (r.noiseFiltered || 0), 0);
  lines.push(`- Date: ${meta.ranAt}`);
  lines.push(`- Commit: \`${meta.commit}\` (${meta.branch})`);
  lines.push(`- Server: \`${meta.base}\``);
  if (noiseTotal) lines.push(`- ${noiseTotal} font/icon cache-misses excluded as Chromium partition noise`);
  lines.push('');
  const tally = { OK: 0, WARN: 0, FAIL: 0 };
  for (const r of results) tally[classify(r)]++;
  lines.push(`## Summary — ${tally.FAIL} FAIL / ${tally.WARN} WARN / ${tally.OK} OK (${results.length} pages)`);
  lines.push('');
  lines.push('Verdicts: **FAIL** = crashed / timed out / load error / blank page. **WARN** = loaded but console errors or failed/>=400 requests.');
  lines.push('');

  const groups = ['registered', 'unregistered'];
  for (const group of groups) {
    const rows = results.filter((r) => (r.group || 'registered') === group);
    if (!rows.length) continue;
    lines.push(`## ${group === 'registered' ? 'Registered tools (Studio registry)' : 'Unregistered public pages'}`);
    lines.push('');
    lines.push(fmtRow(['Tool', 'Source', 'HTTP', 'Console err', 'Failed req', 'Verdict', 'Shot']));
    lines.push('|---|---|---|---|---|---|---|');
    for (const r of rows) {
      const v = classify(r);
      const http = r.mainFrameStatus ?? (r.loadOk ? 200 : '—');
      lines.push(fmtRow([
        r.id,
        `\`${r.src}\``,
        String(http),
        String(r.consoleErrors?.length ?? 0),
        String(r.failedRequests?.length ?? 0),
        v,
        r.screenshot ? `[png](${r.screenshot.replace(/^docs\/tools\//, '')})` : '—',
      ]));
    }
    lines.push('');
  }

  const failing = results.filter((r) => classify(r) !== 'OK');
  if (failing.length) {
    lines.push('## Details (non-OK)');
    lines.push('');
    for (const r of failing) {
      lines.push(`### ${r.id} — ${classify(r)} (\`${r.src}\`)`);
      if (r.redirected) lines.push('- Redirected by the page itself (ERR_ABORTED); followed the redirect target.');
      if (r.timedOut) lines.push('- **Timed out** waiting for load (20s).');
      if (r.crashed) lines.push('- **Renderer crashed** or loadURL threw.');
      if (r.mainFrameStatus && r.mainFrameStatus >= 400) lines.push(`- Main document returned HTTP ${r.mainFrameStatus}.`);
      if ((r.bodyTextLen ?? 0) === 0 && (r.bodyChildren ?? 0) === 0 && !r.hasRoot) lines.push('- **Blank page heuristics matched** (no text, no body children, no app root).');
      for (const e of (r.consoleErrors || []).slice(0, 12)) {
        lines.push(`- console.error: ${e.message}${e.sourceId && e.sourceId !== 'electron' ? ` (${e.sourceId}${e.lineNumber ? `:${e.lineNumber}` : ''})` : ''}`);
      }
      for (const f of (r.failedRequests || []).slice(0, 12)) {
        lines.push(`- request failed: \`${f.url}\` — ${f.error || ''}`);
      }
      for (const h of (r.httpErrors || []).slice(0, 12)) {
        if (h.resourceType === 'mainFrame') continue; // already reported above
        lines.push(`- HTTP ${h.status}: \`${h.url}\``);
      }
      lines.push('');
    }
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const studioSrc = fs.readFileSync(STUDIO_JS, 'utf8');
  let tools = parseToolsFromStudioJs(studioSrc);
  if (!tools.length) {
    console.error('[smoke] No tools parsed from public/js/Studio.js — aborting.');
    process.exit(2);
  }
  for (const src of UNREGISTERED) {
    const name = src.replace(/\.html$/, '');
    tools.push({ id: name, src, category: '', title: name, group: 'unregistered' });
  }
  if (flag.filter) tools = tools.filter((t) => (t.id + ' ' + t.src).includes(flag.filter));

  const tmpDir = fs.mkdtempSync(TMP_PREFIX);

  const port = await findFreePort();
  const base = `http://127.0.0.1:${port}`;

  const serverLines = [];
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), REDGLITCH_HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (d) => { serverLines.push(d.toString()); if (serverLines.length > 60) serverLines.shift(); });
  server.stderr.on('data', (d) => { serverLines.push(d.toString()); if (serverLines.length > 60) serverLines.shift(); });

  const serverLog = () => serverLines.join('');
  let exitCode = 0;
  try {
    await waitForServer(port, server, serverLog);
    console.log(`[smoke] Server ready on ${base} — auditing ${tools.length} pages`);

    const electronBin = path.join(ROOT, 'node_modules', '.bin', 'electron');
    if (!fs.existsSync(electronBin)) throw new Error(`Electron binary not found at ${electronBin} (run npm install)`);

    if (!flag.noShots) fs.mkdirSync(SHOTS_DIR, { recursive: true });

    // Run each page in its own Electron process: heavy WebGL pages can SIGTRAP
    // the browser process, and one crash must not take the whole audit down.
    // Default to sequential: hidden windows on a busy machine get throttled
    // enough that did-finish-load misses the 20s budget if several Chromium
    // instances run in parallel. Opt in with --jobs=N if you accept that risk.
    const JOBS = Number((args.find((a) => a.startsWith('--jobs=')) || '').split('=')[1]) || 1;

    const auditOne = async (tool, i) => {
      const toolTmp = path.join(tmpDir, `tool-${i}.json`);
      const resTmp = path.join(tmpDir, `res-${i}.json`);
      fs.writeFileSync(toolTmp, JSON.stringify([tool]));

      const child = spawn(electronBin, [path.join(ROOT, 'scripts', 'smoke-electron-main.mjs')], {
        cwd: ROOT,
        env: {
          ...process.env,
          SMOKE_BASE: base,
          SMOKE_TOOLS: toolTmp,
          SMOKE_OUT: resTmp,
          SMOKE_SHOTS: flag.noShots ? '' : SHOTS_DIR,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let electronLog = '';
      child.stdout.on('data', (d) => { electronLog += d; });
      child.stderr.on('data', (d) => { electronLog += d; });
      let childTimedOut = false;
      const PAGE_KILL_MS = Number(process.env.SMOKE_PAGE_KILL_MS) || 45000;
      const code = await new Promise((resolve) => {
        const timer = setTimeout(() => { childTimedOut = true; child.kill('SIGKILL'); resolve(124); }, PAGE_KILL_MS);
        child.on('exit', (c) => { clearTimeout(timer); resolve(c ?? 1); });
        child.on('error', () => { clearTimeout(timer); resolve(127); });
      });

      if (fs.existsSync(resTmp)) {
        try {
          const fragment = JSON.parse(fs.readFileSync(resTmp, 'utf8'));
          return fragment.results[0];
        } catch (err) {
          return syntheticCrash(tool, `unreadable result file: ${err?.message || err}`);
        }
      }
      const why = childTimedOut ? 'hard timeout (45s)' : `process exited without writing results (code ${code})`;
      if (flag.verbose && electronLog.trim()) console.log(electronLog.trim());
      return syntheticCrash(tool, why, electronLog);
    };

    const results = new Array(tools.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(JOBS, tools.length) }, async () => {
      while (true) {
        const i = next++;
        if (i >= tools.length) break;
        const tool = tools[i];
        process.stdout.write(`[smoke] [${i + 1}/${tools.length}] ${tool.id} ... `);
        const r = await auditOne(tool, i);
        stripNoise(r);
        results[i] = r;
        console.log(classify(r));
      }
    });
    await Promise.all(workers);

    const meta = {
      ranAt: new Date().toISOString(),
      base,
      commit: gitValue(['rev-parse', '--short', 'HEAD']),
      branch: gitValue(['rev-parse', '--abbrev-ref', 'HEAD']),
    };
    const report = { meta, results: results.map((r) => { stripNoise(r); return { ...r, verdict: classify(r) }; }) };
    fs.mkdirSync(DOCS_DIR, { recursive: true });
    fs.writeFileSync(AUDIT_JSON, JSON.stringify(report, null, 2));
    fs.writeFileSync(AUDIT_MD, buildMarkdown(report));

    const tally = { OK: 0, WARN: 0, FAIL: 0 };
    for (const r of report.results) tally[r.verdict]++;
    const regFails = report.results.filter((r) => r.group === 'registered' && r.verdict === 'FAIL');
    console.log(`[smoke] ${tally.FAIL} FAIL / ${tally.WARN} WARN / ${tally.OK} OK`);
    console.log(`[smoke] Report: ${path.relative(ROOT, AUDIT_MD)} (+ audit.json${flag.noShots ? '' : ', screenshots in docs/tools/smoke/'})`);
    if (regFails.length) console.log(`[smoke] Failing registered tools: ${regFails.map((r) => r.id).join(', ')}`);
    if (flag.ci && regFails.length) exitCode = 1;
  } catch (err) {
    console.error(`[smoke] ${err?.message || err}`);
    exitCode = 2;
  } finally {
    server.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 500));
    if (server.exitCode === null) server.kill('SIGKILL');
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
  process.exit(exitCode);
}

main();
