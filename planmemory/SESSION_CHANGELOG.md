# Session Changelog
**Date:** February 16, 2026
**Summary:** Major revamp of the Platformer-2D engine, solving critical performance issues and establishing a modern architecture.

## 1. Platformer Engine Revamp (Phase 1 & 2 Complete)
- **Performance Optimization:**
    - **Replaced** the inefficient `combineWorldPixelArt` function (600+ network requests) with a pre-loaded tileset atlas strategy.
    - **Implemented** `PlatformerAssetManager.js` for centralized, efficient asset pre-loading.
- **Core Architecture:**
    - **Created** `PlatformerConfig.js` to centralize physics and game constants (gravity, speed, coyote time).
    - **Created** `Animator.js` to standardize sprite animations for all entities.
    - **Refactored** `PhysicsSystem.js` to be data-driven and handle "sub-pixel locking" for moving platforms (fixing jitter).
- **New Features:**
    - **Parallax Backgrounds:** Implemented `ParallaxSystem.js` for multi-layered background scrolling.
    - **Atmospheric Lighting:** Added a soft-lighting pass to `renderer.js`, supporting player and enemy light sources.
    - **Procedural Generation:** Integrated `SmartGenerator.js` into the core loop with a "Regenerate" hotkey (G).
    - **AI:** Added a dedicated `Enemy.js` class with `Patrol` and `Chase` behaviors.
    - **Drop-Through Platforms:** Implemented logic for dropping through one-way platforms (Down + Jump).
- **Bug Fixes:**
    - **Fixed** `TypeError: window.ParallaxSystem is not a constructor` by correcting script loading order in `campaign_runtime.html` and project-specific `runtime-loader.js` files.
    - **Fixed** asset paths in `PlatformerAssetManager` to work across different hosting contexts.

## 2. Documentation
- **`PLATFORMER_IMPROVEMENT_PLAN.md`**: Updated with completed tasks.
- **`PLATFORMER_NEXT_LEVEL_PLAN.md`**: Created a comprehensive roadmap for the next phase of development (Advanced Mobility, Combat, Visuals 2.0).

---

**Date:** February 7, 2026
**Summary:** Critical engine fixes, UI redesigns for IsoPixel Studio, and rendering enhancements.

## 1. Core System Fixes
- **`public/shared/EventBus.js`**: 
    - **Fix:** Added `Blob` to text conversion in WebSocket handler to prevent `SyntaxError` crashes on binary data.
- **`public/shared/AssetManager.js`**: 
    - **Fix:** Added path sanitization in `registerAsset` to strip `projects/Name/` prefixes, resolving 404 errors for project assets.
- **`public/script_editor.js`**:
    - **Fix:** Corrected regex syntax error in `renderTabs`.
    - **Fix:** Added `loadProjectInfo` and path stripping in `openFile` to fix "File Not Found" errors in Code Forge.

## 2. IsoPixel Studio (Editor)
- **`public/iso_editor.html`**:
    - **UI:** Redesigned "WORLDS", "PREFABS", and "NPCs" tabs using a responsive `.asset-grid` and dark `.asset-card` style.
    - **UI:** Fixed squashed buttons in bottom panels by forcing `width: auto`.
    - **Font:** Applied `VT323` font to all new UI elements and "Collision Types" buttons.
    - **Cache:** Added `?v=4` to script tag to force reload.
- **`public/iso_editor.js`**:
    - **Feature:** Added `loadNPCs`, `selectNPC`, and `paint` logic for placing NPCs.
    - **Feature:** Added `deleteWorld` function and UI button.
    - **Fix:** Disabled `imageSmoothingEnabled` in `resize`, `initFXSystems`, and `combineWorldPixelArt` for crisp pixel art.
    - **Update:** Updated list rendering to use the new card layout.

## 3. Engine Rendering & Logic (IsoPixel)
- **`public/strategies/IsoStrategy.js`**:
    - **Fix:** Removed occlusion culling (`if (z < occlusionZ)`) to fix invisible blocks when stacking.
    - **Fix:** Explicitly disabled `imageSmoothingEnabled` in `render` loop.
    - **Feature:** Updated `drawObject` to render actual sprites (Tree, NPC, etc.) instead of text placeholders.
- **`public/engines/iso-pixel/main.js`**:
    - **Fix:** Updated `init` to load the full `window.SPRITES` registry into the game instance.
    - **Feature:** Enabled time progression (`timeSpeed = 0.1`) for dynamic day/night cycles.
- **`public/engines/iso-pixel/fxSystem.js`**:
    - **Feature:** Added `timeSpeed` property and update logic to `IsoFXSystem` to drive the day/night cycle.

## 4. Assets
- **`public/engines/rpg-topdown/sprites.js`**:
    - **New:** Auto-generated pixel art definitions for `tree`, `bush`, `rock`, `chest`, `npc`, `lamp`.

## 5. Documentation
- **`ENGINE_ARCHITECTURE.md`**: Created detailed architectural overview of the three engines.
