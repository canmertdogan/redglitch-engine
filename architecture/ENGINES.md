# Game Engines

ONGONLUK ENGINE is a multi-paradigm system. It does not force a single rendering or logic style. Instead, it provides three distinct "Cores" or "Engines" that share the same Asset Manager and Event Bus.

## 1. IsoPixel Engine (`engines/iso-pixel`)
**Target Genre:** 2.5D Isometric RPGs, Strategy, Simulation.
**Key File:** `main.js` (Class: `IsoGame`)

### Architecture
*   **Game Loop**: Uses a **Fixed Timestep** loop.
    *   **Physics/Logic**: Updates at a fixed 60Hz (`TICK_RATE`) for deterministic behavior.
    *   **Rendering**: Runs as fast as the browser allows (Variable), using interpolation (`renderX`, `renderY`) between the previous and current physics state to ensure smooth motion even on high-refresh displays.
*   **Rendering Strategy (`IsoStrategy.js`)**:
    *   **Projection**: Converts 3D world coordinates (x,y,z) to 2D screen coordinates using standard isometric math.
    *   **Occlusion**: Uses a custom **Int8 Occlusion Buffer**. It calculates which tiles block others based on height (Z).
    *   **Lighting**: Implements a "Shadow Propagation" algorithm. Shadows are cast diagonally (assuming a top-left sun) and darken tiles based on the height difference.
    *   **Shader System**: An optional WebGL layer (`IsoShaderSystem`) sits on top of the 2D canvas to apply post-processing effects like Bloom, Color Grading, and CRT effects.

### Unique Features
*   **Worm/Caterpillar Movement**: Natively supports multi-segment characters where the body follows the head's path.
*   **FX System**: A robust particle emitter for weather (rain, snow) and magic effects.

---

## 2. RPG Top-Down Engine (`engines/rpg-topdown`)
**Target Genre:** Classic SNES-style RPGs (Zelda, Final Fantasy).
**Key File:** `main.js` (Class: `LogicSystem` is central here)

### Architecture
*   **Logic-Driven**: Unlike IsoPixel which focuses on rendering, this engine focuses on *Scripting*.
*   **Logic System (`LogicSystem` class)**:
    *   **Dynamic Loading**: Scripts are loaded on-demand from `/api/logic/js/<script_name>`.
    *   **Hooks**: Entities can have attached scripts with specific lifecycle hooks:
        *   `onStart`: Called when entity spawns.
        *   `onUpdate(dt)`: Called every frame.
        *   `onInteract(player)`: Called when player presses Action button near entity.
        *   `onCollide(other)`: Called on physics collision.
    *   **Algorithm Support**: Can run "Visual Scripting" nodes (Algorithms) by converting them to runtime logic.

### Systems
*   **Atmosphere System**: A background canvas layer rendering moving clouds and floating islands for parallax depth.
*   **Quest & Dialogue**: Integrated subsystems for branching conversations and state tracking.

---

## 3. Platformer Engine (`engines/platformer-2d`)
**Target Genre:** Side-scrolling Action/Arcade.
**Key File:** `main.js` (Class: `PlatformerGame`)

### Architecture
*   **Simplicity**: Designed for speed and ease of use.
*   **Physics Loop**:
    *   Custom AABB (Axis-Aligned Bounding Box) collision.
    *   Applies Gravity, Velocity, and Friction per frame.
    *   `update()` modifies `player.vx/vy`, then `draw()` renders the state.
*   **Camera**: A "Follow" camera that keeps the player centered within bounds.
