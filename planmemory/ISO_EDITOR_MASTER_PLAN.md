# RedGlitch IsoPixel Studio: Development Master Plan

**Goal:** Create a dedicated, professional-grade Level Editor specifically for the **IsoPixel Engine**.
**Philosophy:** "Verticality is Key." Unlike the Top-Down editor, this tool focuses on depth ($Z$), structure, and 2.5D aesthetics.

---

## 📂 1. Architecture & File Structure

We will create a clean separation from the standard editor.

```text
public/
├── iso_editor.html        # Entry point (New dedicated HTML)
├── iso_editor.js          # Main logic controller
├── styles/
│   └── iso_studio.css     # Dedicated styling (Dark/Industrial theme)
└── strategies/
    └── IsoRenderer.js     # The Core Rendering Engine (Canvas 2D)
```

## 🗓️ 2. Development Phases

### Phase 1: The IsoPixel Core (Rendering Engine)
The priority is establishing a robust "Painter's Algorithm" renderer that can handle depth correctly.
- [ ] **Coordinate System:** Implement precise Grid-to-Screen and Screen-to-Grid math (2:1 Isometric Ratio).
- [ ] **Depth Sorting:** Implement a render loop that draws tiles from `Back->Front`, `Bottom->Top` (Z-Index).
- [ ] **Asset Loader:** A specialized loader for isometric sprite sheets (where frames are often taller than they are wide).
- [ ] **Ghost/Cursor:** A 3D wireframe cursor that snaps to the grid logic ($X, Y, Z$).

### Phase 2: Voxel Interaction (The "Builder")
Tools that feel like building with blocks rather than painting pixels.
- [ ] **Z-Level Slider:** A UI slider to "slice" the world, hiding layers above the current Z to allow editing interiors.
- [ ] **Block Placement:** Logic to place tiles at specific $(X, Y, Z)$ coordinates.
- [ ] **Height Tools:**
    - `Raise Tool`: Pulls terrain up.
    - `Lower Tool`: Pushes terrain down.
    - `Flatten Tool`: Sets an area to a specific Z-height.
- [ ] **Geometry Shapes:** Support for:
    - Full Blocks
    - Half-Slabs
    - Slopes (North, South, East, West)

### Phase 3: The Studio UI
A professional "CAD-like" interface.
- [ ] **Viewport:** The main canvas (resizable, pannable, zoomable).
- [ ] **Palette Dock:** A grid of isometric tiles.
- [ ] **Properties Inspector:** To set metadata for selected blocks (e.g., "Solid", "Water", "Trigger").
- [ ] **Minimap:** A simplified top-down representation of the map for navigation.

### Phase 4: Data & Serialization
Defining the `.json` structure for Iso maps.
- [ ] **Data Schema:**
    ```json
    {
      "type": "iso-pixel",
      "width": 30,
      "height": 30,
      "layers": [
        { "z": 0, "data": [...] },
        { "z": 1, "data": [...] }
      ],
      "prefabs": [...]
    }
    ```
- [ ] **Server Integration:** Syncing with `/api/levels/` endpoints.

### Phase 5: Physics & Logic Preview
- [ ] **Collision Map Generator:** Auto-calculate walkability based on block height and slopes.
- [ ] **Fake-3D Lighting:** Calculate simple shadows based on block height (casting shadows on lower blocks).

---

## 📐 3. Technical Specifications

### Coordinate Math (Reference)
Standard 2:1 Isometric Projection:
```javascript
ScreenX = (MapX - MapY) * (TileWidth / 2)
ScreenY = (MapX + MapY) * (TileHeight / 2) - (MapZ * HeightStep)
```

### Tile Standards
- **Grid Size:** 32x16 (Standard base) or 64x32 (HD).
- **Block Sprite:** Typically 32px wide by ~48px tall (to account for the visual height of the block face).

## 🚀 4. Immediate Next Steps
1.  Scaffold `iso_editor.html` with the new layout.
2.  Create `IsoRenderer.js` with the basic grid drawing loop.
3.  Hook up the mouse listener to calculate grid coordinates.
