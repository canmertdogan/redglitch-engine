# LEVEL EDITOR ADAPTATION PLAN: Multi-Engine Support

**Status:** Draft
**Target:** v0.3.0
**Objective:** Transform the specific Top-Down Level Editor into a "Context-Aware" environment that adapts its grid, rendering, and tools based on the active project's engine type (`rpg-topdown`, `iso-pixel`, or `platformer-2d`).

---

## 1. Architectural Strategy

We will move away from the hardcoded rendering loops in `editor.js` and adopt a **Strategy Pattern**.

### A. The `EditorStrategy` Interface
We will define a common interface that specific editor modes must implement:
*   `render(ctx, camera)`: Draws the grid and map.
*   `screenToMap(x, y, camera)`: Converts mouse coordinates to tile coordinates.
*   `mapToScreen(x, y, z, camera)`: Converts tile coordinates to screen position.
*   `drawCursor(ctx, x, y, camera)`: Draws the selection highlight.

### B. Implementation Classes
1.  **`TopDownStrategy`** (Default): Preserves the current logic.
2.  **`IsoStrategy`**: Implements diamond grid rendering and isometric projection math.
3.  **`PlatformerStrategy`**: Similar to TopDown but adds visualization for physics layers (Solid/Pass-through/Spike).

---

## 2. Development Phases

### Phase 1: Core Refactoring (The Abstraction Layer)
*   [ ] **Analyze `editor.js`**: Identify all direct canvas drawing calls and coordinate math.
*   [ ] **Create `strategies/`**: Create a new folder for editor strategies.
*   [ ] **Extract TopDown Logic**: Move current rendering code into `TopDownStrategy.js`.
*   [ ] **Engine Detection**: Update `editor.js` initialization to fetch `ketebe.json` and instantiate the correct strategy.

### Phase 2: Isometric Mode Integration
*   [ ] **Implement `IsoStrategy.js`**:
    *   Port the `IsoRenderer` logic from the runtime engine into the editor.
    *   Implement Z-Ordering (Depth sorting) for the editor view so objects render correctly.
*   [ ] **Mouse Interaction**: Implement `unproject` logic to handle clicking on diamond tiles.
*   [ ] **UI Update**: Add a "Z-Level / Height" selector in the sidebar to allow placing blocks at different heights.

### Phase 3: Platformer Mode Integration
*   [ ] **Implement `PlatformerStrategy.js`**:
    *   Standard grid rendering.
    *   **Physics Visualization**: Render collision boxes overlay (Green=Solid, Red=Damage, Blue=OneWay).
*   [ ] **Tooling**: Add a "Physics Paint" tool to the sidebar when in Platformer mode, allowing users to paint collision properties directly onto tiles.

### Phase 4: UI Context Switching
*   [ ] **Dynamic Sidebar**: Hide/Show tools based on engine type.
    *   *Iso:* Show Height Slider.
    *   *Platformer:* Show Physics Layer toggle.
    *   *RPG:* Show "Event Trigger" tools (if specific).

---

## 3. Technical Specifics

### Data Structure Compatibility
The existing map format (`level.json`) stores 2D arrays (`layers`).
*   **Iso Impact:** We may need a sparse 3D structure or layered 2D arrays (`layer_z0`, `layer_z1`) to handle height.
    *   *Decision:* Use the existing "Layers" feature but interpret them as Z-heights in Iso mode.
*   **Platformer Impact:** We need a parallel `collisionMap` layer in the JSON.

### Editor Logic Update
```javascript
// Pseudo-code for new Editor Init
async function initEditor() {
    const config = await fetch('/api/projects/current').then(r=>r.json());
    
    if (config.engineType === 'iso-pixel') {
        this.strategy = new IsoStrategy();
    } else if (config.engineType === 'platformer-2d') {
        this.strategy = new PlatformerStrategy();
    } else {
        this.strategy = new TopDownStrategy();
    }
}

function render() {
    this.strategy.render(this.ctx, this.camera);
}
```

---

## 4. Implementation Order

1.  **Refactor:** Break `editor.js` into modular pieces.
2.  **Iso:** Enable placing tiles on a diamond grid.
3.  **Platformer:** Enable painting collision flags.
