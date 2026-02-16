# UI Studio 2.0: The "Pixel-Perfect" Revamp

**Objective:** Transform the current basic `menu_editor.html` into a professional, fully functional WYSIWYG interface builder that matches the "ONGONLUK ENGINE" (Deep Navy/Gold/Pixel) aesthetic and provides robust tools for game UI creation.

## 1. Aesthetic Overhaul ("The Neural Deck")
*   **Theme:** Adopt the dark, high-contrast theme used in the new AI Assistant (`#050510` bg, `#f1c40f` accent).
*   **Typography:** Strict `VT323` usage for all labels and inputs.
*   **Layout:**
    *   **Left Sidebar (The Toolbox):** A categorized palette of widgets (Buttons, Labels, Bars, Panels).
    *   **Center (The Canvas):** A scalable, pan-able workspace showing the 800x450 game viewport.
    *   **Right Sidebar (The Inspector):** A property grid for editing the selected element's data (Position, Size, Style, Logic).
*   **Visual Feedback:** Selection outlines, resize handles, and snap guides should be pixel-crisp and highly visible.

## 2. Core Functionality Repairs
*   **Selection & Dragging:**
    *   Fix the "click-through" issues where text blocks dragging.
    *   Implement multi-selection (Shift+Click).
    *   Implement "Marquee Select" (Drag box to select multiple).
*   **Resizing:**
    *   Ensure resize handles work on all 4 corners and edges, not just bottom-right.
    *   Add aspect-ratio locking (Shift+Resize).
*   **Snapping:**
    *   Enhance the grid snapping to be visual (show grid lines).
    *   Add "Snap to Element" (alignment guides).

## 3. New Features
*   **Data Binding UI:** A dedicated dropdown in the Inspector to bind UI elements to game variables (e.g., bind a Bar to `player.hp` without writing JSON).
*   **Asset Browser Integration:** Drag and drop images from the Asset Manager directly onto the canvas to create Image Widgets.
*   **Prefab Components:** Save a group of elements (e.g., a "Inventory Slot" made of a panel + icon + label) as a reusable Prefab.
*   **Layers Panel:** A Photoshop-style layers list to reorder Z-index easily.
*   **Preview Mode:** A "Play" button to simulate the UI interactivity (hover states, clicks) without launching the full game.

## 4. Technical Roadmap

### Phase 1: The Visual & Interaction Fix (Immediate)
*   **Goal:** Make it look good and feel good to move things.
*   **Tasks:**
    1.  Rewrite `menu_editor.html` CSS to match the AI Studio's "Cyber-Deck" style.
    2.  Refactor `menu_editor.js` drag logic to be more robust (using delta vectors properly).
    3.  Fix the CSS selector bug preventing selection highlights (Already partially done, but needs polish).

### Phase 2: The Inspector Upgrade
*   **Goal:** Make editing easy.
*   **Tasks:**
    1.  Create a dynamic property grid generator that supports Color Pickers, Image Selectors, and Dropdowns.
    2.  Add a "Style" tab vs "Logic" tab (separate visual props from script hooks).

### Phase 3: Advanced Features
*   **Goal:** Power user tools.
*   **Tasks:**
    1.  Implement the Layers Panel.
    2.  Implement the Asset Drag-and-Drop integration.

---
**Approval:** Shall we proceed with **Phase 1** to get the editor looking professional and working smoothly?
