# Ketebe 3D Engines — Architecture & API Reference

## Overview

Ketebe ships three 3D engine types built on a shared foundation:

| Engine Type | Entry Class | Use Case |
|-------------|-------------|----------|
| `topdown-3d` | `TopDownGame` | Strategy / RTS / ARPG camera |
| `fps-3d` | `FPSGame` | First-person shooter |
| `platformer-3d` | `Platformer3DGame` | 3D platformer with physics jump |

**All three engines share:**

- **Three.js** — WebGL renderer (r158+)
- **cannon-es** — rigid-body physics
- **`MeshLambertMaterial`** — flat-shaded, palette-driven rendering
- **ES module pattern** — each engine is a self-contained `<type>/main.js` module
- **Shared modules** — common utilities live in `public/engines/shared/`

**Common `ketebe.json` keys for 3D projects:**

| Key | Type | Values |
|-----|------|--------|
| `engineType` | string | `topdown-3d` / `fps-3d` / `platformer-3d` |
| `renderQuality` | string | `low` / `medium` / `high` / `ultra` |
| `physics3D` | boolean | Enable cannon-es physics simulation |
| `shadowQuality` | boolean | Enable Three.js shadow maps |

---

## Shared Modules (`public/engines/shared/`)

| Module | Pattern | Purpose |
|--------|---------|---------|
| `Renderer3D.js` | ES module | Shared WebGL pipeline (Cel/Outline) with `.resize(w, h)` support |
| `CrossEngineSerializer.js` | Classic-script global | Serializes 3D entities and levels for campaign runtime |
| `Save3D.js` | ES module | Schema-guarded save/load for all 3D engines. Schema: `ketebe.3d.save.v3` |
| `LayerMask.js` | ES module | Bit-flag layer constants |
| `CollisionGroups.js` | ES module | cannon-es collision filter groups and masks |
| `PhysicsDebugRenderer.js` | ES module | Wireframe overlay for cannon-es bodies |
| `PaletteManager.js` | ES module | 256-color shared palette manager and mapper |

### LayerMask Flags

```js
// public/engines/shared/LayerMask.js
export const TERRAIN     = 1;
export const ENTITY      = 2;
export const PROP        = 4;
export const TRIGGER     = 8;
export const PROJECTILE  = 16;
```

---

## Save System (`Save3D.js`)

All 3D engines use `Save3D.js` for save/load. Saves are schema-versioned to prevent cross-engine corruption.

**Schema identifier:** `ketebe.3d.save.v3`

### Exports

```js
import {
  SAVE_3D_SCHEMA,
  serializeSavePayload3D,
  deserializeSavePayload3D,
  migrateSavePayload,
  serialize3DPlayerState,
  deserialize3DPlayerState,
  isSave3D,
  isSave2D,
} from '../shared/Save3D.js';
```

| Export | Signature | Description |
|--------|-----------|-------------|
| `SAVE_3D_SCHEMA` | `string` | Schema constant `'ketebe.3d.save.v3'` |
| `serializeSavePayload3D` | `(engineType, slotData) → object` | Wraps payload with schema header and engine type |
| `deserializeSavePayload3D` | `(raw, expectedEngineType) → object\|null` | Validates schema; returns `null` on mismatch or missing fields |
| `migrateSavePayload` | `(payload) → payload` | Migration chain — normalizes missing fields from older saves |
| `serialize3DPlayerState` | `(pos3, quat4, vel3, vitals) → object` | Snapshots player transform and vitals |
| `deserialize3DPlayerState` | `(obj) → { pos3, quat4, vel3, vitals }` | Restores player snapshot |
| `isSave3D` | `(raw) → boolean` | Type guard — true if payload has `ketebe.3d.save.v3` schema |
| `isSave2D` | `(raw) → boolean` | Type guard — true if payload is a legacy 2D save |

### Usage Example

```js
// Saving
const payload = serializeSavePayload3D('topdown-3d', {
  level: 'map_01',
  player: serialize3DPlayerState(pos, quat, vel, { hp: 80, mana: 40 }),
  flags: { bossDefeated: true },
});
await fetch(`/api/save/${username}/${slot}`, {
  method: 'POST',
  body: JSON.stringify(payload),
});

// Loading
const raw = await fetch(`/api/save/${username}/${slot}`).then(r => r.json());
const data = deserializeSavePayload3D(raw, 'topdown-3d');
if (!data) throw new Error('Save mismatch or corrupt');
const { pos3, quat4, vel3, vitals } = deserialize3DPlayerState(data.player);
```

---

## Topdown-3D Engine

**Entry:** `public/engines/topdown-3d/main.js`  
**Class:** `TopDownGame`  
**Camera:** Orthographic or perspective top-down; zoom controlled by scroll wheel

