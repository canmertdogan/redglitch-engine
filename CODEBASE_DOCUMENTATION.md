# RedGlitch Engine v7 — Complete Codebase Documentation

> **Last Updated:** May 2026 | **Engine Version:** 7.0.1 | **~82,000 lines of source code**
>
> This document is a full technical audit: architecture overview, subsystem breakdowns, **honest criticism of every flaw found**, and a recommended improvement roadmap.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Architecture Overview](#3-architecture-overview)
4. [Server Layer](#4-server-layer)
5. [Engine Cores](#5-engine-cores)
6. [Editor Layer (Studio Tools)](#6-editor-layer-studio-tools)
7. [Shared Systems](#7-shared-systems)
8. [AI Subsystem (RedGlitch AI / IRAB)](#8-ai-subsystem-redglitch-ai--irab)
9. [Electron Shell](#9-electron-shell)
10. [Build & Deployment](#10-build--deployment)
11. [Security Audit](#11-security-audit)
12. [Code Quality Critique](#12-code-quality-critique)
13. [Performance Issues](#13-performance-issues)
14. [Architectural Flaws](#14-architectural-flaws)
15. [Improvement Roadmap](#15-improvement-roadmap)

---

## 1. Project Overview

RedGlitch Engine is a **browser-native, multi-engine game development studio** built on Electron + Express. It lets developers create games in six distinct engine types through specialized visual editors, then build and export to desktop (Electron), mobile (Capacitor/iOS/Android), or web.

### Tech Stack

| Layer | Technology |
|---|---|
| Desktop Shell | Electron v40 |
| Backend Server | Express.js v4 (Node.js) |
| Frontend | Vanilla HTML/CSS/JS (no framework) |
| Studio UI (partial) | React 19 + Vite 8 |
| 3D Rendering | Three.js v0.183 |
| Physics | Cannon-ES v0.20 |
| Code Editor | Monaco Editor v0.55 |
| AI Inference | Transformers.js (Xenova + HuggingFace) |
| AI Vector Store | Orama v3 |
| Realtime Comms | WebSocket (ws v8) |
| File Watching | Chokidar v5 |
| Mobile | Capacitor v8 |

---

## 2. Repository Structure

```
redglitch/
├── server.js                  # Express entry point (monolith, 322 lines)
├── electron-main.js           # Electron shell + CortexManager (382 lines)
├── preload.js                 # Electron IPC bridge
├── build-game.js              # Multi-platform build orchestrator
├── build-adapter.js           # Capacitor adapter helper
├── vite.config.ts             # Vite config for studio-ui
├── capacitor.config.ts        # Mobile config
├── package.json               # Dependencies & scripts
│
├── server/                    # Modularized backend
│   ├── config.js              # Centralized config (PORT, paths, flags)
│   ├── middleware/
│   │   └── logging.js         # Security headers + request logger
│   ├── routes/                # 22 route files
│   │   ├── ide.js             # File read/write/delete/tree/search
│   │   ├── projects.js        # Project CRUD, switching, state
│   │   ├── levels.js          # Level save/load/list/delete
│   │   ├── gamedata.js        # NPC/quest/item/skill definitions
│   │   ├── build.js           # Build trigger (SSE stream)
│   │   ├── campaigns.js       # Campaign management
│   │   └── ...18 more
│   ├── services/
│   │   ├── projectService.js  # Active project singleton
│   │   ├── gitService.js      # Git operations
│   │   └── AssetRegistry.js   # Asset metadata registry
│   ├── utils/
│   │   ├── pathGuard.js       # Path traversal prevention
│   │   └── safeFs.js          # Safe filesystem writes
│   └── websocket/
│       └── index.js           # WS server + Chokidar file watcher
│
├── public/                    # All client-side code (106+ files)
│   ├── engines/               # Game engine cores
│   │   ├── rpg-topdown/       # 2D top-down RPG (main.js: 84KB, 1462 lines)
│   │   ├── iso-pixel/         # Isometric 3D engine (main.js: 57KB, 1491 lines)
│   │   ├── platformer-2d/     # 2D platformer
│   │   ├── platformer-3d/     # 3D platformer (Three.js)
│   │   ├── topdown-3d/        # 3D top-down (Three.js)
│   │   └── fps-3d/            # FPS (Three.js)
│   ├── shared/                # 18 shared systems (EventBus, AI, etc.)
│   ├── ai/                    # RedGlitch AI Micro Edition (30+ files)
│   ├── js/                    # Utility scripts
│   ├── lib/                   # Third-party libs (Monaco, etc.)
│   ├── css/                   # Stylesheets
│   ├── fonts/                 # Custom fonts
│   ├── data/                  # Default game data JSON
│   ├── dunyalar/              # Default world/level files
│   ├── sprite-art/            # Sprite assets
│   ├── editor.js              # World Editor (80KB, 2069 lines)
│   ├── iso_editor.js          # IsoPixel Studio (77KB, 2118 lines)
│   ├── algorithm_editor.js    # Visual Script Editor (169KB, biggest file)
│   ├── behavior_editor.js     # Behavior Tree Editor (120KB)
│   ├── campaign_editor.js     # Campaign Editor (94KB)
│   ├── interactive_cutscene_editor.js  # Cutscene Editor (110KB)
│   ├── assistant.js           # Legacy IRAB classic UI (25KB)
│   └── ...80+ more editor files
│
├── projects/                  # User game projects
├── templates/                 # Project templates
├── backend/                   # Python AI Cortex (IRAB Native)
├── builds/                    # Build output
├── scripts/                   # Engine lockstep & dev scripts
├── architecture/              # Architecture docs
├── android/ ios/              # Capacitor native projects
└── website/                   # Marketing site
```

---

## 3. Architecture Overview

### Communication Flow

```
[Electron Shell]
     │
     ├─► [Express Server :3000]
     │        │
     │        ├─► /api/* routes → server/routes/
     │        ├─► Static files → public/
     │        ├─► WebSocket → server/websocket/index.js
     │        └─► IRAB Proxy → localhost:8000 (Python Cortex)
     │
     └─► [Browser Windows]
              │
              ├─► EventBus.js (WebSocket + postMessage bridge)
              ├─► SharedProjectState.js (cross-editor state)
              ├─► AssetManager.js (asset loading & caching)
              └─► RedGlitchAI (Transformers.js + Orama RAG)
```

### Data Flow for Editors

```
User Action → Editor JS → EventBus.emit()
                              │
                    ┌─────────┴──────────┐
                    ▼                    ▼
             Other Editors         API Fetch
             (hot sync)            → Express Route
                                   → safeFs.write()
                                   → Chokidar picks up change
                                   → WebSocket broadcast
                                   → EventBus.emit('file:changed')
                                   → Hot reload
```

---

## 4. Server Layer

### 4.1 `server.js` — Entry Point

**What it does:** Bootstraps Express, mounts 22 route modules, registers a manual IRAB proxy, handles MIME types for WASM/ESM, and sets up WebSocket.

**What's good:**
- Clean modular route imports
- Graceful fallback for missing `monitor-3d` module (try/catch with 503 stub)
- IRAB proxy correctly placed before body parsers to allow piping
- CORS is enabled globally

**What's wrong:**

#### 🔴 `new Function()` used to parse `sprites.js` (server.js line 170)
```js
return new Function(`return ${match[1]}`)();
```
This is effectively `eval()`. If a malicious `sprites.js` is placed in any project directory it will execute arbitrary code in the Node.js server context. This is the most serious server-side vulnerability in the codebase.

**Fix:** Parse sprites using a sandboxed VM (`vm.runInNewContext()`) or require the file to be valid JSON and rewrite `sprites.js` to export JSON instead.

#### 🟠 Wildcard CORS (`cors()` with no options, line 63)
The server uses `app.use(cors())` which allows requests from **any origin**. In an Electron app this is fine, but if the server is ever exposed (local network, remote dev, etc.) any page on the internet can call your API.

**Fix:**
```js
app.use(cors({ origin: ['http://localhost:3000', 'file://'] }));
```

#### 🟠 `50mb` JSON body limit (line 118)
`express.json({ limit: '50mb' })` is extremely permissive. A single malicious POST request can consume ~50MB of RAM per request, making DoS trivial.

**Fix:** Drop to `5mb` for typical API payloads. Large data (levels, sprites) should use streaming or chunked uploads.

#### 🟡 No rate limiting anywhere
There is no rate limiting on any route. The IRAB proxy, IDE write endpoint, and build endpoint (which spawns child processes) are all fully open.

#### 🟡 `HOST: '0.0.0.0'` (config.js line 5)
The server listens on all interfaces by default. In Electron this means the studio is accessible from other machines on the local network with zero authentication. This is fine for an offline tool but needs documentation, and should default to `127.0.0.1`.

#### 🟡 Duplicated path-building logic across all route files
Every route file manually builds `projectDir`, `isRoot`, etc. inline. This pattern appears in `levels.js`, `gamedata.js`, `saves.js`, `assets.js`, `brains.js`, and at least 8 others. There should be a single `getProjectPaths(req)` helper in `services/projectService.js`.

#### 🟡 `ensureDir` function duplicated 6+ times
`async function ensureDir(dir) { ... }` exists separately in `ide.js`, `projects.js`, `levels.js`, `gamedata.js`, `saves.js`, `brains.js`. Move it to `server/utils/fsUtils.js` and import it.

---

### 4.2 `server/routes/ide.js`

**What's good:**
- `resolveUnderRoot` called before all file operations — path traversal is protected
- Dual-prefix stripping (`engine/` vs `projects/NAME/`) is clean
- Tree builder skips `node_modules` and hidden files

**What's wrong:**

#### 🔴 `GET /api/ide/read` route registered as `router.get()` but has dead `POST` check inside (line 35)
```js
router.get('/read', async (req, res) => {
    // ...
    if (req.method === 'POST' && req.path === '/delete') {  // ← NEVER TRUE
        return res.status(403).json({ error: 'Cannot delete engine core files' });
    }
```
This check is copy-pasted into the GET handler for `/read`, the POST handler for `/write`, AND the POST handler for `/delete`. In the `/delete` handler (which is a POST), this condition `req.method === 'POST' && req.path === '/delete'` is always true — but it's also **in the engine guard**, which means **deleting any engine file returns 403 regardless of intent**. The logic is self-contradictory.

**Fix:** Engine-core protection in the `/delete` route should be:
```js
if (filePath.startsWith('engine/')) {
    return res.status(403).json({ error: 'Cannot delete engine core files' });
}
```

#### 🟠 `/api/ide/search` reads ALL files in the project + engine tree synchronously
The search function reads every file's entire content into memory just to do a string match. For large projects this will cause OOM or extreme latency.

**Fix:** Use `ripgrep` via `child_process.spawn` or at minimum stream files line-by-line instead of loading fully.

#### 🟡 `/api/ide/list` error doesn't log anything
```js
} catch (err) {
    res.status(500).json({ error: 'Failed to list directory' }); // err swallowed
}
```
The error is silently dropped.

---

### 4.3 `server/routes/projects.js`

**What's good:**
- `sanitizeProjectName` strips dangerous characters
- `resolveProjectPath` does a `startsWith(root + sep)` check against `PROJECTS_ROOT`
- `buildProjectConfig` validates engine type against a whitelist Set
- Template vs. scaffold creation is separated cleanly

**What's wrong:**

#### 🟠 Duplicate project creation routes (`POST /projects` vs `POST /projects/create`)
Two routes do almost the same thing with slightly different config shapes. `/projects` uses `engineVersion: "0.2.0"` while `/projects/create` uses `engineVersion: "7.0.1"`. The config schema is inconsistent between them.

#### 🟠 `resolveProjectPath` breaks on project names containing spaces
```js
function resolveProjectPath(name) {
    const safeName = sanitizeProjectName(name);
    if (!safeName || safeName !== name) {  // ← Fails if name has spaces
        return null;
    }
```
`sanitizeProjectName` preserves spaces (the regex allows them), but `safeName !== name` will fail if `name` has leading/trailing spaces (because `trim()` is called). More critically, since spaces are allowed in project names (e.g., "Default Project"), a project whose name is exactly the sanitized form will work fine, but this creates subtle bugs when names differ only by whitespace.

#### 🟡 `openInFileManager` promise never rejects cleanly on non-zero exit codes
```js
child.on('close', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`File manager exited with code ${code}`));
```
This is fine, but then the caller catches it and sends a 500 without logging the actual code or path, making debugging difficult.

---

### 4.4 `server/routes/build.js`

**What's good:**
- SSE stream for real-time build logs is well-implemented
- `req.on('close')` kills the child process when client disconnects
- Separate `/clean` endpoint for build artifact cleanup

**What's wrong:**

#### 🔴 No input validation on `target` or `project` query params (line 12-13)
```js
const target = req.query.target || 'electron';
const projectName = req.query.project || 'Default Project';
```
These are passed **directly to `spawn()`** as arguments. A crafted `target` value like `../../etc/passwd; rm -rf /` would be partially dangerous (though Node's `spawn` with array args prevents shell injection, the project name goes into a log string). More importantly, there is no check that `projectName` corresponds to an actual project directory.

**Fix:**
```js
const VALID_TARGETS = new Set(['electron', 'web', 'ios', 'android', 'windows', 'macos']);
if (!VALID_TARGETS.has(target)) return res.status(400).end('Invalid target');
```

#### 🟠 Both `POST /api/build` and `GET /api/build/stream` can spawn concurrent build processes
There is no lock or queue. Two simultaneous build requests will spawn two Node child processes competing for the same `dist/` output directory.

---

### 4.5 `server/utils/safeFs.js`

**What's good:**
- All write functions call `isPathUnderRoot` before writing
- Both sync and async variants provided
- Auto-creates parent directories

**What's wrong:**

#### 🟡 `isPathUnderRoot` edge case with symbolic links
The check uses `path.resolve()` and `path.relative()`, which does **not** resolve symlinks. A symlink inside the project directory pointing outside (e.g., `projects/MyGame/secret -> /etc`) would pass the check.

**Fix:** Add a `fs.realpath()` call to resolve symlinks before the check.

---

### 4.6 `server/websocket/index.js`

**What's good:**
- Clean `connectedClients` Set with proper cleanup on close/error
- File watcher restarts on project switch
- Broadcasts file:changed/added/deleted to all clients

**What's wrong:**

#### 🟠 All incoming WebSocket messages are broadcast to all other clients unconditionally (line 46-50)
```js
ws.on('message', (message) => {
    const data = JSON.parse(message);
    connectedClients.forEach(client => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(message);  // ← No validation, no size limit
        }
    });
```
Any client can send any message to any other client. If one editor window is compromised, it can broadcast arbitrary events to all other editor windows. There is also no message size limit, enabling memory exhaustion.

#### 🟡 `message` variable is a `Buffer` in some ws versions, not a string
`JSON.parse(message)` works because `message.toString()` is called implicitly, but this is fragile. Should be `JSON.parse(message.toString())`.

---

## 5. Engine Cores

### 5.1 RPG Top-Down Engine (`public/engines/rpg-topdown/main.js`)

**Size:** 84KB / 1,462 lines — biggest single engine file.

**What's good:**
- Fixed timestep with accumulator (prevents spiral of death)
- Ring-buffer fireball pool (O(1) allocation, no GC pressure)
- Sliding collision (corner correction) via axis-split movement
- FSM-based enemy AI (IDLE → PATROL → CHASE → ATTACK)
- Hot reloading via EventBus `file:changed` listener
- Profile data loading from localStorage

**What's wrong:**

#### 🔴 Code is a single 1,462-line class with no module boundaries
`window.Core`, `window.MenuSystem`, `window.Enemy`, `window.Fireball` are all defined in one file. There are no imports, no `export`, everything pollutes `window`. This is 2015-style JavaScript in a 2026 codebase.

#### 🔴 `setupHotReloading()` has dangling code outside the constructor (line 561-593)
```js
    // This is INSIDE setupHotReloading's closing brace
    }
    // Phase 27: VFX Bridge registration  ← This is OUTSIDE the method!
    if (window.VFX) window.VFX.setSystem(this.fx, '2d');
```
Lines 561–593 are inside the `Core` constructor but appear to be **accidentally outside** `setupHotReloading()`. The indentation and comment style suggest they were meant to be part of the constructor body but got displaced during a refactor. This means `this.profiler`, `this.audio`, `this.console`, `this.entities`, `this.camera`, etc. are only initialized if `setupHotReloading()` is called (which it is, unconditionally), but visually this looks like dead code after a closing brace.

#### 🔴 `loadProfileData` uses `localStorage.getItem('redglitch_character')` with no sanitization
```js
loadProfileData(data) {
    const p = data || JSON.parse(localStorage.getItem('redglitch_character'));
    if (p) {
        if(p.hp) { this.player.hp = p.hp; this.player.maxHp = p.hp; }
        if(p.speed) this.player.speed = p.speed;
        if(p.jumpForce) this.player.jumpForce = -p.jumpForce;
        if (p.headData) { const img = new Image(); img.src = p.headData; this.playerHead = img; }
```
`p.headData` is directly set as an image `src` without any validation. If this is a data URI with an excessively large payload, it will hang the browser. More critically, `this.player.speed` is set from untrusted localStorage data, so a user can trivially set `speed=99999` by editing localStorage.

#### 🟠 All menu/UI strings use `innerText` and `innerHTML` with user-controlled data
```js
// Line 108
const p = await res.json();
localStorage.setItem('redglitch_character', JSON.stringify(p));
```
Then later `name` from the login input is set directly:
```js
display.innerText = name;  // Safe
```
But many other places use `innerHTML` with dynamic data. This isn't a strict XSS vector in Electron (since it runs locally), but it's bad practice.

#### 🟠 100-line event listener hell in `setupEventListeners()` (lines 87-104)
Lines 87-104 cram 15+ event listener registrations onto single lines like:
```js
add('btn-new-game', () => this.startGame(true)); add('btn-load-game', () => this.startGame(false)); add('btn-engine', () => window.location.href = '/tools.html');
```
This is completely unreadable and impossible to maintain.

#### 🟠 Progress bar animation in `startGame()` is fake (line 143)
```js
for(let i=0; i<=90; i+=2) {
    bar.style.width = `${i}%`;
    await new Promise(r => setTimeout(r, 10));
}
await initPromise;
```
The bar fills to 90% on a fake 450ms timer, then jumps to 100% when the real init finishes. This gives completely misleading feedback about actual load progress.

#### 🟡 `this.campaign = []` (line 576) — type mismatch
`this.campaign` is initialized as `[]` (array) but later used as `this.campaign.data`, `this.campaign._isMultiEngineCampaign()`, etc., treating it as an object/class instance. This is an initialization bug that will throw if `campaignSystem` is not properly set before use.

---

### 5.2 IsoPixel Engine (`public/engines/iso-pixel/main.js`)

**Size:** 57KB / 1,491 lines

**What's good:**
- Fixed timestep with accumulator (same pattern as RPG)
- Dedicated `destroy()` method with proper listener cleanup (rare and good!)
- WebGL shader system with graceful Canvas2D fallback
- Day/night cycle via `IsoFXSystem`
- Snapshot system for AI introspection
- Performance monitor emitting metrics via EventBus

**What's wrong:**

#### 🟠 WebGL canvas appended to DOM without cleanup reference (line 265)
```js
this.canvas.parentElement.appendChild(this.webglCanvas);
```
But `destroy()` does not remove this canvas from the DOM. Every time the engine is re-initialized, a new WebGL canvas is appended, leaking DOM nodes.

**Fix:** Add to `destroy()`:
```js
if (this.webglCanvas && this.webglCanvas.parentElement) {
    this.webglCanvas.parentElement.removeChild(this.webglCanvas);
}
```

#### 🟠 Mouse coordinates tracked but `this.mouse` initialized AFTER event listener (lines 88-99)
```js
this.mousemoveHandler = e => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouse.x = e.clientX - rect.left;  // ← this.mouse doesn't exist yet!
    this.mouse.y = e.clientY - rect.top;
};
this.canvas.addEventListener('mousemove', this.mousemoveHandler);
// ...
this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0 };  // Initialized AFTER
```
If a `mousemove` fires before `this.mouse` is assigned (which can happen during fast initialization), it throws `TypeError: Cannot set properties of undefined`.

**Fix:** Initialize `this.mouse` before registering the handler.

#### 🟡 `_startPerformanceMonitor` uses `setInterval` but `destroy()` only clears `this.perfInterval`
The EventBus listeners created in `_setupEngineListeners` are stored in `this.eventBusIds`, and `destroy()` correctly unregisters them. However, `perfInterval` is the only timer cleaned up — if other timers are added in future they'll leak.

---

### 5.3 3D Engines (Platformer-3D, TopDown-3D, FPS-3D)

**Note:** Full code review was limited by file size, but from directory structure:

- No shared base class — each 3D engine re-implements Three.js scene setup, camera, lighting, and physics (Cannon-ES) independently
- `topdown3d_editor.js` (67KB), `fps_editor.js` (98KB), and `platformer3d_editor.js` (89KB) all have their terrain, object, lighting, and export tools split into separate files — this is good — but the split is inconsistent (some tools are standalone JS, some are embedded in the editor)
- The 3D editors have a separate monitor/debug dashboard (`debug-3d-dashboard.html`) which is a nice architectural choice

---

## 6. Editor Layer (Studio Tools)

### 6.1 World Editor (`public/editor.js`) — 80KB / 2,069 lines

**What's good:**
- Undo/history system via `editorState.history[]`
- Tile collision type system with 8 typed collision values
- Multi-layer tile painting
- Prefab cache
- EventBus integration for cross-editor communication

**What's wrong:**

#### 🔴 All state is module-level `let` variables (lines 3-68)
```js
let map = { ... };
let editorState = { ... };
const canvas = document.getElementById('editorCanvas');
```
Module-level mutable state means only one instance of the editor can exist per page. It also makes testing impossible.

#### 🟠 `ctx` and `canvas` are grabbed at module load time (line 61-62)
If the DOM isn't ready when the script loads, this crashes. Relies entirely on script placement in HTML.

#### 🟡 `PLAYTEST_WINDOW_NAME` constant and `playtestWindowRef` reference a named window, but there is no cleanup if the named window is closed and a new one with the same name fails to open

---

### 6.2 IsoPixel Studio (`public/iso_editor.js`) — 77KB / 2,118 lines

**What's good:**
- EventBus-integrated AI ghost visualization
- Comprehensive tool registration via `StudioBridge`
- Vegetation generation system

**What's wrong:**

#### 🟠 `initializeIsoIntegration()` uses `await new Promise(r => setTimeout(r, 500))` as a timing hack (line 11)
```js
if (!window.RedGlitchEventBus) {
    await new Promise(r => setTimeout(r, 500));
}
```
This blindly waits 500ms hoping the EventBus will be ready. If the system is slow, this races. If fast, 500ms is wasted.

**Fix:** Use a proper `waitForGlobal()` polling helper with exponential backoff and a timeout.

#### 🟡 Cache busting via `?v=cachebust` hardcoded in HTML
Multiple HTML files reference `iso_editor.js?v=cachebust` or `?v=3` / `?v=4`. This is manual and will be forgotten. Use a build-time hash or the server's ETag.

---

### 6.3 Algorithm Editor (`public/algorithm_editor.js`) — 169KB — Largest File

This is by far the biggest file in the codebase (169,000 bytes). It contains:
- Full visual node graph editor (nodes, wires, ports)
- Library browser
- Code view + Monaco integration
- Search system
- Property panel

**What's wrong:**

#### 🔴 169KB single file with no module boundaries
This file alone is 30% the size of an average website's entire JavaScript bundle. It should be split into at minimum: `GraphEditor.js`, `NodeRenderer.js`, `LibraryBrowser.js`, `CodeView.js`, `PropertyPanel.js`.

#### 🟠 Hundreds of `innerHTML` assignments with dynamic node data (lines 1312, 1385, 1596, 1621, etc.)
Node names, labels, and descriptions from the project are interpolated directly into `innerHTML`. While this runs in Electron (which has local file access anyway), it's terrible practice and will cause issues if this code is ever used in a web context.

---

### 6.4 Behavior Editor (`public/behavior_editor.js`) — 120KB

Similar issues to Algorithm Editor: monolithic, no module structure, heavy `innerHTML` usage.

---

## 7. Shared Systems

### 7.1 `EventBus.js` — 348 lines

**What's good:**
- Wildcard event matching (`asset:sprite:*`)
- History buffer (last 100 events)
- WebSocket bridge for cross-window/cross-editor sync
- Source ID prevents echo of own broadcasts
- Blob message handling (the fix for the WebSocket crash mentioned in memory)

**What's wrong:**

#### 🟠 No message size limit on WebSocket receive
Any incoming WebSocket message of any size is parsed without validation. A 100MB JSON blob from the server would be held in memory.

#### 🟡 `reconnectAttempts` reaches `maxReconnectAttempts (5)` and then stops — but there's no notification to the user that connection has been lost
The UI never shows a "disconnected" state, so hot-reload silently stops working.

#### 🟡 `generateSourceId()` uses `Math.random().toString(36).substr(2, 5)` — a 5-character base-36 ID
With 60^5 = ~777M combinations, collision is unlikely but not impossible. Use `crypto.randomUUID()` instead.

---

### 7.2 `SharedProjectState.js` — 582 lines

**What's good:**
- Undo/redo stack (50 steps)
- Auto-save with `beforeunload` listener
- Event-driven updates from EventBus

**What's wrong:**

#### 🟠 `init()` is `async` but the constructor calls it without `await`
```js
constructor(projectName = null) {
    // ...
    this.init();  // ← Not awaited
}

async init() {
    if (this.projectName) {
        await this.loadProject();  // ← This runs in the background
    }
    this.startAutoSave();
}
```
The state is not guaranteed to be loaded when the constructor returns. Any code that uses `SharedProjectState` immediately after creation will see an empty state.

**Fix:** Either make `init()` synchronous and load asynchronously with a `.ready` Promise, or use the factory pattern:
```js
static async create(projectName) {
    const instance = new SharedProjectState(projectName);
    await instance.init();
    return instance;
}
```

#### 🟡 Auto-save calls `saveProject()` in `beforeunload`, but `saveProject()` is async
`beforeunload` does not wait for Promises. The save will be fire-and-forget and may not complete before the page unloads.

**Fix:** Use the synchronous `localStorage` write for critical data, or implement `sendBeacon()`.

---

### 7.3 `AssetManager.js` — 20KB

**What's wrong:**

#### 🟡 Asset paths with hardcoded `/public/` prefix
Some asset paths are built assuming the server serves from `/public/`. This breaks in the Electron `file://` protocol context without the Express server running.

---

## 8. AI Subsystem (RedGlitch AI / IRAB)

### 8.1 Architecture

The AI system has **two separate implementations** that coexist:

1. **IRAB Native (Python):** `backend/main.py` — Full LLM (DeepSeek-Coder-1.3B-GGUF) running as a separate process, proxied through Express at `/api/ai/*`. Managed by `CortexManager` in `electron-main.js`.

2. **RedGlitch AI Micro (Browser):** `public/ai/` — WebGPU/Transformers.js-based browser inference + Orama RAG. Designed as a fallback when Native is unavailable.

### 8.2 `public/ai/redglitch-ai.js` — Orchestrator

**What's good:**
- Graceful provider switching (native vs WebGPU vs fallback)
- RAG engine with lazy initialization
- Settings loaded from localStorage with safe JSON parsing

**What's wrong:**

#### 🟠 Version query strings hardcoded on every import (line 6-15)
```js
import { AI_CONFIG } from './config.js?v=8';
import { ModelManager } from './model-manager.js?v=8';
```
Cache busting via query string on ES module imports is not standard and behaves inconsistently across browsers. The `?v=8` means every import is treated as a different URL — breaking module deduplication. Use a build step (Vite/esbuild) that handles cache busting properly.

#### 🟠 `EventBus.instance` check pattern is fragile (line 81)
```js
if (EventBus.instance) EventBus.emit('ai:status', this.getStatus());
```
`EventBus` from `shim.js` is a plain object with getters. `EventBus.instance` returns `window.RedGlitchEventBus`, but `EventBus.emit` calls `window.RedGlitchEventBus?.emit()`. These are two separate property accesses, creating a TOCTOU race if `window.RedGlitchEventBus` is assigned between the check and the call.

---

### 8.3 `public/ai/tool-registry.js` — 1,102 lines / 47KB

**What's good:**
- Namespace alias system for tool routing
- Permission gate integration
- Pending action recovery queue
- Backend sync via EventBus

**What's wrong:**

#### 🔴 1,102-line single file with tool definitions, registry, namespace routing, backend sync, and debugging all mixed
This should be split into: `ToolRegistry.js`, `ToolDefinitions.js`, `NamespaceRouter.js`, `BackendSync.js`.

#### 🟡 `_debug()` emits to EventBus on every log, even internal traces
Every debug log produces an EventBus event. In verbose mode this floods the event history buffer and degrades performance.

---

### 8.4 `public/ai/permission-gate.js` — 370 lines

**What's good:**
- Session-level "always allow" list persisted in sessionStorage
- HTML escaping in modal rendering
- Audit log with max 1000 entries
- Static `PROTECTED_PATTERNS` list prevents AI from touching engine core

**What's wrong:**

#### 🟠 Permission modal uses `modal.innerHTML = \`...\`` with user-controlled content (line 229)
Even though `_escapeHtml()` exists, it is not consistently applied to all values interpolated into the modal HTML. Tool names and parameter values from AI responses could contain HTML.

#### 🟡 `PROTECTED_PATTERNS` misses some critical files
`server/routes/*.js`, `server/middleware/*.js`, and `server/utils/*.js` are not in the protected list, meaning the AI can modify route handlers and utility functions.

---

### 8.5 `public/assistant.js` — Legacy IRAB Classic UI

**What's wrong:**

#### 🟠 Polling interval (`setInterval`) never cleared if the page navigates away
```js
this._flushInterval = setInterval(() => { ... }, 500);
```
There is no cleanup on page unload. This leaks timers in single-page navigation scenarios.

#### 🟡 5-second fallback timeout uses `this._commandQueue.includes(cmdData)` reference check
Array `.includes()` uses reference equality. Since `cmdData` is the original object, this works. But if the queue is somehow serialized/deserialized, the reference breaks.

---

## 9. Electron Shell (`electron-main.js`)

### 9.1 `CortexManager`

**What's good:**
- Heartbeat monitor to detect hung Python process
- Auto-restart on unexpected exit (code !== 0 && code !== null)
- Clean `stop()` method

**What's wrong:**

#### 🔴 No restart limit — infinite restart loop possible
```js
this.process.on('close', (code) => {
    if (code !== 0 && code !== null) {
        setTimeout(() => this.start(), 3000);
    }
});
```
If the Python backend has a configuration error, it will crash immediately and restart every 3 seconds forever, consuming CPU and generating log spam.

**Fix:** Add a `restartCount` and a maximum (e.g., 5 restarts in 60s), then stop and show a user-facing error.

#### 🔴 `restart()` calls `stop()` then `start()` after 1000ms — but `stop()` calls `process.kill()` which may not complete by then
```js
restart() {
    this.stop();
    setTimeout(() => this.start(), 1000);
}
```
`process.kill()` sends a signal but doesn't wait for the process to actually die. On macOS/Linux the 1000ms is usually enough, but it's not guaranteed.

**Fix:** Use `process.once('close', () => setTimeout(start, 100))`.

---

### 9.2 Single-Instance Lock

**What's good:**
- `app.requestSingleInstanceLock()` properly implemented
- Second-instance brings existing window to front

**What's wrong:**

#### 🟡 `dialog.showMessageBoxSync` called in `app.whenReady()` when lock is not obtained (line 111)
`app.whenReady()` only resolves once `app` is ready, but if we don't have the lock we call `app.quit()` before ready fires in some versions of Electron. The `dialog` call should be synchronous at the module level or handled differently.

---

### 9.3 Window Creation

**What's wrong:**

#### 🟠 `show-item-in-folder` IPC handler has weak path validation (line 310)
```js
if (normalized.includes(__dirname) || normalized.includes('projects')) {
    shell.showItemInFolder(normalized);
}
```
`normalized.includes('projects')` will match any path containing the string "projects" (e.g., `/Users/evil/myprojects/../etc/passwd`). This should use `path.resolve` and `startsWith`.

#### 🟡 `webContents.setWindowOpenHandler` allows all `localhost` URLs unconditionally (line 322)
Any page on the server can open any other localhost URL as a new window. This is probably fine for the studio, but it means any XSS in a level preview could open arbitrary studio windows.

#### 🟡 `mainWindow` is `null` before creation but referenced in `second-instance` handler
```js
app.on('second-instance', () => {
    if (mainWindow) {  // Safe null check here, but...
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});
```
This is actually fine (null check exists), but the variable is declared `let mainWindow` at module scope and assigned in `createWindow()` — making the lifecycle implicit.

---

## 10. Build & Deployment

### 10.1 `package.json` Issues

#### 🟠 Both `@huggingface/transformers` (v3 alpha) AND `@xenova/transformers` (v2.17) are listed as dependencies
These are the same library at different major versions. Having both installed doubles the bundle size (hundreds of MB) and can cause import conflicts.

**Fix:** Pick one. The HuggingFace v3 (`@huggingface/transformers`) is the successor. Remove `@xenova/transformers`.

#### 🟠 `electron` (v40) is in `devDependencies` but `electron-packager` AND `electron-builder` are both present
Two competing Electron packaging tools. Pick one (`electron-builder` is more feature-complete).

#### 🟡 `version: "1.0.0"` in `package.json` while engine internally reports `7.0.1`
The package version and engine version are out of sync.

#### 🟡 `"files": ["**/*", "!dist/*", "!builds/*"]` in the `build` section will include `node_modules/`
This means the distributed Electron app ships the entire `node_modules` directory. Use `electron-builder`'s `extraResources` and ASAR packaging instead.

---

### 10.2 `build-game.js`

Not fully audited, but the pattern of spawning child processes for platform builds without capping concurrent builds is consistent with the issues in `routes/build.js`.

---

## 11. Security Audit

| Severity | Issue | Location |
|---|---|---|
| 🔴 CRITICAL | `new Function()` to parse project sprites.js | `server.js:170` |
| 🔴 CRITICAL | No restart limit for Python Cortex | `electron-main.js:58-62` |
| 🔴 HIGH | No input validation on build target/project params | `routes/build.js:12-13` |
| 🔴 HIGH | Weak `show-item-in-folder` path check | `electron-main.js:310` |
| 🟠 MED | Wildcard CORS with no origin restriction | `server.js:63` |
| 🟠 MED | 50MB body limit enables trivial memory DoS | `server.js:118` |
| 🟠 MED | WebSocket messages broadcast with no size limit | `websocket/index.js:46-50` |
| 🟠 MED | Permission Gate doesn't protect server route files | `ai/permission-gate.js` |
| 🟠 MED | Concurrent builds can corrupt dist output | `routes/build.js` |
| 🟡 LOW | HOST 0.0.0.0 exposes server on LAN | `server/config.js:5` |
| 🟡 LOW | symlink bypass in safeFs path check | `server/utils/safeFs.js:5-11` |
| 🟡 LOW | localStorage player stats unsanitized | `rpg-topdown/main.js:624` |

---

## 12. Code Quality Critique

### 12.1 Catastrophic Line Density

The `MenuSystem.setupEventListeners()` method in `rpg-topdown/main.js` (line 90) packs multiple statements on a single line consistently:

```js
add('btn-new-game', () => this.startGame(true)); add('btn-load-game', () => this.startGame(false)); add('btn-engine', () => window.location.href = '/tools.html');
```

Lines 438-440, 512, 621-624 in `rpg-topdown/main.js` are all single lines that do 5-10 operations. This makes debugging, diffing, and code review nearly impossible.

### 12.2 Turkish Directory and Variable Names Mixed with English

- Directory: `dunyalar/` (Turkish: "worlds")  
- Directory: `muzikler/` (Turkish: "music")  
- Variable: `dunyalarDir` in route files  

This is not wrong per se, but the inconsistency (some things are Turkish, most are English) creates onboarding friction. Pick one language for identifiers.

### 12.3 `window.X = class X {}` Pattern Throughout

Every engine class is registered as a global:
```js
window.Core = class Core { ... }
window.Enemy = class Enemy { ... }
window.Fireball = class Fireball { ... }
```

This is the JavaScript equivalent of polluting the global namespace. It prevents tree-shaking, makes dependency tracking impossible, and will cause class name collisions if two engine scripts are loaded simultaneously.

### 12.4 Inconsistent Error Handling Patterns

Three different patterns exist for the same situation (directory read failure):
```js
// Pattern A: Silent swallow
} catch (e) {}

// Pattern B: Warn only  
} catch (e) { console.warn(...); }

// Pattern C: Full error with res.status(500)
} catch (err) { res.status(500).json({ error: err.message }); }
```

All three exist in `levels.js` alone. This makes the API surface unpredictable.

### 12.5 `docs.html` is 148KB

A single HTML file that is 148KB. This is a documentation page. It should be generated from Markdown files, not maintained as a hand-written HTML monolith.

### 12.6 Leftover Debug/Temp Files in Repo

- `temp_script.js` (50KB) — in root directory
- `test.png`, `a.png`, `b.png` — loose image files in root (total: 4MB)
- `docs.html.bak` — a backup file committed to the repo
- `Ekran Resmi 2026-05-03 11.01.24.png` — screenshot file in repo root
- `Ekran Görüntüsü (99).png` — screenshot inside `engines/iso-pixel/`
- `test-kai.html`, `test-3d-runner.html` — test files in public/ root
- `val-suite.html` — AI validation suite in `public/ai/`
- `design_comparison.html` — in public root

None of these should be in version control.

### 12.7 `.gitignore` Doesn't Cover Enough

Large image files (`*.png` in root), backup files (`*.bak`), and test HTML files are all committed. The `.gitignore` should cover:
```
*.bak
/temp_*.js
/test*.html (in public root)
/a.png /b.png /test.png
"Ekran*"
```

---

## 13. Performance Issues

### 13.1 IsoPixel Canvas 2D Renderer — No Chunk Caching

The Canvas 2D isometric renderer redraws the entire map every frame. For large maps this means:
- Every tile is re-projected from 3D → 2D every frame
- No dirty rectangle tracking
- No chunk-based caching
- Every `drawImage` call is independent

**Impact:** Large maps (>50×50) will drop below 60 FPS even on fast hardware.

**Fix:** Implement chunk-based caching with dirty-chunk tracking. Pre-render static tiles to offscreen canvases, only update dirty chunks.

### 13.2 `/api/ide/search` — Full In-Memory File Scan

The search endpoint reads every file in the project completely into memory, splits it into lines, and does a `toLowerCase().includes()` check. For a project with 500+ files this could use 500MB+ of RAM.

### 13.3 WebSocket Broadcasts `fullPath` (Absolute System Path)

```js
broadcastToClients({
    type: 'file:changed',
    data: {
        path: relativePath,
        fullPath: filePath,  // ← Sends absolute path to all clients
    }
});
```

Sending the server's absolute filesystem path to browser clients is an information leak and isn't needed.

### 13.4 `algorithm_editor.js` — 169KB Loaded Synchronously

This file is loaded as a `<script>` tag (not a module), blocking page render for the duration of parse + compile. On slower machines this adds 200-500ms to editor load time.

### 13.5 `SoundManager.js` + `audioSystem.js` Duplicate Functionality

There are two audio systems in the shared directory. `SoundManager.js` (16KB) and `audioSystem.js` in the RPG engine. They appear to serve the same purpose with slightly different APIs.

---

## 14. Architectural Flaws

### 14.1 Module System Chaos — Four Different Import Styles in One Codebase

1. **Classic `<script>` tags** — most engine files, editors
2. **`window.X = class X`** — all engine classes
3. **ES Modules with `import/export`** — `public/ai/*.js`
4. **CommonJS `require()`** — all server files

This makes cross-system dependencies implicit (you have to know that "the `EventBus` class is available as `window.RedGlitchEventBus` because some `<script>` tag loaded `shared/EventBus.js` before this script ran").

### 14.2 Projects Duplicate Engine Files

When a project is created, `copyGameFromPublic()` copies `engines/`, `base_game/`, `fonts/`, `js/`, and `lib/` into the project directory. This means:
- Every project contains a full copy of the Monaco editor library (~15MB)
- Bug fixes to the engine don't propagate to existing projects
- Storage usage scales linearly with project count

**Fix:** Reference engine files from a shared location. Only store project-specific assets and data in the project directory.

### 14.3 `projectService` is a Global Singleton Shared Across All Routes

`server/services/projectService.js` exports a module-level singleton. All 22 route files share the same active project state. This means:
- No multi-user support is possible
- Race conditions if two requests try to switch projects simultaneously
- Cannot be unit tested without mocking the module

### 14.4 `assistant.js` vs `ai/msn-bridge.js` — Two IRAB UIs

The codebase has two separate IRAB chat UIs:
- `public/assistant.js` — the "classic" IRAB MSN-style UI
- `public/ai/msn-bridge.js` — the newer rebuilt version

Both are loaded in some pages. They conflict (as noted in the memory notes: "Resolved UI conflicts by disabling legacy 'assistant.js' UI components"). This dead code weight should be resolved by fully committing to one implementation and deleting the other.

### 14.5 `README-OLD.md` in `public/ai/` — Acknowledged Dead Documentation

A file named `README-OLD.md` being committed suggests documentation drift. The "old" README may contain incorrect information that could mislead contributors.

---

## 15. Improvement Roadmap

### Priority 1 — Security (Do Immediately)

- [ ] Replace `new Function()` sprite parsing with `vm.runInNewContext()` or JSON-based sprites
- [ ] Add restart limit (max 5 in 60s) to `CortexManager`
- [ ] Validate `target` and `project` params in `/api/build/stream`
- [ ] Fix `show-item-in-folder` path check to use `path.resolve + startsWith`
- [ ] Add CORS origin restriction
- [ ] Reduce JSON body limit to 5MB
- [ ] Add WebSocket message size limit (e.g., 1MB)

### Priority 2 — Code Quality (This Sprint)

- [ ] Delete `temp_script.js`, `a.png`, `b.png`, `test.png`, `*.bak` from repo
- [ ] Move shared `ensureDir` to `server/utils/fsUtils.js`
- [ ] Fix `setupHotReloading` constructor displacement bug in `rpg-topdown/main.js`
- [ ] Fix `this.mouse` initialization order in `iso-pixel/main.js`
- [ ] Add `async init()` factory pattern to `SharedProjectState`
- [ ] Add WebGL canvas cleanup to `IsoGame.destroy()`
- [ ] Unify error handling patterns in route files

### Priority 3 — Architecture (Next Quarter)

- [ ] Migrate all engine files to ES Modules (`export class Core`)
- [ ] Implement chunk-based caching in IsoPixel Canvas 2D renderer
- [ ] Split `algorithm_editor.js` (169KB) into 5+ focused modules
- [ ] Remove one of the two audio systems (`SoundManager` vs `audioSystem`)
- [ ] Remove one of the two IRAB UIs (`assistant.js` vs `msn-bridge.js`)
- [ ] Stop copying engine files into projects; use shared engine references
- [ ] Remove `@xenova/transformers` (keep `@huggingface/transformers` only)
- [ ] Replace `?v=8` query-string cache-busting on AI imports with Vite build

### Priority 4 — Performance (Ongoing)

- [ ] Replace `/api/ide/search` with ripgrep subprocess
- [ ] Implement dirty-chunk caching in IsoPixel renderer
- [ ] Add lazy-loading for `algorithm_editor.js` (use dynamic `import()`)
- [ ] Remove `fullPath` from WebSocket file-change broadcasts
- [ ] Add build queue to prevent concurrent build spawns

---

## Appendix: File Size Reference

| File | Size | Lines | Notes |
|---|---|---|---|
| `public/algorithm_editor.js` | 169KB | ~4,100 | Largest file — needs splitting |
| `public/behavior_editor.js` | 120KB | ~3,000 | Second largest |
| `public/campaign_editor.js` | 94KB | ~2,300 | |
| `public/fps_editor.js` | 98KB | ~2,400 | |
| `public/engines/rpg-topdown/main.js` | 84KB | 1,462 | Core engine |
| `public/editor.js` | 80KB | 2,069 | World editor |
| `public/iso_editor.js` | 77KB | 2,118 | IsoPixel studio |
| `public/ai/tool-registry.js` | 47KB | 1,102 | AI tools |
| `public/engines/iso-pixel/main.js` | 57KB | 1,491 | Iso engine |
| `public/docs.html` | 148KB | ~3,000 | Should be generated |
| `server/routes/projects.js` | 22KB | 581 | |
| `server/routes/ide.js` | 13KB | 357 | |
| `temp_script.js` | 51KB | — | **Should not be in repo** |

---

*Documentation generated by Antigravity via full codebase static analysis — May 2026*
