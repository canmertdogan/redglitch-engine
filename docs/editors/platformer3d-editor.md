# Platformer-3D Editor Guide

## Launching

From the Ketebe dashboard, select a project with `"engineType": "platformer-3d"` and click **Open Editor**.

- **Editor files:** `public/platformer3d_editor.html` + `public/platformer3d_editor.js`
- **Output:** `projects/<ProjectName>/dunyalar/<level>.pf3d.json` (schema v2.0)
- The editor **auto-saves on every change** — no manual save required during editing.

---

## Panels

### 1. Platforms Panel

Add platforms by clicking in the 3D viewport. Each platform becomes a static `BoxGeometry` mesh with a matching cannon-es box body.

| Inspector Field | Description |
|----------------|-------------|
| **Position** `[x, y, z]` | World-space centre of the platform |
| **Size** `[w, h, d]` | Dimensions in metres |
| **Palette Index** | Color (0–7); see palette table below |

Resize handles appear on the selected platform. Drag a face handle to adjust width, height, or depth. Hold `Shift` while dragging to snap to 0.5 m increments.

---

### 2. Collectibles Panel

Place pickups that the player can collect. Each collectible stores an **ID** that is persisted in the save file to prevent double-counting on reload.

| Field | Description |
|-------|-------------|
| **Type** | `coin` or `gem` |
| **Value** | Score / currency amount awarded on pickup |
| **Palette Index** | Visual color tint |

> Collected item IDs are written to the save via `Save3D.js`. On level reload, `CollectibleSystem3D.markCollected(id)` disables the pickup trigger for each saved ID. Items still **render** on load (cosmetic design choice) but cannot be re-collected.

---

### 3. Checkpoints Panel

Checkpoint spheres update the player's respawn position on contact.

| Field | Description |
|-------|-------------|
| **Position** `[x, y, z]` | Centre of the checkpoint trigger sphere |
| **Radius** | Detection radius in metres (default `1.5`) |

Active checkpoints glow in the viewport. The most recently activated checkpoint is highlighted in the HUD.

---

### 4. Enemies Panel

Place patrol enemies. Each enemy walks between waypoints and reverses direction at path ends.

| Field | Description |
|-------|-------------|
| **Position** | Initial spawn position |
| **Patrol path** | Click **+ Waypoint** then click positions in the viewport |
| **Speed** (m/s) | Movement speed along the patrol path |
| **HP** | Health points (contact damages the player) |

The patrol array in the level file stores `[x, y, z]` triples:

```jsonc
"patrol": [[2, 1, 0], [6, 1, 0]]
```

---

### 5. Goal Zone Panel

Drag the **goal flag** marker to the level exit position, or type coordinates directly. Reaching the goal triggers level completion.

| Field | Description |
|-------|-------------|
| **Position** `[x, y, z]` | Centre of the goal trigger sphere |
| **Radius** | Detection radius in metres (default `2`) |

---

### 6. Level Settings

| Setting | JSON Field | Default |
|---------|-----------|---------|
| Spawn point | `spawnPoint` | `[0, 1, 0]` |
| Gravity (m/s²) | `gravity` | `-20` |
| Ambient light color | `ambientColor` | `#6080a0` |

---

## Palette Reference

Used by platforms, collectibles, and enemy tinting.

| Index | Color Name | Hex |
|-------|-----------|-----|
| 0 | Stone | `#808080` |
| 1 | Wood | `#8B5E3C` |
| 2 | Grass | `#4CAF50` |
| 3 | Lava | `#FF5722` |
| 4 | Water | `#2196F3` |
| 5 | Snow | `#E0F0FF` |
| 6 | Sand | `#F5DEB3` |
| 7 | Metal | `#B0BEC5` |

All colors use `MeshLambertMaterial` (flat-shaded). No textures — all visual variety comes from palette selection and geometry composition.

---

## Save & Load In-Editor

The editor auto-saves the level to `.pf3d.json` on every change (debounced 500 ms). There is no dirty-state indicator — the file on disk is always current.

**File menu actions:**

| Action | Description |
|--------|-------------|
| **File → New Level** | Clears the viewport and resets to a blank level with one starter platform |
| **File → Open Level** | Loads an existing `.pf3d.json` from `dunyalar/` |
| **File → Duplicate Level** | Copies current level to a new filename |

---

## Level File Example

Minimal valid `.pf3d.json`:

```jsonc
{
  "_schema": "ketebe.platformer3d.level.v2.0",
  "spawnPoint": [0, 1, 0],
  "gravity": -20,
  "ambientColor": "#6080a0",
  "platforms": [
    { "position": [0, 0, 0], "size": [6, 0.5, 6], "paletteIndex": 2 }
  ],
  "collectibles": [],
  "checkpoints": [],
  "enemies": [],
  "goal": { "position": [10, 1, 0], "radius": 2 }
}
```

---

## Exporting / Publishing

Run from the project root to package for all platforms:

```bash
npm run build:game "Platformer3D Demo"
```

Platform-specific builds:

```bash
npm run build:game "Platformer3D Demo" electron   # Windows desktop
npm run build:game "Platformer3D Demo" android    # Android via Capacitor
```

The build copies `dunyalar/*.pf3d.json` and bakes any `.vox` assets into `.glb` files. Raw `.vox` sources are excluded from the distribution package.
