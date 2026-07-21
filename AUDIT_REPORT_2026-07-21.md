# Redglitch Engine — Codebase Audit Report

**Generated:** 2026-07-21
**Method:** Fresh verification against current `main` (`5379050`), cross-checked against prior self-audits (`fix.md`, `placeholder.md`, `DEAD_CODE.md`, June–July 2026) since the most recent commit labeled "a big bugfix stage" (`df81626`) only touched `README.md`, `package.json`, and screenshot assets — **no application code changed** in that commit, so most prior findings are still live unless noted "✅ Fixed" below.

> **Correction (2026-07-21, follow-up pass):** Building the fix plan for this report surfaced 4 items below that don't hold up under closer verification, and a fix pass was applied for the remainder. See §0 for what changed.
>
> **Correction #2 (2026-07-21, placeholder-tool follow-up):** A second round of verification, this time targeting the "placeholder/stub" catalog in §2 specifically, found **six more items in this report were already stale when it was written** — carried over from the older `placeholder.md` without re-checking. See §0b.

## TL;DR

- **Automated test suite is genuinely green**: 471/471 tests pass (`test:ai` 29, `test:server` 49, `test:engines` 393), `tools:audit` reports zero contract drift, `studio:build` compiles cleanly.
- Several previously-documented critical bugs **are now fixed** (see "Resolved since last audit").
- The bulk of `fix.md` / `placeholder.md` issues (XSS-prone `innerHTML`, empty catch blocks, unauthenticated `/projects` static exposure, hardcoded URLs, ability/weather/cutscene stubs) are **still present**.
- Biggest structural "unconnected part": **`studio-ui/` is not wired into the production server or Electron app** — its HTML entry points load `/src/*.tsx` directly, which only resolves under `vite dev` (`npm run studio:dev`), not under `npm start` or `npm run server`.

---

## 0. Follow-up pass (2026-07-21): corrections + fixes applied

**False positives in this report** (re-verified against actual file contents, not just inherited from `fix.md`/`placeholder.md`):
- `public/transitions.css` — the `animation` name and `@keyframes` name already match (`pageFadeIn`/`pageFadeIn`). Never broken; §2's claim was a stale copy from `fix.md` that itself was already fixed before this report was written.
- `public/enemy_editor.html`, `public/item_editor.html` — no duplicate DOM ids exist in either file currently. Not broken.
- `public/iso_editor.js` worker path (`/iso_generator_worker.js`) — correct as written. `public/` is mounted at the site root (`server.js:330`), so the absolute `/iso_generator_worker.js` path resolves to `public/iso_generator_worker.js` exactly as intended.
- **studio-ui characterization was wrong.** §TL;DR and §2 claimed the whole studio-ui React shell doesn't work outside `vite dev`. That's incorrect: `npm run studio:build` outputs fully self-contained bundles to `public/studio-dist/*.html` (verified: `dashboard.html` there loads a bundled `/studio-dist/assets/dashboard-*.js`, no raw `.tsx` reference), and since `public/` is the static root those pages **do** work standalone in production. The real, narrower gap: only 1 of the 17 built studio-ui pages (`shader_editor`, wired in `public/js/Studio.js:44`) is actually linked from the running app's UI — the other 16 are reachable only by navigating to their URL directly. That's a UX/navigation gap, not a build/wiring failure, and applying a fix requires a product decision (do these replace the existing `public/*.html` editors of the same name, or supplement them?) — left for you to decide, not auto-applied.

