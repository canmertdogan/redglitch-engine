# Ketebe (Ketebe) Engine - Codex Memory Report Card

Date: 2026-02-26
Scope: Full repository scan with emphasis on `public/`, `server/`, `backend/`, `architecture/`, and `planmemory/`.

## 1) Snapshot Summary
- Repository is a hybrid game-development studio + runtime, built on a Node/Electron core with a browser-based IDE and a Python AI backend.
- Core entry points are `server.js`, `electron-main.js`, and `backend/main.py`.
- The public-facing engine and tools live under `public/` with three engine paradigms and multiple specialized editors.
- The AI system is split between a browser-native AI (Transformers.js, WebGPU/WASM) and a local Python “Cortex” service.
- The project uses a shadow filesystem overlay to let per-project assets override core engine defaults.

## 2) Codebase Map
Primary roots and roles:
- `public/`: Immutable core. Engines, IDE tools, shared libs, AI UI, and asset libraries.
- `projects/`: User projects and override layer for assets and scripts.
- `server/`: Express server, routes, services, middleware, and WebSocket wiring.
- `backend/`: Python FastAPI “Cortex” with RAG and local model management.
- `architecture/`: Documentation and system diagrams.
- `planmemory/`: Roadmaps, critiques, and review reports.
- `electron-main.js`: Desktop entry point and Cortex process orchestration.
- `build-game.js`: Build/export pipeline.

Repository size indicators (approximate, local scan):
- `public/` is ~106MB and holds the IDE, tools, engines, and shared libraries.
- `backend/` is ~2.8GB due to local models, data, and vector DB artifacts.
- `projects/` is ~114MB with sample projects and assets.
- `node_modules/` is ~1.2GB for the frontend and tooling dependencies.
- Non-`node_modules` file count is ~5,867 files. This excludes vendor dependencies but includes project assets and docs.

Key docs read for system intent and constraints:
- `architecture/OVERVIEW.md`
- `architecture/AI_SYSTEM.md`
- `planmemory/ENGINE_ARCHITECTURE.md`
- `planmemory/PROJECT_REVIEW_DETAILED.md`
- `planmemory/REVIEW_REPORT.md`
- `planmemory/SOLUTION_PLAN.md`
- `README.md`
- `CODE_REVIEW.md`

## 3) Architecture Overview
- The system is a local, hybrid architecture. A Node.js server provides filesystem and API access, while the IDE and runtime are browser-based SPAs served from `public/`.
- The engine is multi-paradigm with three separate runtime cores and shared infrastructure.
- A project overlay model is used for customization: the server resolves requests by checking project overrides first, then the core `public/` fallback.

Key entry points:
- `server.js` mounts API routes, static asset serving, and the IRAB proxy.
- `electron-main.js` launches the desktop window and manages the Python backend process.
- `backend/main.py` runs the FastAPI AI service and RAG indexing.

Data flow in practice:
- Tools and editors use API routes in `server/routes/*.js` for IO and project management.
- The runtime uses `public/shared/AssetManager.js` and `public/shared/EventBus.js` for data and live updates.
- AI requests go to `/api/ai` which proxies to the Python backend on `localhost:8000`.

## 4) Major Systems
Engines:
- IsoPixel: 2.5D isometric engine with lighting, FX, and depth sorting. `public/engines/iso-pixel/`.
- RPG Top-Down: Dialogue, questing, and logic-heavy systems. `public/engines/rpg-topdown/`.
- Platformer: AABB physics and side-scrolling camera. `public/engines/platformer-2d/`.

Shared infrastructure:
- Asset system: `public/shared/AssetManager.js`.
- Eventing: `public/shared/EventBus.js`.
- Project state: `public/shared/SharedProjectState.js`.

AI system:
- Browser AI: `public/ai/` uses Transformers.js for WebGPU/WASM inference, Orama for RAG, and a tool registry for IDE actions.
- Python Cortex: `backend/main.py`, `backend/brain.py`, `backend/rag.py` for local inference, history, and indexing.

Server:
- Express server provides project, asset, and editor endpoints: `server/routes/*`.
- WebSockets used for live updates: `server/websocket/`.

## 5) Report Card (Very Detailed)

### 5.1 Vision and Product Cohesion - Grade A-
- Strong, consistent intent: a studio-grade game creation ecosystem, not just a runtime.
- Clear identity: hybrid editor + runtime, multi-engine, and AI-assisted creation.
- Naming inconsistency persists (Ketebe vs Ketebe) and shows up across docs and config.

### 5.2 Architecture and Modularity - Grade B+
- Good separation of concerns between Node server, browser tools, and Python AI.
- Overlay filesystem model is a clear, scalable concept.
- WebSocket wiring appears underutilized or misconfigured in current server setup.
- Server still contains many direct responsibilities; more modularization is possible.

