# MULTI-ENGINE MASTER PLAN: ONGONLUK ENGINE Expansion

**Status:** Draft
**Objective:** Introduce two new standalone game runtimes (Isometric 2.5D and 2D Platformer) alongside the existing Top-Down RPG engine, ensuring zero regression for existing projects.

---

## 1. Architectural Strategy: "Runtime Injection"

To guarantee the safety of the current engine, we will move from a monolithic `base_game` folder to a modular **Engine Repository**.

### A. Directory Restructuring
Current:
```text
public/base_game/   <-- Contains RPG logic (HARDCODED)
```

Proposed:
```text
public/
├── engines/
│   ├── rpg-topdown/       <-- (The current base_game moved here)
│   ├── iso-pixel/         <-- NEW: Isometric Runtime
│   └── platformer-2d/     <-- NEW: Platformer Runtime
├── shared/                <-- Common Utils (Audio, Input, AssetLoader)
└── index.html             <-- Smart Loader
```

### B. Smart Bootstrap (`index.html` update)
The game entry point (`index.html`) will no longer hardcode script tags. Instead, it will:
1.  Fetch `ketebe.json` (Project Metadata).
2.  Read the `engineType` field (e.g., `"rpg"`, `"iso"`, `"platformer"`).
3.  Dynamically inject the specific script bundles for that engine.

---

## 2. Engine A: "Iso-Pixel" (Half-3D Isometric)

**Goal:** Create a 2.5D engine similar to *Habbo Hotel* or *Final Fantasy Tactics*.

### Core Components
1.  **IsoMath System:**
    *   Cartesian to Isometric projection logic:
        *   `ScreenX = (MapX - MapY) * (TileW / 2)`
        *   `ScreenY = (MapX + MapY) * (TileH / 2)`
2.  **Depth Sorter (Z-Ordering):**
    *   A rendering loop that sorts all entities and tiles based on their Y screen position + Z height every frame to handle occlusion (standing behind a wall).
3.  **Heightmap Support:**
    *   Logic to handle "stacking" blocks (Z-axis).
4.  **8-Directional Movement:**
    *   Adapting input vectors to move along isometric diagonals.

### Template: `templates/iso-starter`
*   Contains `ketebe.json` with `"engineType": "iso"`.
*   Includes isometric sprite placeholders (diamond floor tiles, cube walls).

---

## 3. Engine B: "Jump-Core" (2D Platformer)

**Goal:** Create a side-scrolling engine similar to *Celeste* or *Mario*.

### Core Components
1.  **AABB Physics Engine:**
    *   Strict collision detection (Axis-Aligned Bounding Box).
    *   **Gravity:** Constant downward force.
    *   **Friction/Acceleration:** Smooth movement feel.
    *   **Jump Arc:** Variable jump height (hold button to jump higher).
2.  **Tilemap Collider:**
    *   Optimized spatial hashing for solid blocks, one-way platforms, and spikes.
3.  **State Machine:**
    *   States: `Idle`, `Run`, `Jump`, `Fall`, `WallSlide`.
4.  **Camera System:**
    *   Side-scrolling tracking with "Deadzone" (camera only moves when player pushes near edge).

### Template: `templates/platformer-starter`
*   Contains `ketebe.json` with `"engineType": "platformer"`.
*   Includes side-view sprites.

---

## 4. Development Roadmap

### Phase 1: Engine Segregation (The "Safety" Phase)
*   [ ] Refactor `public/base_game` into `public/engines/rpg-topdown`.
*   [ ] Create `public/shared` for agnostic scripts (Input, Audio).
*   [ ] Write `public/js/runtime-loader.js` to handle dynamic injection.
*   [ ] Update `build-game.js` to respect the active engine type.

### Phase 2: Isometric Engine Dev
*   [ ] Implement `IsoRenderer.js`.
*   [ ] Implement `IsoPhysics.js`.
*   [ ] Create `templates/iso-starter`.
*   [ ] Update Editor (Grid View) to support diamond grid overlay.

### Phase 3: Platformer Engine Dev
*   [ ] Implement `PlatformerPhysics.js`.
*   [ ] Implement `SideScrollCamera.js`.
*   [ ] Create `templates/platformer-starter`.
*   [ ] Update Editor to support "Solid/One-Way" tile flagging.

---

## 5. Editor Adaptation

The Studio Editor (`editor.html`) currently assumes a top-down grid. We need to make it context-aware.

*   **If Engine == ISO:**
    *   Canvas draws a diamond grid.
    *   Mouse clicks map screen coordinates to Iso coordinates.
*   **If Engine == PLATFORMER:**
    *   Standard grid.
    *   "Layer" tab allows defining collision types (Solid vs Pass-through).

---

## 6. Implementation Order

We will start with **Phase 1: Segregation** to ensure the current RPG engine is safe before writing new code.
