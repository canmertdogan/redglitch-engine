# FPS-3D Editor Guide

## Launching

From the Vortex dashboard, select a project with `"engineType": "fps-3d"` and click **Open Editor**.

- **Editor files:** `public/fps_editor.html` + `public/fps_editor.js`
- **Output:** `projects/<ProjectName>/dunyalar/<level>.json`

---

## Panels

### 1. World Panel

Define the level's geometry source.

| Mode | When to Use |
|------|------------|
| **Procedural Room** | Quick prototyping — generates a sealed box |
| **GLTF Import** | Production — loads a `.glb` file from `assets3d/` |

**Procedural Room settings:**

| Field | Description |
|-------|-------------|
| `roomSize` | Width and depth of the box in metres |
| `roomHeight` | Ceiling height in metres |

**GLTF Import settings:**

Set `gltfUrl` to a path relative to the project root, e.g. `assets3d/level.glb`. When `gltfUrl` is present it overrides the procedural room entirely. Place `.glb` files in `assets3d/` before referencing them.

---

### 2. Enemy Panel

Spawn enemies by selecting an archetype preset, clicking a placement point in the overhead map view, then configuring properties in the inspector.

#### Enemy Archetypes

| Archetype | HP | Speed (m/s) | FOV | View Range (m) |
|-----------|-----|------------|-----|----------------|
| Guard | 80 | 2.5 | 110° | 14 |
| Sniper | 55 | 1.5 | 60° | 22 |
| Berserker | 160 | 4.5 | 180° | 10 |
| Patrol | 60 | 2.0 | 90° | 12 |

Archetypes pre-fill the `properties` object. All fields remain editable after placement:

| Property | Description |
|----------|-------------|
| `hp` / `maxHp` | Health values |
| `speed` | Movement speed |
| `viewAngle` | Sight cone (degrees) |
| `viewRange` | Maximum sight distance |
| `alertRange` | Proximity detection radius |
| `attackRange` | Strike/fire distance |
| `attackDamage` | Damage per hit |
| `attackRate` | Attacks per second |
| `paletteIndex` | Color tint from `VoxelPalette` |
| `modelUrl` | Optional GLTF model path |

**Patrol Waypoints:** With an enemy selected, click **+ Add Waypoint** then click positions in the viewport. The enemy cycles through waypoints in order. Drag waypoints to reposition.

---

### 3. Cover Points Panel

Place tactical cover anchors used by `EnemyAI` during combat.

- Click in the viewport to place a cover point marker.
- The **direction arrow** (normal) shows which direction the enemy will face while in cover. Drag the arrow tip to adjust.
- Each cover point stores `{ id, position, normal }` in the level file.

---

### 4. Triggers Panel

| Trigger Type | Description |
|-------------|-------------|
| `pickup` — `health` | Restores player HP on contact |
| `pickup` — `ammo` | Restores ammo |
| `pickup` — `weapon` | Grants a weapon |
| `levelEnd` | Ends the level / loads next level |

Click **+ Add Trigger**, select a type, then click a position in the viewport. Triggers are visualised as semi-transparent spheres in the editor.

---

### 5. Lights Panel

| Light Type | Configurable Fields |
|------------|-------------------|
| `ambient` | Color, intensity |
| `directional` | Color, intensity, position, shadow toggle |
| `point` | Color, intensity, position, distance, decay |

Point lights are most common for FPS levels. Use `distance` and `decay` to control fall-off radius.

---

### 6. Player Spawn

Drag the **spawn marker** (yellow capsule) to the desired start position in the viewport, or type exact coordinates into the inspector fields:

```
x: 0    y: 1.8    z: 0
```

The `y` value should be at floor level + half the player capsule height (default `1.8` m standing height).

---

## Testing In-Editor

Click **▶ Play** in the toolbar to launch the game in a separate window using the current unsaved level state. The game window connects back to the editor via `postMessage`, routing all `console.log` output to the editor's built-in console panel.

> The **▶ Play** preview does not auto-save. Use `Ctrl+S` to persist your changes.

---

## Exporting

Save with `Ctrl+S` to write `dunyalar/<level>.json`. Place any GLTF assets in `assets3d/` relative to the project root before referencing them via `gltfUrl`.

To package the finished game:

```bash
# All platforms
npm run build:game "ProjectName"

# Electron desktop only
npm run build:game "ProjectName" electron

# Android only
npm run build:game "ProjectName" android
```

The build process copies `assets3d/` and `dunyalar/` into `dist/game/public/` automatically.
