# RedGlitch Engine — Fix List

## 🔴 CRITICAL (will crash at runtime)

### C1. `server/routes/levels3d.js` — `safeFs` used without import
- **Line 339:** `safeFs.safeWriteFullPath(...)` will throw `ReferenceError: safeFs is not defined`
- All other route files import it. This one doesn't.

### C2. `server/routes/git.js` — No try/catch on any route handler
- **Lines 5–26:** All 4 routes (`GET /status`, `POST /add`, `POST /commit`, `GET /diff`) use `await` with no try/catch. Any rejection = unhandled promise rejection.

### C3. Server missing global error handlers
- **`server.js`:** No Express error-handling middleware `(err, req, res, next)`
- No `process.on('uncaughtException')` or `process.on('unhandledRejection')` — process crashes on any uncaught error.

### C4. Hardcoded Cerebras API key committed
- **`.redglitch/ai_config.json:4`** — `csk-49hntrfc8w686vf9hjj6623ekkwwxhrh9d6rjtch68rjttdh`
- Revoke immediately. Move to env var. Gitignore the file.

### C5. 61 broken imports in `projects/Default Project/engines/`
- **`projects/Default Project/engines/fps-3d/`, `platformer-3d/`, `topdown-3d/`** — all use `../shared/*.js` and `../../lib/three/three.module.js` relative imports that don't resolve within the template directory.
- Actual files live in `public/engines/shared/` and `public/lib/three/`.

### C6. 16 broken `<script src>` in `studio-ui/*.html`
- All reference `/src/main_*.tsx` (e.g., `main_item.tsx`, `main_studio.tsx`) but actual files are at `studio-ui/src/main_*.tsx`.
- No bundler configured to serve them.

### C7. Python backend dependencies not installed / missing
- **`backend/brain.py:2`** — `llama-cpp-python` not installed (will crash)
- **`backend/rag.py:14`** — `sentence-transformers` not installed (will crash)
- **`backend/watcher.py:4-5`** — `watchdog` not installed (will crash)
- **`requirements.txt`** — missing `numpy` (critical: `rag.py:7` imports it, not in requirements)
- **`requirements.txt`** — lists `chromadb` but it's never imported (dead dependency)

### C8. `public/ai/docs/generate-embeddings.js` imports renamed package
- **Line 8:** `require('@xenova/transformers')` — package renamed to `@huggingface/transformers`. Not in `package.json`.

### C9. `build:ai-worker` script references non-existent file
- **`package.json:16`** — `node public/ai/build-worker.js` does not exist.

---

## 🔴 HIGH PRIORITY

### H1. No `tsconfig.json`
- `typescript` is a devDependency; 16 `.tsx` files exist in `studio-ui/src/` but no TypeScript config exists.

### H2. `setup.sh` runs broken scripts
- **Lines 75–76:** Runs `npm run build:corpus` and `npm run build:ai-worker` — latter will fail (C9).

### H3. 45 MB of Cyrillic-named screenshots tracked in git
- **`screenshots/`** — 31 PNG screenshots (Cyrillic names). Should be removed and gitignored.

### H4. 57 MB of WASM binaries bloating the repo
- **`public/lib/transformers/ort-wasm-simd-threaded.jsep.wasm`** — 21 MB single file
- **9 more WASM files** totaling 57 MB. Consider hosting separately.

### H5. 1108 groups of duplicate files
- **~1000 texture images** stored in 4 copies each across `projects/` and `public/`
- Also PSD files duplicated across both trees.

### H6. 48 empty catch blocks silently swallowing errors
- **`server.js:163,172`** — `} catch (e) {}`
- **`server/routes/campaigns.js:22`** — `} catch (e) {}`
- **`server/routes/brains.js:30,38`** — `} catch (e) {}`
- **`server/routes/gamedata.js:66,166,169`** — `} catch (e) {}`
- **`server/routes/projects.js:52`** — `} catch (e) {}`
- **`server/routes/audio.js:142,146`** — `} catch(e) {}`
- **`server/services/AssetRegistry.js:53,68`** — `} catch (e) {}`
- **`server/routes/levels3d.js:373`** — `} catch (_) { /* skip malformed */ }`
- **16+ in `studio-ui/src/components/*.tsx`** — every editor component has bare catches
- **17+ in `public/*.js`** — `assistant.js`, `Studio.js`, `CommandCenter.js`, `logic_editor.js`, `npc_editor.js`, `platformer_editor.js`, `AlgorithmStudio.js`, `shader_editor.js`, `SoundManager.js`
- **Impact:** every failed operation silently fails — zero debuggability.

