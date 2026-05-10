# Ketebe Engine - Legacy Code Extraction & Entry-Point Audit (Phase 4)

This plan focuses on separating legacy RPG engine logic from shared core systems and cleaning up the main entry points (index.html, dashboard.html).

## Phase 13: Core Logic Extraction
**Goal:** Decouple the RPG-TopDown engine from shared global systems.
- [ ] **Extract LoggerHook:** Move the `console.log` interceptor from `rpg-topdown/main.js` to `public/shared/LoggerHook.js`.
- [ ] **Extract LogicSystem:** Move `LogicSystem` and related classes to `public/shared/LogicSystem.js`.
- [ ] **Extract AtmosphereSystem:** Move `AtmosphereSystem` to `public/shared/AtmosphereSystem.js`.
- [ ] **Extract UISystem:** Move `UISystem` and `UIRenderer` to `public/shared/UISystem.js` and `public/shared/UIRenderer.js`.
- [ ] **Update RPG Core:** Refactor `engines/rpg-topdown/main.js` to be a lean engine core that expects shared systems to be pre-loaded.

## Phase 14: Entry-Point Cleanup & Optimization
**Goal:** Remove redundant code and separate Launcher UI from Game Runtime.
- [ ] **Blackhole Module:** Extract the Three.js Blackhole Cinematic logic into `public/js/BlackholeBackground.js` to remove massive duplication between `index.html` and `dashboard.html`.
- [ ] **Launcher Logic:** Move login and main menu transition logic from `index.html` to `public/js/Launcher.js`.
- [ ] **Clean index.html:** Remove embedded `<script>` and `<style>` blocks. Ensure it only contains the high-level DOM structure for the game runtime.

## Phase 15: Runtime Loader Refactoring
**Goal:** Fix the "mixing" of engines during the boot sequence.
- [ ] **Standardized Manifests:** Update `public/js/runtime-loader.js` to load the new `public/shared/` systems for ALL engines.
- [ ] **Engine Isolation:** Ensure non-RPG engines (iso-pixel, platformer-2d) NO LONGER load `engines/rpg-topdown/main.js`.
- [ ] **Asset Preloading:** Implement a more robust preloading sequence in `runtime-loader.js` that checks for required shared systems before booting the engine.

---
*Created by Gemini CLI after identifying legacy code mixing and duplication.*