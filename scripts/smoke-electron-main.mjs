/**
 * Redglitch Tool Rescue — Electron smoke runner (child process).
 *
 * Launched by scripts/smoke-tools.mjs via the `electron` binary.
 * Loads every tool page in a hidden BrowserWindow, collects console errors,
 * failed network requests, document stats and a screenshot, then writes a
 * JSON report to SMOKE_OUT and quits.
 *
 * Env:
 *   SMOKE_BASE   e.g. http://127.0.0.1:3199
 *   SMOKE_TOOLS  path to JSON array of { id, src, group }
 *   SMOKE_OUT    path to write the JSON report
 *   SMOKE_SHOTS  directory for screenshots (created if missing)
 */
import { app, BrowserWindow, session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

// NOTE: do NOT pass --disable-gpu here. With GPU disabled, Chromium's
// software GL path hangs this page (shader_lab.html / WebGL editors) before
// did-finish-load fires. If your CI machine has no GPU, install a headless
// X server (xvfb) or set ELECTRON_ENABLE_LOGGING=1 and accept WebGL pages
// may report FAIL.

const BASE = process.env.SMOKE_BASE;
const TOOLS_PATH = process.env.SMOKE_TOOLS;
const OUT_PATH = process.env.SMOKE_OUT;
const SHOTS_DIR = process.env.SMOKE_SHOTS;

if (!BASE || !TOOLS_PATH || !OUT_PATH) {
  console.error('[smoke] Missing required env: SMOKE_BASE / SMOKE_TOOLS / SMOKE_OUT');
  app.exit(2);
}

const tools = JSON.parse(fs.readFileSync(TOOLS_PATH, 'utf8'));
if (SHOTS_DIR) fs.mkdirSync(SHOTS_DIR, { recursive: true });

const PER_TOOL_TIMEOUT_MS = Number(process.env.SMOKE_PAGE_TIMEOUT_MS) || 20000;
const AFTER_LOAD_SETTLE_MS = 1500;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeUrl(u) {
  try {
    const url = new URL(u);
    return url.pathname + url.search;
  } catch {
    return String(u);
  }
}

async function auditTool(tool, index, total) {
  console.log(`[smoke] [${index + 1}/${total}] auditing ${tool.id} (${tool.src})`);
  const result = {
    id: tool.id,
    src: tool.src,
    group: tool.group || 'registered',
    url: `${BASE}/${tool.src}`,
    loadOk: false,
    timedOut: false,
    crashed: false,
    redirected: false,
    mainFrameStatus: null,
    consoleErrors: [],
    consoleWarnings: [],
    failedRequests: [],
    httpErrors: [],
    bodyTextLen: 0,
    bodyChildren: 0,
    hasRoot: false,
    title: '',
    loadMs: 0,
    screenshot: null,
  };

  const consoleErrors = [];
  const consoleWarnings = [];
  const reqFailures = [];
  const httpFails = [];

  const sessionPartition = `smoke-${tool.id}`;
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      partition: sessionPartition, // per-window session: no listener clashes across tools
    },
  });

  const wc = win.webContents;

  wc.on('console-message', (details) => {
    const entry = {
      level: details.level,
      message: String(details.message || '').slice(0, 500),
      sourceId: normalizeUrl(details.sourceId || ''),
      lineNumber: details.lineNumber ?? null,
    };
    if (details.level === 'error') consoleErrors.push(entry);
    else if (details.level === 'warning') consoleWarnings.push(entry);
  });

  wc.on('render-process-gone', (_e, details) => {
    result.crashed = true;
    consoleErrors.push({ level: 'error', message: `render-process-gone: ${details.reason}`, sourceId: 'electron', lineNumber: null });
  });

  wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (isMainFrame) {
      consoleErrors.push({
        level: 'error',
        message: `did-fail-load ${errorCode}: ${errorDescription} (${normalizeUrl(validatedURL)})`,
        sourceId: 'electron',
        lineNumber: null,
      });
    } else {
      reqFailures.push({ url: normalizeUrl(validatedURL), error: `did-fail-load ${errorCode}: ${errorDescription}` });
    }
  });

  // Per-window partition session: attribute all network activity to this tool.
  const toolSession = session.fromPartition(sessionPartition);
  toolSession.webRequest.onErrorOccurred((details) => {
    const entry = { tool: tool.id, url: normalizeUrl(details.url), error: details.error };
    reqFailures.push(entry);
  });
  toolSession.webRequest.onCompleted((details) => {
    if (details.statusCode >= 400) {
      const entry = { tool: tool.id, url: normalizeUrl(details.url), status: details.statusCode, resourceType: details.resourceType };
      httpFails.push(entry);
      if (details.resourceType === 'mainFrame') result.mainFrameStatus = details.statusCode;
    } else if (details.resourceType === 'mainFrame') {
      result.mainFrameStatus = details.statusCode;
    }
  });

  const started = Date.now();

  const probeDom = async () => {
    await sleep(AFTER_LOAD_SETTLE_MS);
    const probe = `(() => {
      const b = document.body;
      const root = document.querySelector('#root, #app, .app-shell, main');
      return {
        textLen: b ? (b.innerText || '').trim().length : 0,
        children: b ? b.children.length : 0,
        rootChildren: root ? root.children.length : 0,
        hasRoot: !!root,
        title: document.title || ''
      };
    })()`;
    try {
      const stats = await wc.executeJavaScript(probe, true);
      result.bodyTextLen = stats?.textLen ?? 0;
      result.bodyChildren = stats?.children ?? 0;
      result.hasRoot = !!stats?.hasRoot;
      result.title = stats?.title ?? '';
      result.rootChildren = stats?.rootChildren ?? 0;
    } catch (err) {
      consoleErrors.push({ level: 'error', message: `probe failed: ${err?.message || err}`, sourceId: 'electron', lineNumber: null });
    }

    if (SHOTS_DIR) {
      try {
        const image = await wc.capturePage();
        const file = path.join(SHOTS_DIR, `${tool.id}.png`);
        fs.writeFileSync(file, image.toPNG());
        result.screenshot = path.relative(process.cwd(), file);
      } catch {
        // Screenshot failure is not fatal.
      }
    }
  };

  const waitForRedirect = () => new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 8000);
    wc.once('did-finish-load', () => { clearTimeout(t); resolve(true); });
    wc.once('did-fail-load', () => { clearTimeout(t); resolve(true); });
  });

  // Register load listeners BEFORE starting navigation — did-finish-load can
  // fire before the loadURL promise settles, and a late listener misses it.
  let loadTimer = null;
  const loadDone = new Promise((resolve) => {
    wc.once('did-finish-load', () => resolve(true));
    wc.on('did-fail-load', (_e, _code, _desc, _url, isMainFrame) => {
      if (isMainFrame) resolve(true);
    });
    loadTimer = setTimeout(() => resolve(false), PER_TOOL_TIMEOUT_MS);
  });

  try {
    let finished;
    try {
      await wc.loadURL(result.url);
      finished = await loadDone;
    } catch (err) {
      // ERR_ABORTED on the main frame means the page redirected itself
      // (meta refresh / location.replace) — follow it instead of failing.
      if (String(err?.message || err).includes('ERR_ABORTED')) {
        result.redirected = true;
        finished = await waitForRedirect();
      } else {
        throw err;
      }
    }
    result.loadOk = !!finished;
    result.timedOut = !finished;
    result.loadMs = Date.now() - started;

    if (finished) {
      await probeDom();
    }
  } catch (err) {
    result.crashed = true;
    consoleErrors.push({ level: 'error', message: `loadURL error: ${err?.message || err}`, sourceId: 'electron', lineNumber: null });
  } finally {
    if (loadTimer) clearTimeout(loadTimer);
    try { await toolSession.clearCache(); } catch { /* best effort */ }
    result.consoleErrors = consoleErrors;
    result.consoleWarnings = consoleWarnings;
    result.failedRequests = reqFailures;
    result.httpErrors = httpFails;
    try { win.destroy(); } catch { /* already gone */ }
  }

  return result;
}

app.whenReady().then(async () => {
  const results = [];
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    try {
      results.push(await auditTool(tool, i, tools.length));
      console.log(`[smoke] [${i + 1}/${tools.length}] done ${tool.id}`);
    } catch (err) {
      results.push({
        id: tool.id, src: tool.src, group: tool.group || 'registered',
        url: `${BASE}/${tool.src}`, loadOk: false, timedOut: false, crashed: true,
        mainFrameStatus: null, consoleErrors: [{ level: 'error', message: String(err?.message || err), sourceId: 'electron', lineNumber: null }],
        consoleWarnings: [], failedRequests: [], httpErrors: [],
        bodyTextLen: 0, bodyChildren: 0, hasRoot: false, rootChildren: 0, title: '', loadMs: 0, screenshot: null,
      });
    }
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify({ base: BASE, ranAt: new Date().toISOString(), results }, null, 2));
  app.exit(0);
});