### H7. 242+ `innerHTML` assignments across 33 JS files (XSS risk)
- Heavy usage: `campaign_editor.js` (40), `behavior_editor.js` (30), `daw.js` (29), `iso_editor.js` (23)
- User-controlled content in `innerHTML` = stored XSS vector.

### H8. CSP with `'unsafe-inline'` and `'unsafe-eval'` in 3 files
- **`public/index.html:4`, `public/campaign_runtime.html:6`, `projects/Default Project/index.html:4`**
- Disables primary XSS protection.

### H9. `server/routes/test-3d.js` uses `require()` on ES modules + `require.resolve()` on browser files
- **Lines 466, 482, 494, 506:** `require('../../public/engines/shared/*.js')` — these are ES modules, will fail.
- **Lines 53–339:** 30+ `require.resolve()` calls for browser-side files.

### H10. `CORS origin 'file://'` is invalid
- **`server.js:67`** — The `file://` protocol has a null origin that cannot be matched with a string literal.

### H11. CSS animation keyframe name mismatch
- **`public/transitions.css:8`** — `animation: pageHideFadeIn` but keyframe defined as `@keyframes pageFadeIn` (line 11). Animation silently does nothing.

### H12. Missing `<meta charset>` in 2 files
- `public/background_editor.html` (no head at all)
- `public/example-integrated-editor.html`

### H13. Missing `<meta name="viewport">` in 36 HTML files
- Every editor HTML file under `public/` except `index.html` and `campaign_runtime.html`.

### H14. Inconsistent API response formats
- **`server/routes/projects.js`** — mixes `res.json({error})` with `res.send('plain text')`
- **`server/routes/build.js`** — same issue
- **`server/routes/brains.js:73`** — `res.status(404).send('// No JS found')` (plain text)
- **`server/routes/shaders.js:57`** — same pattern

### H15. `fs.writeFile` used directly without path traversal guard
- **`server/routes/ui-config.js:69`** — bypasses `safeFs.safeWriteFullPath` that all other write routes use.

### H16. Unmatched API routes redirect to HTML instead of 404 JSON
- **`server.js:335–337`** — `app.use('/api/*', ...)` sends `dashboard.html` for unmatched API routes.

### H17. Python backend: race condition on shutdown + unawaited futures
- **`backend/main.py:46–47`** — `watcher` may still be `None` if `load_brain_task()` hasn't set it yet
- **`backend/main.py:200`** — `run_in_executor` future is never awaited, exceptions silently lost
- **`backend/watcher.py:40`** — same: `run_coroutine_threadsafe` future discarded

### H18. Python backend: hardcoded model paths with no configurability
- **`backend/main.py:222–225`** — model repo, filename, and directory all hardcoded
- **`backend/main.py:595`** — host and port hardcoded

### H19. `public/background_editor.html` is a broken fragment
- No `<!DOCTYPE html>`, no `<html>`, `<head>`, `<body>`. Browser renders in quirks mode.

---

## 🟡 MEDIUM PRIORITY

### M1. Missing documentation files referenced by `codex-memory/REPORT_CARD.md`
- `architecture/OVERVIEW.md`, `architecture/AI_SYSTEM.md`, `planmemory/ENGINE_ARCHITECTURE.md`, `planmemory/PROJECT_REVIEW_DETAILED.md`, `planmemory/REVIEW_REPORT.md`, `planmemory/SOLUTION_PLAN.md`, `README.md`, `CODE_REVIEW.md`

### M2. `planmemory/` directory does not exist

### M3. No CI pipeline — `.github/` is completely empty

### M4. `package-lock.json` is gitignored — builds not reproducible

### M5. Test files exist but are never run (7 test files)

### M6. `.antigravitycli/` directory committed — unknown config/auth data

### M7. No `README.md`

### M8. Studio-ui React pages: 16 HTML files + 16 missing TSX entry points
- All `studio-ui/*.html` reference `/src/main_*.tsx` — no bundler, no TS config, no way to serve.

### M9. `user-select: none` on `body` in 36 HTML files
- Prevents text selection, harms accessibility for copy/paste.