### Systems

| System | Responsibility |
|--------|---------------|
| `TerrainSystem3D` | Builds low-poly or voxel mesh from level elevation + palette data |
| `UnitSystem3D` | Spawns, moves, and animates hero/enemy units |
| `FogOfWar3D` | Per-cell visibility mask updated each tick |
| `PathfinderSystem3D` | A* grid pathfinding over terrain cells |
| `AbilitySystem3D` | Cooldown-tracked ability activation and projectile spawning |
| `CameraController3D` | Pan, zoom, edge-scroll with smooth lerp |
| `MiniMap3D` | Canvas-based overhead minimap |
| `UISystem3D` | Health bars, selection rings, action queue HUD |

**Strategies:** `TopDown3DStrategy` wraps `CampaignSerializer` (from `CrossEngineSerializer.js`) for campaign-mode play across linked levels.

### Level Format (`dunyalar/*.json`)

```jsonc
{
  "id": "level_id",
  "name": "Level Name",
  "engineType": "topdown-3d",

  "terrain": {
    "mode": "lowpoly",              // "lowpoly" | "voxel"
    "gridW": 24,
    "gridD": 24,
    "cellSize": 2,
    "elevation": [/* W * D floats — one per grid cell */],
    "faceColors": [/* 2 * (W-1) * (D-1) palette indices — two tris per quad */],
    "waterLevel": -0.2,
    "foliage": [
      { "type": "tree", "x": 0, "y": 0, "z": 0, "scale": 1 }
    ]
  },

  "entities": [
    {
      "id": "unit_01",
      "type": "hero",               // "hero" | "archer" | "grunt" | "mage" | "boss"
      "team": 0,                    // 0 = player team, 1+ = enemy teams
      "position": [0, 0, 0],
      "stats": { "hp": 100, "maxHp": 100, "speed": 3.5, "damage": 12 },
      "abilities": []
    }
  ],

  "lights": [
    { "type": "ambient", "color": "#ffffff", "intensity": 0.4 },
    { "type": "directional", "color": "#fffbe8", "intensity": 0.9,
      "position": [20, 40, 20], "castShadow": true }
  ],

  "skybox": {
    "type": "gradient",             // "gradient" | "color"
    "topColor": "#3a6ea5",
    "bottomColor": "#c9e4f0"
  },

  "fog": {
    "type": "linear",
    "color": "#c9e4f0",
    "near": 30,
    "far": 80
  },

  "physics": {
    "gravity": [0, -9.8, 0],
    "fixedStep": 0.016
  }
}
```

### Terrain Palette (shared `VoxelPalette`)

| Index | Name | Color |
|-------|------|-------|
| 0 | Stone | Gray |
| 1 | Dirt | Brown |
| 2 | Grass | Green |
| 3 | Sand | Tan |
| 4 | Water | Blue |
| 5 | Snow | White |

---

## FPS-3D Engine

**Entry:** `public/engines/fps-3d/main.js`  
**Class:** `FPSGame`  
**Camera:** First-person perspective locked to player capsule

### Systems

| System | Responsibility |
|--------|---------------|
| `FPSController` | Pointer-lock mouse look, WASD movement, jump, crouch |
| `WorldGeometry` | Loads GLTF level or builds procedural room box |
| `WeaponSystem` | Weapon state machine — idle, aim, fire, reload |
| `EnemyAI` | Patrol → alert → chase → attack FSM per enemy |
| `DecalSystem` | Bullet-hole and blood decal placement on surfaces |
| `RaycastSystem` | Hitscan raycasts via cannon-es + Three.js dual check |
| `HUDRenderer3D` | Health/ammo overlay rendered on a 2D canvas layer |

**World geometry priority:** `WorldGeometry` prefers `gltfUrl` when present; falls back to a procedural box using `roomSize` × `roomHeight`.

**Enemy AI:** reads `levelData.enemies[]` for spawn data and `levelData.coverPoints[]` for tactical positioning during combat.

### Level Format (`dunyalar/*.json`)

Extends the base format with FPS-specific fields:

```jsonc
{
  "id": "level_id",
  "engineType": "fps-3d",

  "playerSpawn": { "x": 0, "y": 1.8, "z": 0 },

  // Procedural room (used when gltfUrl is absent)
  "roomSize": 30,
  "roomHeight": 4,

  // GLTF import (overrides procedural room when present)
  "gltfUrl": "assets3d/level.glb",

  "enemies": [
    {
      "id": "e1",
      "position": [4, 0, -6],
      "patrol": [
        { "x": 4, "y": 0, "z": -6 },
        { "x": 4, "y": 0, "z":  6 }
      ],
      "properties": {
        "hp": 80,
        "maxHp": 80,
        "speed": 2.5,
        "viewAngle": 110,
        "viewRange": 14,
        "alertRange": 8,
        "attackRange": 2,
        "attackDamage": 12,
        "attackRate": 1.2,
        "paletteIndex": 1,
        "modelUrl": ""        // optional GLTF override
      }
    }
  ],

  "coverPoints": [
    { "id": "cp1", "position": [2, 0, -3], "normal": [0, 0, 1] }
  ],

  "triggers": [
    { "id": "t1", "type": "pickup",   "position": [0, 0.5, 0], "subtype": "health" },
    { "id": "t2", "type": "levelEnd", "position": [0, 0,  20] }
  ],

  "lights": [
    { "type": "ambient",     "color": "#303040", "intensity": 0.5 },
    { "type": "point", "color": "#ffcc88", "intensity": 1.2,
      "position": [0, 3, 0], "distance": 18, "decay": 2 }
  ],

  "physics": { "gravity": [0, -9.8, 0], "fixedStep": 0.016 }
}
```

### Enemy Properties Reference

| Property | Type | Description |
|----------|------|-------------|
| `hp` / `maxHp` | number | Current and maximum health |
| `speed` | number | Movement speed (m/s) |
| `viewAngle` | number | Field of view cone in degrees |
| `viewRange` | number | Sight distance (m) |
| `alertRange` | number | Radius for hearing/proximity detection (m) |
| `attackRange` | number | Melee/ranged attack reach (m) |
| `attackDamage` | number | Damage per hit |
| `attackRate` | number | Attacks per second |
| `paletteIndex` | number | `VoxelPalette` index for procedural model tint |
| `modelUrl` | string | Optional GLTF path relative to project root |

---

## Platformer-3D Engine

**Entry:** `public/engines/platformer-3d/main.js`  
**Class:** `Platformer3DGame`  
**Camera:** Third-person orbit rig locked behind player

### Systems

| System | Responsibility |
|--------|---------------|
| `PlatformSpawner` | Instantiates static platform meshes + cannon-es box bodies |
| `CollectibleSystem3D` | Coin/gem pickup detection; persists collected IDs via `Save3D.js` |
| `CheckpointSystem3D` | Sphere-trigger checkpoints; updates respawn position |
| `EnemyPatroller3D` | Patrol-path enemies with simple edge-reversal AI |
| `CameraRig3D` | Orbit camera with collision-aware zoom |
| `HUDPlatformer3D` | Coin counter, HP bar, checkpoint indicator |
| `VoxelPalette` | Shared 8-color palette for platform tinting |

### Level Format (`dunyalar/*.pf3d.json`) — Schema v2.0

```jsonc
{
  "_schema": "ketebe.platformer3d.level.v2.0",

  "spawnPoint": [0, 1, 0],
  "gravity": -20,
  "ambientColor": "#6080a0",

  "platforms": [
    { "position": [0, 0, 0], "size": [4, 0.5, 4], "paletteIndex": 0 }
  ],

  "collectibles": [
    { "id": "c1", "type": "coin", "position": [0, 1, 0], "value": 10, "paletteIndex": 6 }
  ],

  "checkpoints": [
    { "id": "cp1", "position": [8, 1, 0], "radius": 1.5 }
  ],

  "enemies": [
    {
      "id": "e1",
      "position": [4, 1, 0],
      "patrol": [[2, 1, 0], [6, 1, 0]],
      "speed": 1.5,
      "hp": 40
    }
  ],

  "goal": { "position": [20, 1, 0], "radius": 2 }
}
```

### Collectible Persistence

Collected item IDs are stored in the save file via `Save3D.js`. On level reload:

1. `CollectibleSystem3D.markCollected(id)` is called for each ID in the save.
2. Marked items **cannot be re-collected** (pickup trigger is disabled).
3. Items still **render** on load (cosmetic quirk by design); only interaction is disabled.

---

## Build System — 3D Projects

`npm run build:game "ProjectName"` auto-detects 3D engines from `ketebe.json`:

```js
const IS_3D_ENGINE = ['topdown-3d', 'fps-3d', 'platformer-3d']
  .includes(projectMeta.engineType);
```

**3D-specific build steps (in addition to standard steps):**

1. Copy `assets3d/` directory into `dist/game/public/assets3d/`
2. Copy `*.pal.json` palette definition files
3. Bake `.vox` → `.glb` via greedy-mesh algorithm (voxel runs merged into quads)
4. Remove raw `.vox` sources from `dist/` — players receive only baked `.glb` files

**Standard invocations:**

```bash
# All platforms
npm run build:game "My 3D Game"

# Electron only
npm run build:game "My 3D Game" electron

# Android only
npm run build:game "My 3D Game" android
```
