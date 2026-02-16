# UI System & Studio Master Plan
**Goal:** Create a robust, data-driven UI architecture where the "Studio" (Editor) and "Runtime" (Game) share the exact same rendering logic, eliminating WYSIWYG bugs and "hardcoded" limitations.

---

## 1. The Core Problem
Currently, **logic is duplicated**.
*   **Runtime (`main.js`):** Reads `ui.json` -> Manually creates DOM elements.
*   **Studio (`menu_editor.js`):** Reads `ui.json` -> Manually creates *different* DOM elements to simulate the look.

**Consequence:**
*   If you change a button style in the game engine, the Studio doesn't see it.
*   The Studio might show a layout that looks perfect, but it breaks in the game (or vice versa).
*   Special logic (like "Inventory Grid") is hardcoded in `main.js`, so the Studio just shows an empty box.

---

## 2. Solution Architecture: The "Shared Renderer"
We will extract the rendering logic into a standalone module that both the Game and the Editor import.

### A. The `UIRenderer` Class
*   **Responsibility:** specific stateless function: `render(jsonData, parentContainer)`.
*   **Location:** `public/base_game/ui/uiRenderer.js`.
*   **Usage:**
    *   **Game:** `uiSystem.js` calls `renderer.render(screenData, gameContainer)`.
    *   **Editor:** `menu_editor.js` calls `renderer.render(screenData, editorCanvas)`.

### B. Component-Based Design
Instead of a giant `if (type === 'button') ... else if ...`, we will have a registry.
```javascript
const ComponentRegistry = {
    'button': ButtonComponent,
    'label': LabelComponent,
    'panel': PanelComponent,
    'inventory_grid': InventoryGridComponent // Custom logic encapsulated!
};
```
*   **Benefit:** The Editor can automatically list all available components.
*   **Benefit:** "Inventory Grid" can implement a `renderPreview()` method so the Editor shows a mock grid instead of nothing.

---

## 3. Implementation Roadmap

### Phase 1: Decoupling (Refactor)
*   [ ] **Extract:** Move `UISystem` class from `main.js` to `public/base_game/ui/uiSystem.js`.
*   [ ] **Create Renderer:** Build `public/base_game/ui/uiRenderer.js` containing the DOM creation logic currently in `main.js`.
*   [ ] **Integrate:** Update `main.js` to import and use the new file.

### Phase 2: Unifying the Studio
*   [ ] **Import Renderer:** Update `menu_editor.html` to include `uiRenderer.js`.
*   [ ] **Replace Logic:** Delete the `createElementDOM` function in `menu_editor.js` and use `UIRenderer.create(elementData)` instead.
*   **Result:** The Editor now uses the *exact same code* as the game to draw elements. 100% WYSIWYG.

### Phase 3: Advanced Features (The "Polish")
*   [ ] **Script Registry:** Instead of hardcoded strings ("start_game"), create a `GameActions` object. The Editor can read `Object.keys(GameActions)` to populate a dropdown menu for button clicks.
*   [ ] **Live Data Binding:** Allow labels to bind to variables (e.g., `{HP} / {MAX_HP}`) using a standardized syntax, which the Renderer handles automatically.
*   [ ] **Responsive Layouts:** Add simple anchors (Top-Left, Center, Stretch) to the `rect` data in `ui.json`, allowing the UI to adapt to different aspect ratios properly.

---

## 4. Immediate Action Plan (Next Steps)
1.  **Create `public/base_game/ui/` folder.**
2.  **Create `uiRenderer.js`** and move the element creation logic there.
3.  **Refactor `menu_editor.js`** to use this new renderer immediately.

This will fix the "buggy connection" by ensuring there is only **one truth** for how UI is drawn.
