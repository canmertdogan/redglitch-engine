# Platformer-2d Engine Audit

This document summarizes the defects discovered in the platformer-2d engine during a codebase review and gives concrete, prioritized remediation steps and safe short-term fixes.

## Scope
Files inspected (non-exhaustive):
- public/engines/platformer-2d/PhysicsSystem.js
- public/engines/platformer-2d/PlatformerGame.js
- public/engines/platformer-2d/PlatformerRenderer.js
- public/engines/platformer-2d/PlatformerConfig.js
- public/engines/platformer-2d/PlatformerAssetManager.js
- public/engines/platformer-2d/entities/PlatformerEnemy.js
- public/engines/platformer-2d/entities/PlatformerMovingPlatform.js
- public/engines/platformer-2d/entities/PlatformerPushableBlock.js
- public/engines/platformer-2d/entities/Player.js
- public/engines/platformer-2d/systems/*

Note: The engine relies heavily on globals (window.game, window.PlatformerConfig, window.fx, etc.). The issues below are aggregated from the inspected files and represent the most pressing problems.

---

## Critical issues (highest priority)

1) Inconsistent coordinate units (tile vs pixel) across loaders and entity constructors
- Evidence: Some entity constructors (PlatformerMovingPlatform, PlatformerPushableBlock) multiply incoming x/y by 32 (assume tile coords), while others (PlatformerEnemy, Player) call super(x, y, ...) directly expecting pixel coords. PlatformerGame._addEntity sometimes multiplies entity coordinates and sometimes does not.
- Effect: Entities appear in wrong positions, collision and AI logic breaks, tests and play sessions are flaky.
- Suggested fix: Pick a single convention (recommended: entity constructors accept pixel coordinates) and update the map/entity loader to convert tile coords to pixels consistently. Minimal fix: change PlatformerGame._addEntity to multiply tile coords for all entity types before instantiation (or vice-versa but be consistent). Add assertions or dev-mode checks to fail-fast when coordinates look inconsistent.

2) Hard-coded tile-size constants mixed with different tile sizes (16 vs 32)
- Evidence: PhysicsSystem and many entity files use 32 as a magic constant; PlatformerRenderer uses 16 in some places and 32 elsewhere. PlatformerConfig.TILE_SIZE exists but is not consistently used.
- Effect: Mismatched physics vs rendering scales, collision detection errors, tile indexing mistakes, wrong sprite slicing.
- Suggested fix: Centralize tile size in PlatformerConfig.TILE_SIZE; replace hard-coded 16/32 constants with a single exported value or instance property (physics.tileSize, renderer.tileSize) and ensure map loading converts tiles based on that.

3) Moving platform implementation and riding-platform edge cases
- Evidence: Platforms rely on lastX/lastY for displacement but initialization and update ordering is fragile (last* sometimes unset or not updated correctly). Riding logic uses platform displacement but may use stale or uninitialized last values.
- Effect: Riding entities jitter, may be ejected or fail to move with platforms, collision order issues.
- Suggested fix: Initialize platform.lastX/lastY in constructor; on update, compute new position then calculate delta = (x - lastX) and apply delta to riders, then set lastX = x after movement. Keep platform update ordering consistent relative to physics resolution.

4) Physics timestep & dt usage
- Evidence: PlatformerGame uses a fixed dt = 1/60 in the main loop rather than measuring real elapsed time; PhysicsSystem and entities apply velocities without robust clamping or sweep tests.
- Effect: Different frame rates yield different behavior; tunneling and non-deterministic collisions at high speed or low frame rate.
- Suggested fix: Use actual measured delta time (clamped) in the game loop; make PhysicsSystem and entities multiply velocities by dt and perform continuous collision checks (swept AABB) for fast-moving objects.

5) Renderer asset paths and tilemap / atlas assumptions
- Evidence: Default tileset path references rpg-topdown assets; combineWorldPixelArt builds resource URLs with spaces and synchronous assumptions; tile indexing assumes a specific atlas layout.
- Effect: Missing or wrong tileset images; incorrect tile rendering; fallback to blank tiles.
- Suggested fix: Use platformer-specific tilesets or make tileset configurable per project; fix URL building (no stray spaces), validate assets exist before use, and centralize tile→tileset mapping.

6) Fragile global dependencies and lack of guard checks
- Evidence: Many modules assume window.game.* or window.fx.* is present and call methods without optional chaining or guards.
- Effect: Engine crashes in environments without all systems initialized (e.g., unit tests or headless runs).
- Suggested fix: Add defensive checks, or pass explicit system references when constructing subsystems (dependency injection) instead of reaching into window.*.

---

## Medium-priority issues (logical bugs, maintainability)

- Slope handling is simplistic and likely incorrect for corner cases; use consistent formulas and test slopes with unit tests.
- Player dash sets ignoreGravity but relies on PhysicsSystem to honor the flag; ensure PhysicsSystem checks entity.ignoreGravity before applying gravity.
- Jump buffering and coyote time: logic is present but edge-case resets and buffer timers need unit tests and clearer semantics.
- Animator and sprite frame generation assumes a specific sprite object shape (height/width/data); make the sprite API explicit and robust to alternate sources.
- Many magic numbers (0.15, 0.1, 32, etc.) should come from config or constants.

---

## Low-priority / cosmetic

- Renderer chunking may be memory heavy and lacks eviction; consider caching strategies.
- Some helper functions use synchronous operations or synchronous canvas drawing in places that could be asynchronous.

---

## Suggested immediate fixes (safe, small diffs)

1. Standardize coordinate units: update PlatformerGame._addEntity to ensure e.x and e.y are converted by TILE_SIZE for all entities before passing to constructors (small change in one function).
2. Replace hardcoded 32 / 16 in PhysicsSystem.js and PlatformerRenderer.js with config tile size variables (search-and-replace small diffs).
3. Initialize lastX/lastY in PlatformerMovingPlatform constructor and update ordering in the platform update loop (small diffs in two files).
4. Make PhysicsSystem use entity.ignoreGravity check before applying gravity.
5. Fix renderer tileset default path to platformer assets and correct URL string building.
6. Add defensive guards for window.game.* calls (optional chaining or early returns).

These changes are low-risk and will fix the majority of visible gameplay breakages quickly.

---

## Tests to add

- Unit tests for PhysicsSystem.checkCollisions including: tile collisions, one-way platforms, slopes, moving platform rider displacement.
- Unit tests for PlatformerGame._addEntity mapping to ensure entities end up at intended pixel coordinates given tile-based input.
- Integration test: spawn a moving platform, place player on it, move the platform and verify player's position remains aligned.

---

## Concrete next steps (proposed order)

1. Implement the 6 immediate fixes above in small PRs, run the game locally and verify basic scenarios (spawn player, moving platform, a slope, and a projectile collision).
2. Add unit tests for the physics behaviors and run headless via existing test harness or minimal node-run tests.
3. Triage remaining medium-priority items and schedule further work for renderer performance improvements.

---

If preferred, the next automated actions I can perform now are:
- Make the small diffs for "standardize coordinates" and "tile-size constants" and run the server to sanity-check the editor/play preview.
- Start implementing moving-platform lastX/lastY initialization and adjust update ordering.

Please tell me to proceed and which change to make first, or approve the prioritized fixes and I'll start applying them.
