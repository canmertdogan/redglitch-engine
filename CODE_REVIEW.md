# Code Review: Ketebe Engine (Ongonluk Engine)

**Review Date:** February 12, 2026  
**Scope:** Server layer, project structure, architecture

---

## Executive Summary

Ketebe Engine is a hybrid web-desktop game development environment combining a Node.js Express server, Electron desktop app, and a Python AI backend. The architecture is well-documented and follows a clear "shadow filesystem" pattern for project-based asset resolution. The codebase is modular with sensible separation of routes, services, and middleware.

---

## Project Overview

| Aspect | Details |
|--------|---------|
| **Type** | Game engine / development studio |
| **Stack** | Node.js, Express, Electron, Capacitor, Python (backend) |
| **Engines** | IsoPixel (isometric), RPG Top-Down, Platformer 2D |
| **Entry Points** | `server.js` (HTTP server), `electron-main.js` (desktop app) |

---

## Strengths

### 1. Clear Architecture
- **Shadow filesystem**: Projects override core engine files without modifying the core. Lightweight, upgradeable projects.
- **Documentation**: `architecture/OVERVIEW.md` and `SERVER.md` accurately describe the design.
- **Modular routes**: API split into focused routers (projects, saves, levels, gamedata, logic, abilities, brains, slots, cutscenes, campaigns, assets, system).

### 2. Security Practices
- **COEP/COOP headers**: `Cross-Origin-Embedder-Policy` and `Cross-Origin-Opener-Policy` for SharedArrayBuffer/WebGPU.
- **Path validation**: Project routes validate `projectPath.startsWith(PROJECTS_ROOT)` to prevent directory traversal.
- **Name sanitization**: Project names sanitized (`replace(/[^a-zA-Z0-9 \-_]/g, '')`) to avoid path injection.
- **Context isolation**: Electron uses `contextIsolation: true`, `nodeIntegration: false`.

### 3. Project Management
- **ProjectService**: Singleton with `setActiveProject`, `getActiveProject`, `isRootProject`, `getProjectPath`, `getDunyalarPath`.
- **Project switching**: REST API for switching active project; middleware injects `projectService` into requests.
- **Template support**: Base templates (base-rpg, empty) with metadata in `ketebe.json`.

### 4. Build Pipeline
- **build-game.js**: Whitelist-based copy, platform targets (web, electron, windows, macos, android, ios).
- **Capacitor integration**: Config swap for mobile sync.
- **Standalone server generation**: Builds a minimal Express server for game runtime.

### 5. Kai/AI Integration
- **Proxy**: `/api/history` and `/api/ai` proxy to `localhost:8000` (Kai backend).
- **Cortex manager**: Electron spawns Python backend (`backend/main.py`) with venv support.
- **502 handling**: Graceful error when Kai backend is offline.

---

## Issues & Recommendations

### 1. WebSocket: Options Not Passed
**File:** `server.js`, `server/websocket/index.js`

`setupWebSocket(server)` is called without options. The WebSocket module defaults `rootDir` to `__dirname` (server/websocket), and `getActiveProject` to `() => rootDir`, so it never uses the real active project.

**Recommendation:**
```javascript
setupWebSocket(server, {
    rootDir: config.ROOT_DIR,
    getActiveProject: () => projectService.getActiveProject(),
    projectsRoot: config.PROJECTS_ROOT
});
```

---

### 2. File Watcher Never Started
**File:** `server/websocket/index.js`

`startFileWatcher()` is returned but never called, so hot-reload via WebSocket is inactive.

**Recommendation:** Either:
- Call `startFileWatcher()` from `server.js` after `setupWebSocket`, or
- Start it inside `setupWebSocket` when the server is ready.

---

### 3. Inconsistent Naming
- **package.json**: `"ongonluk-engine"`, `"Ongonluk Engine Alpha"`
- **ketebe.json / UI**: `"Ketebe Game Studio"`, `"Revenge of the Ketebe Canavarı"`

**Recommendation:** Standardize on a single product name (Ketebe vs Ongonluk) across configs, docs, and UI.

---

### 4. Duplicate Route Logic
**File:** `server/routes/projects.js`

`POST /api/projects` and `POST /api/projects/create` share most logic. The create route uses `oyuncu_profilleri` vs `profiles` in some places; `allowedDirs` differs slightly (`oyuncu_profilleri` vs `oyuncu_profilleri`).

**Recommendation:** Extract shared logic into a helper (e.g. `createProjectFromTemplate`) and have both routes call it.

---

### 5. Error Handling
- Several catch blocks only log and return 500 without details: `res.status(500).json({ error: 'Failed to create project' })`.
- `req.pipe(connector)` in Kai proxy: if `connector` errors before piping, the request may hang.

**Recommendation:**
- In development, include `err.message` (or stack) in error responses.
- Ensure connector error handler covers all failure paths and closes the response.

---

### 6. Typo / Copy-Paste in Server Comments
**File:** `server.js`

- Line 37: Comment says "KAI NATIVE PROXY" but earlier review mentioned "Kai".
- Line 79: Comment says "Legacy Alias: Redirect /base_game to /engines/rpg-topdown" but the route serves static files, not redirects.

**Recommendation:** Align comments with actual behavior.

---

### 7. `oyuncu_profilleri` vs `profiles`
**Files:** `server/routes/projects.js`, `build-game.js`

Project creation uses `oyuncu_profilleri` in `allowedDirs`, while some templates use `profiles`. This may cause missing directories depending on template.

**Recommendation:** Confirm which name is canonical and use it consistently.

---

### 8. Sprites.js Error Handling
**File:** `server.js`

```javascript
res.sendFile(projectSprites, err => {
    if (err) next();
});
```

If `sendFile` fails, `next()` is called but the response might already be partially sent. Also, a 404 case is not clearly distinguished.

**Recommendation:** Use `sendFile` with an explicit error callback that checks `res.headersSent` before calling `next()`.

---

### 9. Unused Import
**File:** `server.js` line 3

`const fs = require('fs').promises` is imported but not used in `server.js`.

**Recommendation:** Remove the unused import.

---

### 10. Port Duplication
**File:** `electron-main.js`

`const PORT = 3000` is hardcoded; `server/config.js` uses `config.PORT`. If `process.env.PORT` is set, Electron might use a different port than the server.

**Recommendation:** Use `require('./server/config').PORT` (or the same config module) in Electron.

---

## File Structure Summary

```
server.js              # Entry point, routes, IRAB proxy
server/
  config.js            # PORT, dirs, limits
  middleware/logging.js # COEP/COOP, request logger
  services/projectService.js
  routes/              # 12 route modules
  websocket/index.js   # WS + chokidar (file watcher unused)
electron-main.js       # Cortex manager, splash, window
build-game.js          # Build pipeline
```

---

## Dependencies

- **Runtime:** express, ws, chokidar
- **Desktop:** electron, @capacitor/*
- **AI:** @huggingface/transformers, onnxruntime-web, @orama/orama

---

## Conclusion

The project has a solid architecture and good security practices. The most impactful fixes are:

1. Passing correct options to WebSocket and starting the file watcher.
2. Unifying project creation logic and directory naming.
3. Aligning naming (Ketebe vs Ongonluk) and configuration (port, product name).

After these changes, the server and tooling would be more reliable and consistent.
