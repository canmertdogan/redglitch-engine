# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Redglitch Game Studio — a local-first Electron desktop app that bundles six game engines (2D top-down RPG, 2.5D isometric, 2D platformer, 3D FPS, 3D platformer, 3D top-down RPG) plus 50+ editors, an audio DAW, and an optional on-device AI copilot. The README frames it as "public beta," but treat that as aspirational: the Node-side test suite (AI, server routes, engine logic — ~450+ tests) is genuinely green, but GUI/editor end-to-end flows, the Electron runtime itself, the Python AI backend, and mobile/desktop packaging are not covered by any automated check in this repo. Don't assume a passing `npm test` means the product works end-to-end — it verifies contracts and data/runtime logic, not the full user-facing experience.

## What's actually verified vs. not

- **Verified by automated tests**: AI agent-loop/parser/mode/automation-contract logic, server REST routes (projects, levels, levels3d, campaigns), path guard / automation policy, and per-engine runtime logic (inventory, abilities, items, campaign validation, platformer physics/combat/generators, RPG top-down state/save/logic, unified-3D terrain/mode contracts).
- **Not covered by any test in this repo**: browser/editor end-to-end workflows (no Playwright or similar), `npm start` / Electron shell behavior (window lifecycle, preload bridge, Cortex process management), the Python AI backend (`backend/tests` requires `pytest`, which is not installed in `backend/venv` by default — treat backend test claims as unverified until you confirm `pytest` is present), Android/iOS builds via Capacitor, and desktop installer packaging (`npm run dist`).
- When asked to validate a change, match the claim to what's actually checked: `npm test` proves logic/contracts, not that an editor works in the browser or that Electron starts cleanly. If a task depends on one of the unverified areas above, say so explicitly rather than inferring success from the Node test suite.

## Commands

```bash
npm install
npm start                # Launch Electron desktop app
npm run server            # Web server only (http://localhost:3000)
npm run studio:dev        # Vite dev server for studio-ui (React, :5173)
npm run studio:build      # Build studio-ui for production

npm test                  # Full suite: test:ai + test:server + test:engines
npm run test:ai            # AI subsystem tests (public/ai/**/*.test.mjs)
npm run test:server        # Express route/util tests (server/**, run with --test-concurrency=1)
npm run test:engines       # Engine unit tests + 3D campaign validator
npm run test:coverage      # c8 coverage over server/ tests

npm run tools:audit        # Audit AI tool contracts vs. actual server routes (scripts/audit-tool-contracts.js)
npm run engine:lockstep    # Verify/sync duplicated engine code between public/engines and projects/*/engines
npm run ai:validate        # test:ai + validate-opencode-zen.js
npm run beta:check          # test:server + test:engines + studio:build — run before any beta build
```

To run a single test file directly: `node --test path/to/file.test.js` (or `.test.mjs`). Server tests must keep `--test-concurrency=1` if run manually — several share file-system/project state.

There is no lint script; there is no top-level `tsconfig` build step (TypeScript is used only inside `studio-ui`).

### Python AI backend (optional)

```bash
cd backend && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
python3 main.py    # FastAPI server on :8000, standalone mode
```
In the Electron app this process is spawned/managed automatically ("AI Cortex": auto-start, 20s heartbeat, crash-loop protection capped at 5 restarts/60s). `backend/tests` exists but needs `pytest`/`httpx`/`anyio` added to the venv — it is not part of any npm script and isn't currently run in CI-like checks here.

## Architecture

### Three-tier runtime
1. **Electron shell** (`electron-main.js`, `preload.js`) — owns the main window and manages the Python AI backend subprocess lifecycle.
2. **Express server** (`server.js` + `server/`) — serves `public/` as the web root, exposes the REST/WebSocket API, and proxies `/api/ai` to the Python backend on :8000.
3. **Python AI backend** (`backend/main.py`, `backend/brain.py`) — FastAPI + llama-cpp-python, runs local LLM inference (IrabBrain) independent of the browser-side AI.

### Server (`server/`)
Modular Express app: `routes/` (one file per REST resource — `projects`, `levels`, `levels3d`, `logic`, `campaigns`, `cutscenes`, `brains`, `shaders`, `git`, `build`, `ide`, `system`, `ai`, etc.), `services/` for business logic, `utils/` for shared helpers, `websocket/` for the chokidar-backed real-time sync gateway on the same port as HTTP.

