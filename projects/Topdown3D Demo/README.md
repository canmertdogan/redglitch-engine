# Topdown3D Demo

A demo project showcasing the **topdown-3d** engine — a real-time strategy / tactical RPG runtime built on Three.js and cannon-es.

## What's in this demo

- **Low-poly procedural terrain** — 24×24 grid, 2-unit cells, elevation-mapped with gradient face colors (grass → snow cap), a water depression, and 12 scattered foliage trees.
- **7 units** — 3 player-team heroes (1 hero + 2 archers) versus 4 enemy units (3 grunts + 1 archer).
- **Ability system** — hero can cast `fireball` (3s cooldown) and `heal_self` (8s cooldown); archers use `arrow_shot` (1.5–2s cooldown).
- **Atmospheric lighting** — ambient fill, a warm directional sun with shadow casting, horizon-to-sky gradient skybox, and linear fog.
- **Physics** — cannon-es gravity at −9.8 m/s².

## Level file

`dunyalar/demo_level_01.json` — format version 1.0

### Key sections

| Key | Description |
|-----|-------------|
| `terrain` | Low-poly heightfield; `elevation[576]` + `faceColors[1058]` (2 tris/cell), 5-color palette |
| `entities[]` | Unit definitions with `stats`, `abilities`, `team`, and spawn `position` |
| `lights[]` | `ambient` + `directional` (shadow-casting) |
| `skybox` | `{ type: "gradient", topColor, bottomColor }` |
| `fog` | `{ type: "linear", near: 30, far: 80 }` |
| `physics` | Gravity, fixed step, solver iterations |

### Terrain palette indices

| Index | Color |
|-------|-------|
| 2 | Grass green |
| 3 | Sandy dirt |
| 4 | Water blue |
| 5 | Snow white |

## Engine configuration

`ketebe.json` — engine: `topdown-3d`, quality: `medium`, `physics3D: true`, `shadowQuality: true`.

## Customizing

- Edit `dunyalar/demo_level_01.json` directly, or use **Topdown3D Editor** from the Vortex launcher.
- Add new unit types by extending `entities[]` with a matching `type` registered in the engine's unit registry.
- Swap terrain to `mode: "voxel"` and provide `chunks[]` for a Minecraft-style world.
