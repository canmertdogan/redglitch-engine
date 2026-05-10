# FPS3D Demo

A demo project for the **fps-3d** engine — a first-person shooter runtime built on Three.js + cannon-es with AI-driven enemies and a weapon system.

## What's in this demo

- **Procedural room** — 30×30 unit floor, 4-unit ceiling height, automatically generated collision mesh and flat-shaded walls.
- **4 enemies** with distinct archetypes:
  - **Guard ×2** — balanced patrol units (HP 80, mid-range view cone, patrol routes)
  - **Sniper ×1** — long-range, narrow FOV, high damage (HP 55, range 22, damage 28)
  - **Berserker ×1** — close-range tank (HP 160, 180° FOV, charge speed 4.5)
- **4 cover points** for enemy tactical cover use.
- **Pickup triggers** — a health pack (+50 HP) and an ammo crate (+30 pistol rounds.
- **Level-end trigger** in the far corner.
- **Dramatic lighting** — dim ambient, warm directional sun, a green point accent above center, a red point near the sniper corner.

## Level file

`dunyalar/demo_level.json`

### Key sections

| Key | Description |
|-----|-------------|
| `roomSize` | Procedural room side length (metres) |
| `roomHeight` | Ceiling height (metres) |
| `enemies[]` | Enemy spawn defs — `position`, `patrol[]`, `properties` (hp, speed, viewAngle, viewRange, etc.) |
| `coverPoints[]` | `{id, position[3], normal[3]}` — used by enemy cover-seeking AI |
| `triggers[]` | Pickup and level-end zones |
| `lights[]` | Scene lighting (ambient, directional, point) |

### Enemy `properties` keys

| Property | Description |
|----------|-------------|
| `hp` / `maxHp` | Health |
| `speed` | Movement speed m/s |
| `viewAngle` | Half-cone FOV in degrees |
| `viewRange` | Max detection distance |
| `alertRange` | Proximity auto-detect range |
| `attackRange` | Melee/ranged attack reach |
| `attackDamage` | Damage per hit |
| `attackRate` | Attacks per second |
| `paletteIndex` | Box mesh color (0–7 from shared palette) |

## Engine configuration

`ketebe.json` — engine: `fps-3d`, quality: `medium`, `physics3D: true`, `shadowQuality: true`.

## Customizing

- Open **FPS Editor** from the Ketebe launcher to place enemies, triggers, and cover points visually.
- Replace the procedural room with a custom GLTF model by adding `"gltfUrl": "assets3d/level.glb"` to the level file — the engine loads it automatically if the key is present.
- Add more weapon pickups in `triggers[]` with `"type": "pickup", "pickupType": "weapon"`.