Path safety is centralized and load-bearing: `server/utils/pathGuard.js` (`resolveUnderRoot`) confines any file path to a root directory, and `server/utils/automationPolicy.js` gates which paths AI-driven automation is allowed to touch. When adding routes or AI tools that touch the filesystem, route all paths through these guards rather than doing ad hoc `path.join`/`fs` calls — recent history shows this boundary gets hardened repeatedly (see `server/utils/pathGuard.test.js`, `automationPolicy.test.js`).

The server resolves file requests through a "virtual overlay": a project's own files under `projects/<name>/` take precedence, falling back to the core assets in `public/`. Keep this project-vs-core distinction in mind whenever adding new engine or editor assets.

### Engines (`public/engines/`)
Each engine (`rpg-topdown/`, `iso-pixel/`, `platformer-2d/`, `3d/`, `unified-3d/`) is a self-contained runtime with its own systems (entity, physics, camera, save, combat, etc.), plus `public/engines/shared/` for code used across engines (e.g. `Renderer3D`, `Camera3DController`, `Physics3DWorld`, `ConditionEvaluator`, `CrossEngineSerializer`).

Engine code is **duplicated** into each project directory under `projects/<name>/engines/` so shipped projects are self-contained. `npm run engine:lockstep` diffs `public/engines/` against every `projects/*/engines/` copy and can sync changes forward with `--apply` and an explicit `--allow` allowlist — never hand-edit a project's engine copy expecting it to propagate; either edit `public/engines/` and re-run lockstep, or add the target explicitly to the allowlist.

`unified-3d/` is a newer multi-mode wrapper (`Game3DCore`, `Unified3DGame`, `modes/{FPSMode,PlatformerMode,TopDownMode}.js`) sitting on top of the older `3d/` engine's systems — check which layer a given 3D change belongs in before editing, since both exist side by side.

### Editors (`public/*.html` + supporting JS)
Each editor is a standalone HTML entry point (e.g. `editor3d.html`, `iso_editor.html`, `algorithm_editor.html`) backed by JS modules in `public/`. `studio-ui/` is a separate React 19 + Vite app providing the newer dashboard chrome around these tools — it is built independently (`npm run studio:build`) and is not part of the main webpack/esbuild path for the editors themselves.

### Visual scripting / logic
Two parallel runtimes execute game logic graphs: `LogicInterpreter` (AST-based) and `VisualScriptEngine` (graph-based), both driven from the algorithm/node editor. They must stay format-compatible with both legacy and modern graph JSON — check `public/engines/shared` and the algorithm editor code before changing node/wire serialization.

### AI copilot (`public/ai/`)
Runs almost entirely client-side: `inference-engine.js`/`embedding-worker.js` (Transformers.js in Web Workers) for on-device LLM + embeddings, `rag-engine.js` + Orama/IndexedDB (`vector-store`) for retrieval, `agent-loop.mjs` for the multi-turn tool-calling agent (capped at 8 turns), and `permission-gate.js` for tool authorization.

Tools are tiered by risk (Safe / Low-Risk / Medium-Risk / High-Risk — see README "Tool Security Levels"). Tool contracts are defined in `public/ai/tool-definitions.js` / `tool-aliases.mjs` and must stay in sync with the actual Express routes; `npm run tools:audit` (`scripts/audit-tool-contracts.js`) statically checks this by parsing `server.js` + `server/routes/*` and comparing against the declared tool contracts — run it after adding/renaming any route an AI tool depends on.

### Save/serialization
Cross-engine saves use a shared JSON format via `CrossEngineSerializer` (`public/engines/shared/`), independent of which of the six engines produced the save — changes to save schema need to be engine-agnostic.

### Known structural rough edges
- `public/` is a large, mixed bag — editor UIs, engine runtimes, AI, shared systems, and static assets all live there side by side. There are two coexisting studio patterns: standalone `public/*.html` + vanilla JS editors, and the newer `studio-ui/` React/Vite app. Check which pattern an area already follows before adding to it rather than mixing both.
- `projects/Default Project/` is a mixed sandbox spanning all three 2D-ish engines (iso-pixel, rpg-topdown, platformer-2d) with inconsistent goal/exit metadata across levels — don't treat it as a clean reference implementation of "how a finished game should be structured."

## Testing conventions

- Tests are plain `node --test`, colocated with source as `*.test.js` / `*.test.mjs` (e.g. `server/utils/pathGuard.test.js`, `public/engines/__tests__/...`).
- `test:engines` also runs `scripts/validate-3d-campaign.js`, a standalone validator (not a `node --test` file) that must pass independently.
- `test:server` intentionally runs with `--test-concurrency=1`; several route tests mutate shared project/file state and are not safe to parallelize.
