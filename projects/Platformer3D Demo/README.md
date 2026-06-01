# Platformer3D Demo

A demo project for the **platformer-3d** engine — a third-person 3D platformer runtime built on Three.js + cannon-es with a low-poly voxel aesthetic.

## What's in this demo

- **5 platforms** ranging from a wide starting pad to precision jump islands.
- **Collectible coins** — 5 coins scattered across platforms; progress tracked across save/load.
- **2 checkpoints** — respawn points mid-level.
- **3 enemies** — slow patrol enemies on platforms 2 and 3.
- **Goal zone** — collected all coins + reach the end pad to complete the level.
- **Voxel palette** — 8-color shared palette (grass, stone, wood, lava, water, snow, sand, metal).

## Level file

`dunyalar/level01.pf3d.json` — schema version 2.0

### Key sections

| Key | Description |
|-----|-------------|
| `platforms[]` | Each with `position`, `size`, and `paletteIndex` |
| `collectibles[]` | Coins — `{id, type, position, value, paletteIndex}` |
| `checkpoints[]` | `{id, position, radius}` — activates on first contact |
| `enemies[]` | Patrol defs — `{id, position, patrol[], speed, hp}` |
| `goal` | `{position, radius}` — level-completion trigger |
| `spawnPoint` | Player start position |
| `gravity` | World gravity (default −20) |
| `ambientColor` | Hex colour for ambient light |

## Save system

The platformer-3d engine uses **Save3D** (`public/engines/shared/Save3D.js`) for schema-isolated save files:

- Saves include collected coin IDs so re-loaded levels skip already-picked-up coins.
- Checkpoint progress is preserved across sessions.
- Schema key: `redglitch.3d.save.v3` — incompatible with 2D engine saves (gracefully ignored).

## Engine configuration

`redglitch.json` — engine: `platformer-3d`, quality: `medium`, `physics3D: true`, `shadowQuality: true`.

## Customizing

- Open **Platformer3D Editor** from the RedGlitch launcher to build levels visually.
- Add a new level by creating a `dunyalar/<name>.pf3d.json` and updating `startLevel` in `redglitch.json`.
- Extend the palette by editing `"palette"` in `redglitch.json` and the shared palette asset at `public/engines/platformer-3d/palette.js`.
