# Session Changelog
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