### M10. Scripts in `<head>` without `defer` in 18 files (blocks rendering)
- `theme.js` loaded synchronously in every editor HTML.

### M11. Duplicate IDs in HTML
- **`public/enemy_editor.html:367–372 & 440–444`** — two `<select>` elements with `id="enemy-ai-type"`
- **`public/enemy_editor.html:384 & 448–449`** — two elements with `id="enemy-brain"`
- **`public/item_editor.html:220`** — two `id` attributes on same element

### M12. Font mismatch: `Press Start 2P` loaded but not actually imported
- **`public/campaign_launcher.html`** — uses `font-family: 'Press Start 2P'` but only `VT323` is loaded.

### M13. Google Fonts `@import` / direct link in production code (CORS risk)
- **`public/daw/v6-premium.css:7`** — `@import url('https://fonts.googleapis.com/...')`
- **`public/localization_editor.html:7`** — direct Google Fonts link

### M14. Invalid CSS custom property
- **`website/styles.css:33`** — `--glass-blur: backdrop-filter: blur(16px); ...` — custom properties cannot hold declarations, only values.

### M15. Stray `</style>` after `</html>`
- **`public/credits.html:831`** — closing style tag after HTML close.

### M16. Conflicting `<style>` blocks in `shader_lab.html`
- **Lines 1–230 & 231–542** — cyan and red accent schemes override each other. Merge artifact.

### M17. Over 20 HTML files with near-identical CSS variable blocks
- Each repeats `--bg-root`, `--bg-panel`, `--bg-canvas`, `--accent`, `--border`, etc.
- ~500 lines of duplication. Extract to a shared stylesheet.

### M18. Entire `/projects` directory exposed via `express.static`
- **`server.js:300`** — All project files publicly readable with no auth.

### M19. Kai AI iframe overlay blocks page interaction
- **`public/quest_editor.html:235–238`, `public/item_editor.html:243–246`** — fixed full-page iframe with `z-index: 9999`.

### M20. `public/shader_editor.html` is a redirect-only page (15 lines)
- Only contains `<meta http-equiv="refresh">` to `shader_lab.html`. Should be server-side redirect.

### M21. Duplicate routes: `/profile` and `/profiles` (same handler)
- **`server/routes/saves.js:61,76`** — intentional legacy alias but confusing.

### M22. Duplicate routes: all 5 def types have both `:typeName` and `:typeName-defs` paths
- **`server/routes/gamedata.js:94–95`** — registers 10 routes instead of 5.

### M23. `ensureDir` silently swallows all errors
- **`server/routes/campaigns.js:19–23`** — `} catch (e) {}` instead of checking for `EEXIST`.

### M24. Missing `express.urlencoded()` body parser
- Only `express.json()` is configured. URL-encoded form data won't parse.

### M25. Python backend: module-level side effects on import
- **`backend/brain.py:167`** — `brain = IrabBrain()` executes at import time
- **`backend/rag.py:324–325`** — `rag = RAGSystem(PROJECT_ROOT)` triggers file I/O at import time

### M26. Python backend: unused imports and dead code
- **`backend/main.py:20`** — `hf_hub_download` imported but never called
- **`backend/main.py:1,17`** — duplicate `import os`
- **`backend/main.py:160,175`** — `import re` inside function bodies (runs on every call)

### M27. Python backend: no linting/formatting config, no tests

### M28. Python backend: `requirements.txt` has no version pins — unpinned deps risk breakage

### M29. RAG system ignores `backend/` directory — backend code never indexed

### M30. Hardcoded `http://localhost:8000` for backend URL (no config)
- **`server.js:72`** — `IRAB_BACKEND` hardcoded; no env var fallback.

### M31. `build-game.js:197` — hardcoded `http://localhost:3000/launcher.html`

### M32. `public/ai/cerebras-adapter.js:8` — hardcoded `https://api.cerebras.ai/v1`

### M33. `public/engines/unified-3d/editor/Editor3DCore.js:359` — hardcoded unpkg CDN URL for Three.js GLTFLoader

### M34. `iso_editor.js` — `new Worker('/iso_generator_worker.js')` resolves to wrong path
- **`public/iso_editor.js:1511,1529`** — worker path is `/iso_generator_worker.js` (root) but exists at `public/iso_generator_worker.js`
- **`public/iso_generator_worker.js:3`** — `importScripts('/iso_generator.js')` same issue

