# Refactor Plan with Milestones and Owners

Date: 2026-02-26
Goal: Increase reliability, maintainability, and scalability while preserving shipping velocity.

## 1) Owners (Role-Based)
- Platform/Server: Node.js server, WebSocket, file I/O, project services.
- Tools/Editors: All editor UIs and shared editor components.
- Runtime/Engines: IsoPixel, RPG Top-Down, Platformer runtime cores.
- AI/Infra: Tool registry, permission gate, AI UI, backend AI bridge.

## 2) Milestones

### Milestone 0: Baseline Observability (1 week)
Owner: Platform/Server + AI/Infra
- Add structured server logging for key routes (project switching, assets, IDE write/delete).
- Add EventBus event sampling and drop counters for debug streams.
- Add AI backend health endpoint to the dashboard status panel.
Deliverables:
- `server` emits JSON logs for critical APIs.
- Dashboard shows a simple health indicator for AI backend.

### Milestone 1: WebSocket Reliability and Event Schema (2 weeks)
Owner: Platform/Server
- Ensure WebSocket setup uses correct root project options and file watcher is started reliably.
- Define a minimal event schema and validate a few high-traffic events (`asset:*`, `project:*`, `system:metrics`).
Deliverables:
- WebSocket file watcher enabled in all modes.
- Schema validation for at least 5 core event types.

### Milestone 2: Editor Core Extraction (3 weeks)
Owner: Tools/Editors
- Create a shared editor UI kit for toolbars, modals, panels.
- Extract a shared graph engine used by Algorithm Studio and Campaign Studio.
- Standardize layout configuration and shortcuts across editors.
Deliverables:
- `public/shared/EditorCore.js` or equivalent.
- Graph engine API with unit tests for edge cases.

### Milestone 3: AI Tooling Hardening (2 weeks)
Owner: AI/Infra
- Add runtime schema validation for tool args before execution.
- Normalize and validate file paths against project roots.
- Improve diff previews for AI-initiated edits.
Deliverables:
- ToolRegistry validates args against JSON schema.
- PermissionGate uses canonical paths from server.

### Milestone 4: Runtime Modularization (4 weeks)
Owner: Runtime/Engines
- Split IsoPixel engine into subsystems (Input, Simulation, Render, FX, HUD).
- Add a shared render pipeline interface for potential WebGL migration.
- Implement a “headless” test mode for at least one runtime.
Deliverables:
- Subsystem classes with clear interfaces.
- Minimal test harness for runtime logic (no DOM).

### Milestone 5: Build and Data Pipeline (3 weeks)
Owner: Platform/Server + Runtime
- Build a packaging step to bundle project data into a runtime manifest.
- Remove hard runtime dependency on server endpoints for production builds.
Deliverables:
- `build-game.js` outputs a standalone runtime bundle with `game_data.json`.

## 3) Sequencing Notes
- Milestone 1 should precede editor and AI refactors to stabilize the EventBus.
- Milestone 2 and 3 can run in parallel if owners are separate.
- Milestone 4 depends on the shared rendering interface from Milestone 2.

## 4) Risk Management
- Risk: Large editor refactors can regress UX. Mitigation: incremental extraction and feature flags.
- Risk: AI tool changes could break internal flows. Mitigation: introduce schema validation in “warn-only” mode first.
- Risk: Runtime modularization could introduce regressions. Mitigation: add headless simulation tests per subsystem.