### 5.3 Codebase Organization - Grade B
- Clear top-level directories with explicit roles.
- `public/` is large and heterogeneous. Editors share patterns but are not consolidated.
- Duplicate logic exists across editor tools, which impacts maintainability.

### 5.4 Performance and Scalability - Grade B-
- Rendering is still Canvas 2D in most places; large scale scenes likely struggle.
- Asset scanning and file operations appear synchronous in some flows.
- Planmemory documents identify GPU-based rendering (Pixi.js) as a future fix.

### 5.5 Security and Safety - Grade C+
- Local-only design is assumed, but several endpoints are powerful.
- IDE endpoints allow read/write/delete with limited path checks. It is correct for local tooling but unsafe if exposed.
- The AI backend runs without authentication, which is acceptable locally but should be hard-gated.

### 5.6 Reliability and Error Handling - Grade B-
- Many server routes handle errors but often return generic messages.
- Some components assume happy-path file structures.
- Cortex process and AI proxy include resiliency steps, but there is limited visibility into failures.

### 5.7 Build and Release - Grade B
- Build pipeline exists for desktop and mobile with `build-game.js` and Electron Builder.
- Capacitor configs are present and consistent.
- Build artifacts and dependencies are large, suggesting time-to-build may be high.

### 5.8 AI Integration - Grade A-
- Unique strength: full local inference, RAG, and tool invocation.
- Solid architectural separation between frontend AI and Python backend.
- Current UX appears rich but could use stronger rate limiting and backend health diagnostics.

### 5.9 Documentation - Grade B+
- Strong architecture docs and plans in `architecture/` and `planmemory/`.
- Numerous roadmap documents can be a signal of plan sprawl; consolidation would help.

### 5.10 Testing and QA - Grade C
- No clear automated test suite or CI.
- Existing review docs include manual assessments and critiques.
- There is no explicit test harness for editor interactions or runtime behavior.

## 6) Strengths and Differentiators
- Multi-engine architecture under a unified IDE is genuinely differentiated.
- Strong integration of local AI with RAG and tool-level permissions.
- Shadow filesystem overlays are an elegant approach to project customization.
- The editors and visual tooling represent significant product depth.

## 7) Known Gaps and Risks
- Server WebSocket wiring likely has configuration issues, so live updates may be unreliable.
- Project naming inconsistencies propagate to build scripts and templates.
- IDE endpoints are permissive by design but could become a major risk if remote access is enabled.
- `public/` is a large monolith with duplicated editor logic and inconsistent code organization.
- Backend footprint is very large due to local model storage and dataset indexing.

## 8) Tech Debt Summary
- Inconsistent naming across Ketebe/Ketebe, Turkish vs English naming in paths.
- Mixed sync/async file IO and error handling patterns.
- Duplicate logic across editors and tools.
- Possible misconfigured WebSocket file-watcher startup.

## 9) Immediate Quick Wins
- Align product naming in `package.json`, UI, and docs.
- Consolidate editor shared logic into a `public/shared/EditorCore.js` or equivalent.
- Pass explicit options into WebSocket setup and start file watching reliably.
- Add basic environment guardrails on the IDE endpoints to prevent use outside `localhost`.

## 10) Medium-Term Opportunities
- GPU-accelerated rendering pipeline using Pixi.js or similar.
- Formalize a build step that compiles project data into a runtime bundle.
- Add a minimal test harness for API endpoints and critical editor flows.
- Introduce a consistent error reporting format across server routes.

## 11) Evidence and Reference Files
- `server.js`
- `server/config.js`
- `server/routes/ide.js`
- `architecture/OVERVIEW.md`
- `architecture/AI_SYSTEM.md`
- `planmemory/ENGINE_ARCHITECTURE.md`
- `planmemory/PROJECT_REVIEW_DETAILED.md`
- `planmemory/REVIEW_REPORT.md`
- `planmemory/SOLUTION_PLAN.md`
- `README.md`
- `CODE_REVIEW.md`

## 12) Verdict
Ketebe is already a feature-rich game studio environment with a distinct and ambitious architecture. The strongest pillars are the multi-engine design and AI integration. The most urgent work is to reduce duplication, harden tooling interfaces, and make the realtime update pipeline reliable. With those addressed, the codebase is positioned to transition from alpha to a more production-grade toolchain.

## 13) Follow-Up Artifacts
- Tool and runtime audit: `codex-memory/TOOL_AUDIT.md`\n- Refactor plan and milestones: `codex-memory/REFACTOR_PLAN.md`\n- Dependency and license audit: `codex-memory/DEPENDENCY_AUDIT.md`
