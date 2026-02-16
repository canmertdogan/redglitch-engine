# Character Animation Development Plan

## Objective
Replace the yellow square placeholder with an animated Knight character that walks, idles, and jumps.

## Assets
We will use the existing `noBKG_Knight` assets found in `public/sprite-art/Knight/Knight/`.
- **Idle:** `noBKG_KnightIdle_strip.png` (15 frames presumably)
- **Run:** `noBKG_KnightRun_strip.png` (8 frames presumably)
- **Jump:** `noBKG_KnightJumpAndFall_strip.png` (for jumping state)

*Note: These are 2D side-view sprites. We will use "Billboarding" logic (flipping left/right) which is a common aesthetic for 2.5D pixel art games.*

## Implementation Steps

### Phase 1: Asset Loader
- **Where:** `main.js` (init)
- **Task:** Load the sprite sheets into `this.sprites = {}`.
- **Logic:** `await loadImage('knight_idle', 'path/to/idle.png')`

### Phase 2: State Management
- **Where:** `main.js` (update)
- **Task:** Update `player.animState` based on velocity.
  - `velocity.z != 0` -> **JUMP**
  - `velocity.x != 0 || velocity.y != 0` -> **RUN**
  - Else -> **IDLE**
- **Task:** Update `player.facing` based on input (Left/Right).
- **Task:** Update `player.frameTimer` to cycle animation frames.

### Phase 3: Rendering
- **Where:** `IsoStrategy.js` (render/drawObject)
- **Task:** Replace the `fillRect` logic for the player.
- **Task:** Draw the correct frame from the sprite sheet centered at the player's screen position.
- **Task:** Implement `ctx.scale(-1, 1)` for facing Left.

## Technical Details
- **Frame Rate:** Animations run at ~10-12 FPS (independent of game FPS).
- **Pivot Point:** Bottom-Center of the sprite should align with the player's feet (Center of the tile).

## Execution
1.  Verify exact frame counts of the sprite strips.
2.  Implement Loader.
3.  Implement Logic.
4.  Implement Renderer.
