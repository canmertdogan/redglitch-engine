# Platformer Engine Revamp & Fix Plan

## 1. Problem Statement
The current Platformer Engine (`platformer-2d`) has several rendering and architectural issues:
- **Fragile Tileset Loading:** The `WORLD_PIXEL_ART` combining logic is slow and prone to failure.
- **Missing Decorations:** Decorative tiles and prefabs defined in `map.decorations` are not rendered.
- **Brittle Layer Logic:** The renderer assumes a specific structure for `map.layers` and fails if it deviates.
- **Incomplete Collision Support:** Physics system is missing logic for some collision types (5-8).
- **Static Backgrounds:** No support for parallax or multi-layer backgrounds.
- **Lack of Foreground:** No way to render tiles in front of the player.

## 2. Proposed Fixes

### 2.1 Renderer Overhaul (`renderer.js`)
- [ ] **Unified Layer Rendering:** Support both simple arrays and object-based layers.
- [ ] **Foreground Support:** Split rendering into Background, Main, and Foreground passes.
- [ ] **Decoration Pass:** Render `map.decorations` (including prefabs).
- [ ] **Parallax System:** Implement simple background parallax.
- [ ] **Optimized Chunking:** Ensure chunks are only invalidated when the map data actually changes.

### 2.2 Physics & Collision (`PhysicsSystem.js`)
- [ ] **Full Collision Implementation:** Add logic for One-Way Down, Left, Right (Types 5, 6, 7) and Trigger Zones (Type 8).
- [ ] **Moving Platform Carrier:** Ensure entities move correctly with platforms they are standing on.

### 2.3 Asset Management (`main.js`)
- [ ] **Pre-loader:** Implement a proper asset pre-loader to prevent mid-game loading glitches.
- [ ] **Tileset Fallback:** Improve the fallback logic when a tileset fails to load.

## 3. Implementation Schedule

### Phase 1: Rendering Fixes (Immediate)
1. Update `PlatformerRenderer` to render `map.decorations`.
2. Fix the `map.layers` iteration logic.
3. Add foreground layer support (layers named "Foreground" or indexed > 1).

### Phase 2: Physics Completion
1. Implement the remaining One-Way collision types.
2. Finalize moving platform logic.

### Phase 3: Visual Polish
1. Add parallax background support.
2. Integrate with `AtmosphereSystem` for dynamic lighting.

### Phase 4: Verification
1. Create a test level with all features (slopes, one-ways, moving platforms, decorations).
2. Verify rendering performance in large levels.
