# Ketebe Engine - Comprehensive Fix Plan

This document outlines a phased plan to resolve the logical bugs, structural flaws, and architectural inconsistencies found across the Ketebe Engine's codebase.

## Phase 1: Critical Core Crashes & Save Functionality
**Goal:** Restore fundamental saving, IDE functions, and ensure no endpoints crash on invocation.
- [ ] **GameData Saves:** Add missing `safeFs` import to `server/routes/gamedata.js`. The lack of this import crashes all definition saves (NPCs, quests, items).
- [ ] **IDE Write Mismatch:** Fix property name mismatch between `public/script_editor.js` and `server/routes/ide.js`. The frontend sends `{ file, content }` but the backend expects `{ path, content }`.
- [ ] **IDE Path Resolution:** Resolve the root directory path mismatch in `/api/ide/read`, `/api/ide/write`, and `tree`. The frontend doubling prefix (`projects/ActiveProject/projects/...`) must be fixed.
- [ ] **Missing IDE Endpoints:** Implement or properly stub `/api/ide/search` and ensure `/api/ide/terminal` is safely isolated. 

## Phase 2: Route Deduplication & Architecture
**Goal:** Clean up server routing and enforce consistent backend architecture.
- [ ] **Project Routes:** Consolidate duplicate routing logic in `server/routes/projects.js` (`POST /api/projects` vs `POST /api/projects/create`). Unify `oyuncu_profilleri` and `profiles` usage.
- [ ] **Monolithic Server.js:** Extract `/api/project-file` and `/api/save-spritesheet` out of `server.js` into their respective routers (`projects.js` and `assets.js`).
- [ ] **Level Paths:** Standardize the storage paths for levels across engines in `server/routes/levels.js` (`dunyalar/` vs `dunyalar/platformer/`).

## Phase 3: Frontend Security & Code Debt
**Goal:** Improve frontend robustness, remove unsafe evaluations, and resolve global state risks.
- [ ] **EventBus Security:** Update `public/shared/EventBus.js` to replace `postMessage('*')` with specific trusted origins (like `window.location.origin`) to prevent cross-origin scripting vulnerabilities.
- [ ] **Monaco Evaluators:** Audit the Monaco integration (`public/lib/monaco/vs/loader.min.js`) for unnecessary `eval` / `new Function` security concerns or add content security policies to isolate it.
- [ ] **DOM ID Unification:** Unify container DOM IDs (`monaco-host` vs `monaco-editor`) across `public/ide.js` and `public/script_editor.js` to ensure the editor mounts safely regardless of the wrapper HTML template.

## Phase 4: Path Handling Normalization & Asset Management
**Goal:** Standardize how the frontend and backend treat dynamic project roots.
- [ ] **AssetManager.js:** Standardize path generation heuristics to avoid manual string manipulation.
- [ ] **Server Path Guards:** Double-check all fs.write operations in routes like `campaigns.js`, `levels.js`, and `saves.js` to ensure they strictly invoke `resolveUnderRoot` or use `projectService.getProjectPath()`.

---
*Created by Gemini CLI after comprehensive logic analysis.*