**Fixed in this pass:**
- `public/background_editor.html` — added missing `<!DOCTYPE html>`, `<html>`, `<head>`, `<meta charset>`, `<meta viewport>` (page was a headless fragment forcing quirks mode).
- 10 genuinely-empty `catch (e) {}` blocks in `server/routes/{brains,audio,gamedata,projects}.js` and `server/services/AssetRegistry.js` now log via `if (e.code !== 'ENOENT') console.error(...)`, matching the pattern already used elsewhere in the same files. The ~46 similar empty catches in `public/*.js` (editors, `SoundManager.js`, `EventBus.js`) were deliberately left alone — spot-checking showed most are intentional best-effort swallows (e.g. stopping an already-stopped audio node), not bugs.
- Deleted `projects/__test_p1`, `__test_p2`, `__test_p3` (leftover gitignored test fixtures that were skewing `engine-lockstep`'s default output).
- Reverted an incidental modification to the tracked `engine-lockstep-report.json` caused by running the lockstep script during this audit.
- `CLAUDE.md`'s pytest note corrected (see §3 below — pytest is in fact installed).

Full detail in the repo-root fix plan this pass followed. Everything below this section is the **original, unmodified** report text, kept for the record — read it alongside the corrections above rather than in isolation.

---

## 0b. Second follow-up pass (2026-07-21): placeholder-catalog corrections + fixes applied

The user asked to also fix "half-working/placeholder-state tools." Before fixing, every item was re-verified against current code (not just re-copied from `placeholder.md`). Result: most of what §2 lists as stubs turned out to already work.

**False positives — already fully implemented, contrary to §2's "Placeholder / stub implementations" table:**
- `InteractiveCutsceneEngine.js` — `connectToAlgorithmStudio`/`connectToCampaignEditor`, `InteractiveCutsceneTimeline`, `.Dialogue`, `.Choices`, `.State.checkCondition` are all fully coded (840-line file, not the smaller stub state described). It's live: instantiated by `Core.js`, `CampaignController.js`, and the cutscene editor's live preview. Editor output format matches what the engine consumes.
- `WeatherSystem.js` — fully implemented (280 lines: rain/snow/fog/storm/ash/heat, particles, lightning), not the 11-line ash-only stub described. A separate, more capable 3D counterpart (`WeatherSystem3D.js`) also exists and is in active use.
- `msn-bridge.js changeBackground()` — fully implemented theme-cycling function, not a "coming soon" stub.
- `platformer3d_editor.js collapseHierarchy()` — fully implemented (toggles a collapsed-state object + rebuilds the hierarchy), not a stub.
- `public/ai/avatar/renderer.js` mouse tracking — fully implemented (`_trackMouse()`, used in `draw()`); no TODO exists in the file.
- `public/shader_editor.html`'s described 15-line redirect page — doesn't exist at that path at all; only `public/studio-dist/shader_editor.html` (a real built page) and the `studio-ui/` source exist.

**Confirmed dead, now removed:** `AtmosphereSystem.js` — zero live references anywhere (no HTML ever defined its target `#atmosphere-canvas` element, nothing instantiated it). Deleted, along with two orphaned dead hooks that referenced it (`CampaignController.js`'s empty `if (window.atmosphere) {}` block, `MenuSystem.js`'s dead `this.atmosphere &&` guard).

**Confirmed real bug, now fixed:** the 3D ability system. `FPS3DStrategy`/`Platformer3DStrategy` (`public/engines/3d/systems/`) have complete ability/cooldown implementations — but the *newer* `unified-3d` adapter stack couldn't reach them:
- `unified-3d/Unified3DAdapter.js` called `mode.useAbility(...)` — a method that doesn't exist on `FPSMode`/`PlatformerMode`; the real implementation lives one level deeper, on `mode.strategy`. Fixed to delegate through `mode.strategy`.
- `PlatformerMode.js` never instantiated `Platformer3DStrategy` at all. Now does, mirroring `FPSMode.js`'s existing pattern.
- Neither mode ever called the strategy's `tickAbilities(dt)`, so cooldowns would never have counted down even with the wiring fixed. Now wired into both modes' `update(dt)`.
- The *older* `engines/3d/main.js` stack's FPS/platformer modes have no ability system at all (verified — zero ability-related code in `modes/fps.js`/`modes/platformer.js`), so its separate adapter's `game.abilities` forwarding was left alone: it's accurately reporting an absent feature, not a wiring bug.
- **Not verified beyond static correctness**: no automated or browser test exists for actually firing a 3D ability in a live scene — this fix is a read-through-verified wiring correction, not something exercised end-to-end.

**Also addressed:** 15 of 16 built `studio-dist` React editor pages had no link anywhere in the app's UI (`public/js/Studio.js`) despite working standalone and having an older `public/*.html` counterpart already in the nav. Added each as a new "(New)" entry alongside its older counterpart (not a replacement) in `public/js/Studio.js`'s `tools` array. `ui_designer` (no old counterpart) added as its own entry; `studio_main` intentionally left unlinked — it's `studio-dist`'s own shell page, not an editor tool.

**Deliberately left alone:** `server/routes/monitor-3d.js`'s always-synthetic `MONITOR_MODE` — its own file header documents this as intentional dev scaffolding, not a bug; building a real-data mode is new feature work.

---

## 1. Resolved since last audit (verified, do not re-fix)

| Prior finding | Verification |
|---|---|
| `server/routes/levels3d.js` used `safeFs` without importing it | `safeFs` is now required at line 22, used correctly at line 340 |
| `server/routes/git.js` had no try/catch | All 4 route handlers now wrap `gitService` calls in try/catch |
| No global Express/Node error handlers | `server.js:12` `uncaughtException`, `:15` `unhandledRejection`, `:366` Express error middleware all present |
| Hardcoded Cerebras API key in `.redglitch/ai_config.json` | Key field is now empty (`"cerebrasKey": ""`) |
| No root `tsconfig.json` | `tsconfig.json` exists at repo root |
| Python backend deps (`llama-cpp-python`, `sentence-transformers`, `watchdog`, `numpy`) missing | All import cleanly in `backend/venv` (Python 3.9); `pytest` is also installed and 3 backend tests collect successfully — contradicts CLAUDE.md's note that pytest is absent, worth updating that doc |
| `server/routes/abilities.js` labeled "placeholder" | Route now reads/writes real per-project `data/abilities/*.json` files — no longer a stub |
| `projects/Default Project/engines/*` had 61 broken relative imports | That directory no longer exists under `Default Project` at all (project now relies on the `public/engines` fallback overlay) |
| Screenshots bloat (45MB Cyrillic-named PNGs in `screenshots/`) | Directory no longer present |

## 2. Still broken / unconnected (verified live on current `main`)

### Unconnected / not wired up
- **`studio-ui/*.html` → `/src/main_*.tsx`**: every entry point (`dashboard.html`, `daw_editor.html`, `asset_manager.html`, etc.) does `<script type="module" src="./src/main_dashboard.tsx">`. This resolves only through Vite's dev server. `npm run studio:build` does produce a working bundle in `public/studio-dist/`, but the source HTML files themselves are never repointed at the built assets, and neither `server.js` nor `electron-main.js` appears to route requests for `studio-ui/*.html` through the built output. Net effect: the React studio shell only works via `npm run studio:dev` on port 5173, not through the shipped Electron app or `npm start`.
- **`server/routes/monitor-3d.js`**: `MONITOR_MODE` defaults to `'simulated'` (`process.env.MONITOR_MODE || 'simulated'`) — real 3D monitoring is opt-in via env var and effectively unused by default.
- **`InteractiveCutsceneEngine.js`** (`public/engines/rpg-topdown/`): `connectToAlgorithmStudio()` and `connectToCampaignEditor()` are explicit TODO stubs (lines 294/299) — the cutscene engine cannot actually talk to the Algorithm Studio or Campaign Editor yet, despite both editors existing independently.
- **`AtmosphereSystem.js`** (`public/shared/`): entirely disabled — canvas hidden, `animate()` is a no-op.

### Placeholder / stub implementations
| Component | File | Behavior |
|---|---|---|
| `FPS3DStrategy.useAbility/isAbilityReady/getCooldownFraction` | `public/engines/3d/systems/FPS3DStrategy.js:161,175,185` | Always `false`/`true`/`0` — no ability system in FPS mode |
| `Platformer3DStrategy` same trio | `public/engines/3d/systems/Platformer3DStrategy.js:132,144,154` | Same — no cooldown tracking |
| `InteractiveCutsceneTimeline/.Dialogue/.Choices/.State` | `public/engines/rpg-topdown/InteractiveCutsceneEngine.js:314-476` | Timeline rendering, dialogue loading, choice animation, condition checks all TODO |
| `WeatherSystem.js` | `public/engines/rpg-topdown/` | 11 lines — only ash + heat ripple, no rain/snow/fog |
| VSL logic graphs (`engine_physics.json`, `system_init.json`, `ui_master.json`) | `data/logic/` | Use `eng_log` nodes to *log* physics/init/render steps instead of performing them |
| `data/logic/{start_game,open_engine,confirm_skills_and_start}.js` | `data/logic/` | 4-line stubs delegating to `ui.handleAction()` |
| `data/fx/`, `data/shaders/` | empty directories | Scaffolding for unbuilt VFX/shader systems |
| `SoundManager._generateSynthetic()` | `public/shared/SoundManager.js:536` | Synthesizes a beep/chime/thud whenever a real audio asset fails to load — silent fallback, not a real fix |
| `msn-bridge.js changeBackground()` | `public/ai/msn-bridge.js:506` | Returns "Feature coming soon!" |
| Mouse tracking | `public/ai/avatar/renderer.js:168` | TODO, unimplemented |
| `collapseHierarchy()` | `projects/Default Project/platformer3d_editor.js:1023` | Stub — always shows all sections |
| `test_wander.js` NPC brain | `data/brains/` | 21-line placeholder brain |
| `backend/tests/test_basic.py::test_basic` | one assertion, `assert True` — placeholder test, doesn't test anything |

### Correctness / robustness issues (still present)
- **55 empty catch blocks** (`catch (e) {}` with no body) across `server/`, `public/*.js`, and `studio-ui/src` — swallows every failure silently (server.js, campaigns.js, brains.js, gamedata.js, projects.js, audio.js, AssetRegistry.js, and 16+ editor components). Slightly down from the 48 previously tallied file-locations but the pattern is unresolved codebase-wide.
- **`/projects` fully exposed via `express.static`** with no auth (`server.js:331`) — any file under any project, including save data, is publicly readable by path.
- **`~29 files under `public/*.js`** still use raw `innerHTML` assignment with what appears to be user/editor-controlled content (down from the 33-file/242-occurrence count previously logged, but not eliminated) — stored-XSS risk in the editors, particularly `campaign_editor.js`, `behavior_editor.js`, `daw.js`, `iso_editor.js`.
- **CSP with `'unsafe-inline'`/`'unsafe-eval'`** still present in `public/index.html`, `public/campaign_runtime.html`, `projects/Default Project/index.html`.
- **21 MB WASM binary** (`public/lib/transformers/ort-wasm-simd-threaded.jsep.wasm`) plus ~9 more WASM files still tracked directly in the repo.
- **Hardcoded URLs / no config**: `server.js` `IRAB_BACKEND` → `http://localhost:8000`; `build-game.js:197` → `http://localhost:3000/launcher.html`; `cerebras-adapter.js:8` → `https://api.cerebras.ai/v1`; `Editor3DCore.js:359` → unpkg CDN for GLTFLoader.
- **`iso_editor.js` Worker path mismatch**: `new Worker('/iso_generator_worker.js')` at root, but the file lives at `public/iso_generator_worker.js` — same issue in the worker's own `importScripts('/iso_generator.js')`.
- **CSS keyframe name mismatch**: `public/transitions.css` — `animation: pageHideFadeIn` references a `@keyframes` block actually named `pageFadeIn`; the animation silently no-ops.
- **`public/background_editor.html`** is a bare fragment with no `<!DOCTYPE>`/`<html>`/`<head>`/`<body>` — renders in quirks mode.
- **Duplicate DOM ids**: `enemy_editor.html` (`enemy-ai-type`, `enemy-brain` each defined twice), `item_editor.html` (duplicate `id` on one element).
- **`shader_editor.html`** is a 15-line client-side-redirect-only page to `shader_lab.html`.

## 3. Housekeeping / clutter found this pass (new)

- **`projects/__test_p1`, `__test_p2`, `__test_p3`**: leftover fixture projects (each with a full duplicated `engines/` tree) left behind by a prior test run. They're gitignored so they don't pollute version control, but they do pollute `npm run engine:lockstep`'s default output — running it with no `--project` flag reports drift only for these three throwaway fixtures instead of the real `Default Project`, which is easy to mistake for "the lockstep check is clean" or "it's broken" depending on which way you misread it. Recommend deleting `projects/__test_p*` locally.
- **`engine-lockstep-report.json`** at repo root is a stale generated artifact referencing a project ("My Awesome Game") that doesn't exist in `projects/` anymore — safe to regenerate or gitignore.
- Six overlapping self-audit docs already exist at repo root from prior sessions (`fix.md`, `placeholder.md`, `DEAD_CODE.md`, `project-report.md`, `project-report-chatgpt-honest-2026-07-05.md`, `project-honest-report-2026-07-05.txt`, `30DAY_ESCAPE_PLAN.md`) — worth consolidating or archiving so future audits (including this one) aren't re-deriving the same ground from scratch.
- `CLAUDE.md` states `backend/tests` "needs pytest/httpx/anyio added to the venv" — that's now inaccurate; pytest is installed and 3 tests collect/run. Worth updating the doc so future sessions don't undersell backend test coverage.

## 4. What's verified solid (don't re-litigate)

- `npm test` → 471/471 passing (AI 29, server 49, engines 393), confirmed by direct run.
- `npm run tools:audit` → 0 missing endpoint matches, 0 missing editor files across 21 registered AI tools / 147 server routes.
- `npm run studio:build` → compiles without error (497KB dashboard chunk warning only, not a failure).
- Python backend imports (`llama_cpp`, `sentence_transformers`, `watchdog`, `numpy`) all succeed in `backend/venv`.

## 5. Not verifiable in this pass (per CLAUDE.md's own caveats — still true)

- Electron shell runtime behavior (window lifecycle, preload bridge, Cortex subprocess management) — no automated coverage exists, not exercised here.
- Editor GUI end-to-end flows in a real browser — not run.
- Desktop/mobile packaging (`npm run dist`, Capacitor Android/iOS builds).
