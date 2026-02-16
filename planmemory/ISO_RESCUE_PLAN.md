# Rescue & Recovery Plan: IsoPixel Engine

## Diagnosis
The current state of the engine is suffering from **Over-Engineering**. Successive optimization attempts (Chunking, Wavefronts) have introduced complexity that destabilized the core rendering loop, leading to:
1.  **Low FPS:** Likely caused by Garbage Collection thrashing (creating thousands of arrays/objects per frame in the Wavefront/Bucket logic).
2.  **Glitchy Graphics:** Sorting logic (Wavefront) failing to handle fractional coordinates (smooth movement) correctly, causing popping.
3.  **Camera Detachment:** The complexity of the render loop decoupled the visual projection from the game logic state.

## Recovery Strategy: "The Unified Flat Buffer"

We will revert to a proven, industry-standard Isometric Rendering architecture used in games like *RollerCoaster Tycoon* and *Age of Empires*.

### 1. Simplify the Architecture
-   **DELETE** Chunk Caching (too complex for dynamic depth).
-   **DELETE** Wavefront/Bucketing (too heavy on allocation).
-   **IMPLEMENT** a single **`GlobalRenderBuffer`**.

### 2. The Render Loop (Step-by-Step)
Every frame, the engine will:
1.  **Cull:** Calculate the visible map rectangle (`minX, minY` to `maxX, maxY`).
2.  **Collect:** Iterate *only* that rectangle. Push every visible Tile and every visible Entity into the `GlobalRenderBuffer`.
3.  **Sort:** Sort the buffer using Javascript's native Timsort (highly optimized) on a single `depth` metric.
    -   `Depth = (x + y) + (z_layer_index * 0.001)`
4.  **Draw:** Iterate the buffer and draw images.

### 3. Performance & Smoothness Optimizations
-   **Object Pooling:** The `GlobalRenderBuffer` will be cleared (`length = 0`), not recreated, to prevent memory spikes (lag).
-   **Float Coordinates:** Entities will use exact `x,y` (e.g., `5.42`) for depth calculation, ensuring they slide smoothly behind/in-front of blocks.
-   **Delta Time:** Ensure `main.js` passes the correct time step for smooth interpolation.

## Execution Order
1.  **Rewrite `IsoStrategy.js`:** Replace the entire class with the "Unified Flat Buffer" implementation.
2.  **Verify `main.js`:** Ensure the camera lerp and update loop are feeding correct data.

This approach prioritizes **Stability** and **Correctness**. Once it runs smooth (even if 30fps on low-end), we can micro-optimize. But first, we fix the glitches.
