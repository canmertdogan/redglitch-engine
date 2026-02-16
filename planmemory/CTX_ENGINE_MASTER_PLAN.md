# CTX Engine Master Plan: Power & Stability
**Goal:** Maximize the performance, stability, and capabilities of the current HTML5 Canvas 2D (`ctx`) engine without rewriting it in WebGL.

This plan focuses on professional-grade optimization techniques (Spatial Partitioning, Object Pooling, Dirty Rectangles) and robust architectural patterns (Fixed Timestep, Error Boundaries) to make the "Granny-proof" engine viable for larger games.

---

## Phase 1: Core Stability (The Foundation)
**Objective:** Eliminate jitter, physics tunneling, and random crashes.

### 1.1 Fixed Timestep Game Loop
**Problem:** The current loop passes variable `deltaTime` to updates. This causes physics to behave differently on 60hz vs 144hz monitors (e.g., jumping higher, tunneling through walls).
**Solution:** Implement a "Accumulator" pattern.
*   **Logic:**
    ```javascript
    const TIME_STEP = 1000 / 60; // 60 FPS fixed logic
    let accumulator = 0;
    
    function loop(timestamp) {
        let dt = timestamp - lastTime;
        accumulator += dt;
        while (accumulator >= TIME_STEP) {
            update(TIME_STEP / 1000); // Fixed physics step
            accumulator -= TIME_STEP;
        }
        render(accumulator / TIME_STEP); // Render with interpolation
    }
    ```
*   **Benefit:** Consistent game feel on all devices.

### 1.2 Object Pooling (Memory Stability)
**Problem:** `Fireball` and `Particle` classes use `new` every time they are spawned. This creates "Garbage Collection (GC) Pauses" (stuttering) when thousands of objects are created/destroyed.
**Solution:** Implement a generic `ObjectPool` class.
*   **Logic:**
    *   Create an array of 500 inactive `Particle` objects at startup.
    *   When needing a particle: `pool.get()`.
    *   When dying: `particle.active = false` (don't `splice` from array).
*   **Target:** Projectiles, Particles, Damage Numbers, temporary Audio instances.

### 1.3 Error Boundaries (Sandbox Protection)
**Problem:** A syntax error in a single NPC script crashes the entire render loop, resulting in a "White Screen of Death".
**Solution:** Wrap entity updates in `try/catch`.
*   **Logic:** If `npc.update()` throws, log the error to the console *once*, disable that specific NPC, and keep the game running.

---

## Phase 2: Rendering Optimization (The Speed)
**Objective:** Increase sprite capacity from ~500 to ~3000+ while maintaining 60 FPS.

### 2.1 Static Layer Caching (Chunking)
**Problem:** `MapSystem` iterates over 2D arrays and executes `ctx.drawImage` for every floor tile every frame.
**Solution:** Pre-render static layers.
*   **Approach:**
    1.  Create an off-screen canvas (e.g., 1024x1024 chunks).
    2.  Draw all "Floor" and "Wall" tiles onto this canvas *once* at load time.
    3.  In the render loop, draw the visible chunk(s) as a single image.
*   **Isometric Impact:** Extremely high. Eliminates the need to sort static tiles every frame.

### 2.2 Render Culling & Dirty Rectangles
**Problem:** Entities are updated/checked even if they are miles away.
**Solution:**
*   **Frustum Culling:** Strictly skip `entity.draw()` if `entity.x` is outside the camera view.
*   **Logic Culling:** If an Enemy is > 2000px away, switch to a "Low Priority" mode (update once every 10 frames) or disable entirely.

---

## Phase 3: Physics & Logic (The Brains)
**Objective:** Handle hundreds of colliding entities efficiently.

### 3.1 Spatial Partitioning (Quadtree)
**Problem:** Bullet collision checks every enemy (`O(N*M)`). 100 bullets vs 100 enemies = 10,000 checks per frame.
**Solution:** Implement a **Quadtree** or **Spatial Hash Grid**.
*   **Logic:** Divide the world into a grid.
*   **Check:** "I am in Grid C4. Only check collisions against other objects in Grid C4."
*   **Result:** Reduces 10,000 checks to ~50 checks.

### 3.2 State Machines (Better Logic)
**Problem:** `Enemy.update` is a mess of `if (dist < 50) ... else if (dist < 100)`. Hard to read and debug.
**Solution:** Formal `Finite State Machine (FSM)`.
*   **Structure:**
    ```javascript
    states = {
        IDLE: { enter: ..., update: ..., exit: ... },
        CHASE: { enter: ..., update: ..., exit: ... }
    }
    ```

---

## Phase 4: Visual Polish (The "Power")
**Objective:** Make the 2D Canvas look "Next Gen".

### 4.1 Advanced Lighting (Composite Operations)
**Problem:** Current lighting is just drawing alpha circles.
**Solution:** Use `ctx.globalCompositeOperation`.
1.  **Darkness Layer:** Fill screen with black (alpha 0.8).
2.  **Light Cutting:** Draw lights using `destination-out` to "erase" the darkness.
3.  **Color Tint:** Draw lights again with `screen` or `overlay` blend mode to add color.

### 4.2 Camera "Juice"
**Features:**
*   **Trauma-based Screen Shake:** Non-linear shake decay (feels punchier).
*   **Look-ahead:** Camera pans slightly towards the mouse cursor.
*   **Lerp Smoothing:** Smooth damping on camera movement (already partially there, refine k value).

---

## Execution Order
1.  **Refactor Main Loop** (Fix physics/time).
2.  **Implement Spatial Hash** (Fix collision lag).
3.  **Implement Object Pool** (Fix GC stutters).
4.  **Implement Map Caching** (Fix rendering bottleneck).
5.  **Refactor Lighting** (Visual upgrade).
