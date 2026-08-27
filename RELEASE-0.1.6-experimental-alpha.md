# Redglitch Game Studio v0.1.6-experimental-alpha

**Tag:** `v0.1.6-experimental-alpha`
**Date:** 2026-08-27
**Type:** Experimental alpha (local-first). NOT production-ready.

## What's in this release

A bug-hardening pass over the July-21 audit findings plus targeted correctness fixes.
All automated gates are green: `npm test` (393 pass / 0 fail), `npm run tools:audit`
(0 contract drift), `npm run engine:lockstep` (engines in sync), `npm run studio:build`,
and the Python backend test suite (3 passed).

### Critical — security
- **Path traversal / RCE hardening.** `setActiveProject` now strips illegal characters and
  contains the resolved path inside `PROJECTS_ROOT` (`server/services/projectService.js`).
  The `projects.js` "switch project" route sanitizes the name before calling it, and
  `ui-config.js` validates that the resolved UI-config path stays within the active project.
- **Unmatched `/api/*` requests now return a JSON 404** instead of a 302 redirect to
  `dashboard.html`, removing a confusing redirect for API clients (`server.js`).

### High — correctness
- **3D abilities were dead (no-op).** The unified-3D modes (`FPSMode`, `PlatformerMode`,
  `TopDownMode`) now bind their combat/terrain strategies to the *mode* object (which owns
  the player/camera/abilities) and expose delegation getters (`renderer3d`, `renderer`,
  `camera3d`, `raycast`, `scene`, `gameTime`) plus `TopDownMode.player`. Strategy methods now
  read live game state, so abilities actually fire.
- **Python AI event-loop blocking.** `main.py` moves token streaming off the asyncio event
  loop into a worker thread bridged via a queue; `/chat` fallback runs in an executor. The
  server no longer stalls while generating.
- **Lazy ML import.** `rag.py` no longer imports `sentence_transformers` at module top level
  (which crashed startup on machines without the dep); it imports lazily inside `__init__`.
- **Missing base_game assets.** Added `public/base_game/sprites.js` and
  `public/base_game/fxSystem.js` so editor/preview pages that load them stop 404-ing.
- **CSP in campaign runtime.** `campaign_runtime.html` no longer loads scripts from
  `cdnjs.cloudflare.com` / `cdn.jsdelivr.net`; `script-src` is now `'self' 'unsafe-inline' blob:`.

### Medium — robustness / hygiene
- **Server error responses are JSON.** `projects.js` plain-text `.send()` errors converted to
  `.json({error})` for consistent API consumers.
- **Python failure logging.** `main.py` / `watcher.py` log exceptions from background futures
  (brain load, reindex, watcher) instead of swallowing them; `rag.py` ingest is lock-guarded.
- **New backend routes.** `POST /api/ai/config` (persists to `.redglitch/ai_config.json`) and
  `GET /health` added; backend tests now exercise real endpoints (`/health`, `/api/ai/chat`,
  `/api/ai/rag/reindex`).
- **`Unified3DAdapter.isAbilityReady` fallback** changed from `true` to `false` (don't report
  an ability ready when its state is unknown).
- **Stale `?v=` query strings removed** from unified-3d module imports so browsers load a
  single canonical instance of each module (previously duplicate instances broke shared state).
- **InnerHTML XSS hardening.** Added `public/shared/domSanitize.js` (`escapeHtml`) and escaped
  user/project-controlled strings interpolated into `innerHTML` across the campaign, DAW,
  iso, behavior, prefab, FX, pixel, item, enemy, and NPC editors. Also **fixed a corrupt line
  in `item_editor.js`** (`}server.");`) that made the entire file fail to parse/load.
- **FPS / TopDown save-restore correctness.** `FPSMode.getPlayerData` no longer indexes the
  player position as an array (was writing `NaN`); `TopDownMode` now reads/writes hero HP from
  the hero entity instead of a non-existent `game.player`.
- **Studio UI links fixed.** `StudioApp.tsx` pointed `shader_lab.html` → `shader_editor.html`
  and `project_dashboard.html` → `../dashboard.html`.
- **Repo hygiene.** `*.wasm` forward-guard added to `.gitignore`; stale `engine-lockstep-report.json`
  and presentation-only `portfolio-screenshots/` untracked. `opencode-memory/` kept local-only.
- **README** clone URL placeholder corrected to the real repository.

#### Phase 4 — polish (also in this release)
- **Editor HTML `viewport` meta** added to all 21 standalone editor pages for correct mobile/embed rendering.
- **Generated game server hardened** (`build-game.js`): the shipped `/api/save/:u/:s` now sanitizes
  `u`/`s` (no path traversal out of `userDataPath`); generated `package.json` reads the version from the repo.
- **Python backend env-config**: `main.py` now honors `IRAB_HOST`, `IRAB_PORT`,
  `IRAB_MODEL_REPO/FILENAME/DIR/PATH` (override model/host without code edits).
- **Branding unification**: `RedGlitch` → `Redglitch` across ~185 source files (the canonical
  lowercase-g spelling from `package.json`/`appId`).
- **Studio UI**: 9 empty `catch` blocks now log a warning instead of silently swallowing errors.

## Known limitations (not fixed this pass)
- `/projects` is statically served (contained by `express.static` to `PROJECTS_ROOT`); editors
  require it to load project assets in this local-first app.
- 3D ability *firing* is not covered by any automated/browser test — the strategy-binding fix
  is verified by read-through and unit tests, not an end-to-end playthrough.
- Several audit claims were false positives (verified live) and intentionally left as-is:
  CORS `file://`, empty-catch counts, iso worker paths, `transitions.css`, studio-ui wiring.

## Upgrade notes
No data migration required. Pull the tag, `npm install`, and run `npm start` (or `npm run server`).
