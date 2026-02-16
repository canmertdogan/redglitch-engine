# IsoPixel Engine Optimization Master Plan

## Problem Analysis
The current rendering engine uses a "Painter's Algorithm" approach, iterating through every coordinate (X, Y) and every layer (Z) for the entire visible screen every single frame. 

**Bottlenecks:**
1. **Redundant Rendering:** For a 30x30x10 map, the engine might process 9,000 potential tile slots per frame, even if only the top layer is visible.
2. **Canvas Overhead:** Thousands of `ctx.drawImage` calls per frame saturate the CPU/GPU bus.
3. **No Caching:** Static terrain is re-calculated and re-drawn constantly, even when the camera is just panning.

## Proposed Solution: "Chunk-Based Hybrid Rendering"

We will move from a raw tile-by-tile render to a chunk-based render system, similar to Minecraft or Tiled, combined with occlusion culling.

### Phase 1: Occlusion Culling (Immediate Wins)
**Goal:** Stop drawing blocks that are completely hidden by other blocks.
- **Logic:** Before rendering a frame, calculate a "HeightMap" or "OcclusionMask".
- **Algorithm:** 
  1. Iterate columns (X, Y).
  2. Find the highest "Solid" block (Shape 0).
  3. Mark all blocks below this Z as "Occluded" (unless the top block is transparent/glass).
  4. Skip `drawImage` for occluded blocks.
- **Expected Gain:** 50-80% reduction in draw calls for deep terrain.

### Phase 2: Chunk Caching (The "Minecraft" approach)
**Goal:** Render static terrain once, save it to an image, and reuse it.
- **Structure:** Divide world into `16x16` chunks.
- **Mechanism:**
  - Create a `Chunk` class that holds an offscreen `Canvas`.
  - `Chunk.update()`: Renders all static tiles within the chunk's bounds to its internal canvas.
  - `IsoStrategy.render()`: Instead of iterating tiles, determine visible chunks and draw their cached canvases.
- **Invalidation:** When a block is placed/broken (`paint()`), only call `update()` on the affected Chunk.
- **Expected Gain:** Static terrain rendering cost becomes near-zero during panning.

### Phase 3: Spatial Indexing for Entities
**Goal:** fast lookups for dynamic objects (Lights, Decorations).
- **Current:** `map.decorations.forEach(...)` (O(N) every frame).
- **New:** maintain a `SpatialGrid` map.
- **Logic:** `grid[chunkX][chunkY]` = `[List of Decorations]`.
- **Render:** Only iterate lists for visible chunks.

## Implementation Steps

1. **Verify Baseline:** Create a stress-test map (50x50, filled 10 layers deep) and measure FPS.
2. **Implement Phase 1 (Occlusion):** Modify `IsoStrategy.render` to include a Z-check helper.
3. **Implement Phase 2 (Chunks):** 
   - Refactor `IsoStrategy` to manage a `this.chunks = {}` cache.
   - Separate "Static Layer" rendering from "Dynamic Layer" (cursors, entities) rendering.
4. **Implement Phase 3 (Spatial):** Refactor `map.decorations` storage or add a lookup index.

## Risk Assessment
- **Memory Usage:** Chunk caching uses video memory (VRAM). A 100x100 world might generate ~36 chunk textures. We need to implement **Cache Eviction** (unload chunks far from camera).
- **Sorting Issues:** Isometric rendering relies heavily on draw order. Drawing a flat "Chunk Image" might mess up depth sorting if a dynamic entity (player) stands *behind* a tall block inside a chunk.
  - **Mitigation:** We might need to split chunks into "Floors" (blocks below player Z) and "Walls/Roofs" (blocks above player Z), or use a depth buffer. 
  - **Simpler Mitigation:** Use Chunk Caching only for the "Base Terrain" (Layer 0-1) and render higher layers/dynamic objects normally.

## Recommendation
Start with **Phase 1 (Occlusion Culling)** as it requires no architectural changes to caching and solves the "deep lag" immediately. If that's not enough, proceed to **Phase 2 (Chunking)**.
