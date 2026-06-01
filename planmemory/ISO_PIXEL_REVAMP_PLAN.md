# IsoPixel Studio Revamp & World Transition Plan

## Objective
1.  **Feature Parity:** Port key features from the "Normal Level Editor" (Top-Down) to the "IsoPixel Studio" to bring it up to standard.
2.  **Immediate Transition:** Force the game runtime to load the IsoPixel engine/world by default instead of the Top-Down RPG engine.

## Phase 1: Immediate World Transition
**Goal:** When the user launches the game (`index.html`), it should immediately load the Isometric engine.

*   **Action:** Update `redglitch.json`.
*   **Change:** Set `"engineType": "iso-pixel"`.
*   **Verification:** Open `index.html` (or use the preview) and verify it loads the Iso engine (indicated by the specialized UI or 3D view).

## Phase 2: IsoPixel Studio Feature Porting
**Goal:** Enhance `iso_editor.html` and `iso_editor.js` with features found in `editor.html`.

### 2.1. Props Panel (The "Home" Feeling for Decorators)
The Top-Down editor has a rich "PROPS" panel with categorized buttons (Furniture, Nature, Lighting, etc.). The Iso editor currently relies on a generic "Prefabs" list.

*   **UI Update (`iso_editor.html`):**
    *   Add a new "PROPS" tab to the **Bottom Palette** (or sidebar, but Bottom Palette seems to be the new design direction for Iso).
    *   Recreate the categorized grid layout:
        *   **Nature:** Tree, Bush, Flower, Rock, Grass.
        *   **Furniture:** Table, Chair, Bed, Bookshelf.
        *   **Lighting:** Torch, Lamp, Candle.
        *   **Containers:** Chest, Barrel, Crate.
        *   **Interactive:** Sign, Switch, Lever.
*   **Logic Update (`iso_editor.js`):**
    *   Implement `selectProp(type)` logic similar to the top-down editor.
    *   Ensure these props are placed with correct Z-height awareness (Isometric placement).

### 2.2. Advanced Collision Editing
The Top-Down editor supports 8 collision types (Solid, One-Way, Trigger, etc.). Iso editor only has a simple "Collision" checkbox.

*   **UI Update (`iso_editor.html`):**
    *   Expand the "Properties" sidebar panel.
    *   Add the "COLLISION TYPES" grid (buttons 0-8) with the same color coding.
*   **Logic Update (`iso_editor.js`):**
    *   Update `map.collision` handling to store integers (0-8) instead of just booleans/binary.
    *   Update the renderer (in `IsoStrategy` or `render()`) to visualize these special collision types (e.g., drawing colored overlays on top of blocks).

### 2.3. Generator Enhancements
The Top-Down editor has "Type" (Dungeon/Village) and "Density". Iso has "Terrain Mode".

*   **UI Update (`iso_editor.html`):**
    *   Add "Seed" and "Density" inputs to the Generator section in the inspector.
*   **Logic Update (`iso_editor.js`):**
    *   Pass these new parameters to the `IsoGenerator`.

## Execution Order
1.  **Transition:** Modify `redglitch.json` immediately.
2.  **UI Port:** Copy HTML structures from `editor.html` to `iso_editor.html` (Props grid, Collision buttons).
3.  **Logic Port:** Copy/Adapt JS functions from `editor.js` to `iso_editor.js` (`selectProp`, `selectCollisionType`).
4.  **Integration:** Ensure the new UI elements trigger the ported logic correctly.