### M35. `public/engines/platformer-2d/tests/jump_coyote_test.html:13` — broken script src
- References `../Player.js` but file is at `entities/Player.js`.

### M36. CSS `url()` broken in FontAwesome and Monaco vendor files
- 4 broken font references for `fa-v4compatibility` (not shipped with FA)
- 2 broken Monaco codicon font references

### M37. 13 `.tsx` files — non-null assertions (`!.`)
- **`studio-ui/src/components/ShaderEditor.tsx`** — 9 occurrences
- **`studio-ui/src/components/ScriptEditor.tsx:104`** — 1 occurrence
- **`studio-ui/src/components/DialogueEditor.tsx:336,373,375`** — 3 occurrences
- Potential runtime crashes if values are null/undefined.

### M38. 25 `as any` type assertions in TypeScript files
- Type safety completely bypassed. `useStudio.ts` (6), `EnemyEditor.tsx` (4), `NPCEditor.tsx` (4), `AudioStudio.tsx` (5), `FXEditor.tsx` (1), `ScriptEditor.tsx` (2), `ShaderEditor.tsx` (2), `QuestEditor.tsx` (1).

### M39. 100+ `console.log` statements in production code
- **`server/routes/projects.js`** — 12, **`server/routes/levels.js`** — 10, **`build-game.js`** — 10, **`electron-main.js`** — 12, and many more across `public/` JS files.

### M40. 10+ files over 1500 lines — extremely difficult to maintain
| File | Lines |
|------|-------|
| `public/editors/algorithm/AlgorithmStudio.js` | 3666 |
| `public/behavior_editor.js` | 3170 |
| `public/interactive_cutscene_editor.js` | 2915 |
| `studio-ui/src/components/ShaderEditor.tsx` | 2476 |
| `public/engines/unified-3d/editor/Editor3DCore.js` | 2371 |
| `public/iso_editor.js` | 2331 |
| `public/campaign_editor.js` | 2212 |
| `public/editor.js` | 2145 |
| `public/menu_editor.js` | 1816 |
| `public/daw.js` | 1808 |
| `public/js/Studio.js` | 1575 |
| `public/engines/iso-pixel/main.js` | 1571 |
| `studio-ui/src/components/AudioStudio.tsx` | 1423 |

---

## 🟢 LOW PRIORITY

### L1. Orphaned/backup files
- `public/ai/ui/assistant-panel.html.gemini-broken`, `.old-msn-backup`, `assistant-panel-msn.html`, `assistant-panel-old-xp.html`, `assistant-panel-xp-authentic.html`

### L2. `server/routes/abilities.js` is a stub — returns empty responses

### L3. `server/routes/monitor-3d.js` — `MONITOR_MODE = 'simulated'`

### L4. `backend/holy-kai/` — orphaned directory with 5 state PNGs

### L5. `backend/chroma_db_backup/` — leftover backup directory

### L6. Lockstep backup dirs: `projects/Default Project/.engine-lockstep-backups/`

### L7. `campaigns/` is empty (real data in `data/campaigns/`)

### L8. `projects/test-project/` is mostly empty

### L9. `engine-lockstep-report.json` references project "My Awesome Game" that doesn't exist

### L10. Naming inconsistency: "RedGlitch" vs "Redglitch" across package.json, capacitor.config.ts, redglitch.json

### L11. `backend/main.py` — `async def disconnect` declared `async` but never `await`s (should be `def`)

### L12. Duplicated `PROJECT_ROOT` computation in `rag.py:324` and `main.py:67`

### L13. Python backend missing `__init__.py` — not strictly needed but good practice

### L14. Hardcoded spritesheet path ignores active project
- **`server/routes/assets.js:106,124`** — always writes to `public/sprite-art/` regardless of project

### L15. Stub code in `behavior_editor.js:2990` — `codeSnippet += \`if (/* condition */) { ...\``

### L16. `public/shader_editor.js:6` — file header says "(DEPRECATED)" but still in tree

### L17. `server/routes/logic.js:43` — DEPRECATED code path kept for legacy

### L18. `public/js/Studio.js:1144` — commented-out `// window.Studio = new IDEStudio(); // FIXME: IDEStudio is not defined`

### L19. `public/lib/blockly.min.js` — internal `require('./blockly_compressed.js')` points to missing file

### L20. `public/lib/vox-loader/index.js:3-5` — extensionless `require()` calls may fail
