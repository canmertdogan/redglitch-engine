# PLATFORMER ENGINE MASTER PLAN

**Status:** Active Development
**Goal:** Create a robust, feature-rich 2D platformer runtime (`platformer-2d`) compatible with the Vortex ecosystem.

---

## 1. Core Architecture

### Directory Structure
```text
public/engines/platformer-2d/
├── main.js         # Game Loop, State Management, Level Loading
├── physics.js      # AABB Collision, Gravity, Velocity resolution
├── renderer.js     # Sprite rendering, Tilemap drawing, Camera
└── entities.js     # Player, Enemies, Collectibles classes
```

### Key Systems
1.  **Game Loop**: Fixed timestep for physics (60hz), variable timestep for rendering.
2.  **Input Handler**: Re-use `engines/rpg-topdown/input.js` if possible, or adapt for specific platformer needs (Jump buffering, Coyote time).
3.  **Runtime Loader**: Already integrated via `public/js/runtime-loader.js`.

---

## 2. Physics Engine (`physics.js`)

**Current Status:** Basic AABB.
**Upgrades Needed:**
*   [ ] **Sub-pixel Movement**: Use floats for position, round for rendering.
*   [ ] **Collision Resolution**: Separate X and Y axis resolution to prevent getting stuck.
*   [ ] **One-Way Platforms**: Jump through from bottom, stand on top.
*   [ ] **Slopes (Optional/Phase 2)**: 45-degree tile handling.
*   [ ] **Fluid Controls**:
    *   **Coyote Time**: Allow jumping shortly after leaving a ledge.
    *   **Jump Buffering**: Register jump inputs slightly before hitting the ground.
    *   **Variable Jump Height**: Release button to cut jump short.

---

## 3. Rendering System (`renderer.js`)

**Current Status:** `fillRect` debug rendering.
**Upgrades Needed:**
*   [ ] **Tile Rendering**:
    *   Load `tileset` image from level data.
    *   Render visible tiles only (culling).
    *   Support multiple layers (Background, Foreground, Collision).
*   [ ] **Sprite Rendering**:
    *   Support spritesheets for Player/Enemies.
    *   Animations: Idle, Run, Jump, Fall, Attack.
*   [ ] **Camera**:
    *   Smooth follow with "Deadzone" (player moves freely in center).
    *   Look-ahead (camera shifts in direction of movement).
    *   Map bounds clamping.

---

## 4. Entity System (`entities.js`)

**Player:**
*   States: `Idle`, `Run`, `Jump`, `Fall`.
*   Attributes: HP, Lives, Coins (Score).

**Enemies:**
*   **Walker**: Patrols a platform, turns at edges.
*   **Flyer**: Bobs up and down or chases player.
*   **Shooter**: Static turret.

**Interactables:**
*   **Coins/Gems**: Pickup for score.
*   **Spikes**: Instant kill or damage.
*   **Checkpoints**: Save spawn position.
*   **Goal/Flag**: End level.

---

## 5. Level Format & Editor Integration

**Format:**
Re-use standard Vortex JSON map format, but interpret layers differently:
*   **Layer 0 (Background)**: Decorative, non-colliding.
*   **Layer 1 (Collision)**: Solid blocks.
    *   *Convention:* Tile ID 1 = Solid, Tile ID 2 = One-Way, Tile ID 3 = Spike.
*   **Layer 2 (Foreground)**: Decorative, in front of player.

**Editor Adaptation:**
*   The generic editor can be used. We just need to define a "Platformer Tileset" where specific tiles act as collision markers.

---

## 6. Implementation Steps

1.  **Refactor `main.js`**: Split rendering loop and logic.
2.  **Enhance `physics.js`**: Implement "Fluid Controls" features (Coyote/Buffer).
3.  **Implement `renderer.js`**: Switch from `fillRect` to `drawImage` with tileset support.
4.  **Create `entities.js`**: Define Player class with state machine.
5.  **Level Design**: Create `level1.json` with platformer-specific layout.

---

## 7. Immediate Next Task
Implement `renderer.js` to handle Tilemap rendering from a spritesheet instead of green squares.
