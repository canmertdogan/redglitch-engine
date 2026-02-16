# Ketebe IsoPixel Studio: Phase 2 Development Plan

**Goal:** Elevate the IsoPixel Editor from a "block placer" to a "Voxel Architecture Suite".
**Focus:** Advanced Geometry, Smart Prefabs, and Physics Integration.

---

## 🏗️ 1. Advanced Geometry & Voxel Tools

The current block placement is basic. We need tools for complex structures.

- [ ] **Smart Slopes & Slabs:**
    - Implement a UI popup (or keybind cycle) to choose block sub-types:
        - `Full Cube` (Default)
        - `Slab` (Half-height)
        - `Slope North/South/East/West`
    - Update `IsoRenderer` to draw these shapes correctly (using the sprite sheet or procedural geometry).
- [ ] **Box/Fill Tool (3D):**
    - Drag to create a volume of blocks $(X, Y, Z)$ at once.
    - "Hollow" option to create rooms instantly.
- [ ] **Selection Tool:**
    - Select a 3D region of blocks.
    - Copy/Paste selections (including Z-height data).
    - "Move" selection (nudge blocks in 3D space).

## 🧩 2. The Prefab & Prop System

Building everything block-by-block is slow. We need reusable assets.

- [ ] **Prefab Manager Integration:**
    - Port the `loadPrefabs` logic from the main editor.
    - Create a "Smart Placement" mode where prefabs snap to the grid and align with the current Z-plane.
- [ ] **Isometric Prop Rendering:**
    - Props (tables, torches, chests) are 2D sprites.
    - Implement "Billboarding" logic: Props should always face the camera or have 4-directional sprites (N, S, E, W).
- [ ] **Multi-Tile Objects:**
    - Support for large objects (e.g., a 2x2x2 Tree) that occupy multiple grid cells but render as one sprite.

## 💡 3. Lighting & Atmosphere

2.5D games live or die by their lighting.

- [ ] **Height-Based Ambient Occlusion (AO):**
    - Blocks below other blocks should be slightly darker.
    - Corner shadows for depth perception.
- [ ] **Dynamic Light Sources:**
    - Place "Light Emitters" (Torches, Lamps).
    - Implement a simple "flood fill lighting" algorithm that colors nearby block faces.
- [ ] **Day/Night Cycle Preview:**
    - A slider to scrub through time, shifting the global tint (Golden hour, Blue night).

## 🤖 4. Physics & Navigation Data

The map needs to be playable, not just pretty.

- [ ] **Collision Map Generator v2:**
    - Auto-generate collision data based on block height.
    - Falling off edges: Mark "Void" zones automatically.
- [ ] **NavMesh / Waypoints:**
    - Tool to place AI patrol points.
    - Visual connection lines showing where enemies can walk.
- [ ] **Trigger Volumes (3D):**
    - Place invisible cubes that trigger events (e.g., "Enter Zone", "Fall Damage").

## 🖥️ 5. UI/UX Polish

- [ ] **Minimap:** A top-down 2D view in the corner for easy navigation of large maps.
- [ ] **Keyboard Shortcuts:**
    - `Q/E`: Change Z-Level.
    - `R`: Rotate current block/prefab.
    - `Space`: Pan.
    - `1-9`: Hotkey palette selection.

---

## 🚀 Immediate Next Actions
1.  Implement **Slope & Slab rendering** in `IsoStrategy.js`.
2.  Add **Keyboard Shortcuts** for Z-level traversal (`Q` / `E`).
3.  Integrate the **Prefab Loader** into `iso_editor.js`.
