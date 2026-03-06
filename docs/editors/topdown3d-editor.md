# Topdown-3D Editor Guide

## Launching

From the Ketebe dashboard, select a project with `"engineType": "topdown-3d"` and click **Open Editor**.

- **Editor files:** `public/topdown3d_editor.html` + `public/topdown3d_editor.js`
- **Output:** `projects/<ProjectName>/dunyalar/<level>.json`
- No compile step — the engine reads the JSON file directly at runtime.

---

## Panels

### 1. Terrain Panel

Controls the base geometry of the level.

| Setting | Description |
|---------|-------------|
| **Mode** | `lowpoly` — triangulated height mesh; `voxel` — block-style terrain |
| **Grid W / Grid D** | Number of cells along X and Z axes |
| **Cell Size** | World-space width of each cell in metres |
| **Elevation brush** | Left-click raises; right-click lowers; brush radius adjustable via slider |
| **Face color** | Click a palette swatch then paint triangles directly in the viewport |

The terrain elevation array stores one float per cell (`W × D`). The face color array stores two palette indices per quad (`2 × (W−1) × (D−1)`), one per triangle.

**Foliage** can be scattered by enabling the foliage tool and clicking terrain faces. Each foliage item stores `{ type, x, y, z, scale }`.

---

### 2. Entity Panel

Place and configure units on the map.

| Unit Type | Team Default | Notes |
|-----------|-------------|-------|
| `hero` | 0 (player) | Controllable unit; abilities enabled |
| `archer` | 1 (enemy) | Ranged; patrol by default |
| `grunt` | 1 (enemy) | Melee; charges on sight |
| `mage` | 1 (enemy) | Spell-casting; holds position |
| `boss` | 1 (enemy) | High HP; unique ability set |

- **Team:** `0` = player team; `1`+ = enemy teams. Units attack any unit not on their team.
- **Stats:** `hp`, `maxHp`, `speed`, `damage` editable in the inspector panel.
- **Abilities:** Click **+ Add Ability** to attach ability definitions from the project's `data/` folder.
- **Reposition:** Click and drag a unit in the viewport, or type coordinates in the inspector.

---

### 3. Lighting Panel

| Light Type | Configurable Fields |
|------------|-------------------|
| `ambient` | Color, intensity |
| `directional` | Color, intensity, position (direction vector), shadow toggle |
| `point` | Color, intensity, position, distance, decay |

Click **+ Add Light** and select a type. Multiple lights of each type are supported. Toggle **Cast Shadow** on directional lights to enable shadow maps (requires `shadowQuality: true` in `ketebe.json`).

---

### 4. Skybox Panel

| Option | Description |
|--------|-------------|
| **Gradient** | `topColor` → `bottomColor` vertical gradient rendered as a hemisphere shader |
| **Solid Color** | Single flat color fill |

---

### 5. Fog Panel

Linear fog only. Set **Near** (distance where fog begins) and **Far** (distance where fog is fully opaque). Fog color inherits the skybox bottom color by default but can be overridden.

---

### 6. Level Settings

| Setting | Field in JSON | Default |
|---------|--------------|---------|
| Gravity (m/s²) | `physics.gravity` | `[0, -9.8, 0]` |
| Physics fixed step | `physics.fixedStep` | `0.016` |
| Level ID | `id` | Derived from filename |
| Level Name | `name` | Editable |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `G` | Activate terrain **raise** brush |
| `H` | Activate terrain **lower** brush |
| `E` | Switch to **entity placement** mode |
| `Delete` | Remove the selected entity |
| `Ctrl+S` | Save level to `dunyalar/<level>.json` |
| `Ctrl+Z` | Undo last action |
| `Ctrl+Y` | Redo |
| `F` | Frame camera on selected entity |
| `Space` | Toggle between top-down and perspective camera |

---

## Exporting

Saving with `Ctrl+S` writes the level directly to `projects/<ProjectName>/dunyalar/<level>.json`. The topdown-3d engine loads this file without any intermediate compilation.

To package the game for distribution:

```bash
npm run build:game "ProjectName"
```

This copies the `dunyalar/` folder (including your level file) into `dist/game/public/dunyalar/`.
