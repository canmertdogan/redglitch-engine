# ketebe ENGINE Architecture Documentation

## Overview
ketebe ENGINE is a multi-paradigm game development environment supporting six distinct game engines across 2D, 2.5D, and 3D perspectives. Each engine is specialized for a specific genre but shares a common infrastructure for asset management, tool integration, and AI assistance.

### Available Engines
1.  **IsoPixel (iso-pixel)**: An isometric 2.5D engine focused on beautiful pixel art visuals, dynamic lighting, and atmospheric effects.
2.  **RPG Top-Down (rpg-topdown)**: A robust, feature-rich engine for top-down role-playing games, featuring complex systems for quests, dialogue, logic, and inventory.
3.  **Platformer 2D (platformer-2d)**: A lightweight engine for side-scrolling platformers with custom physics and camera handling.
4.  **FPS-3D (fps-3d)**: A first-person shooter engine utilizing a voxel/trimesh hybrid world, low-poly aesthetics, and custom weapon/AI systems.
5.  **TopDown-3D (topdown-3d)**: A 3D evolution of the top-down RPG perspective, featuring real-time shadows, navmesh-based pathfinding, and cel-shaded visuals.
6.  **Platformer-3D (platformer-3d)**: A third-person platforming engine with AABB-based character physics and dynamic camera tracking.

---

## Shared Infrastructure
The engines sit on top of a shared web-based toolchain located in `public/shared/`.

-   **AssetManager (`AssetManager.js`)**:
    -   Centralized registry for all game assets (sprites, sounds, data).
    -   Handles loading, caching, and dependency tracking.
    -   Sanitizes paths to work with the virtual server routes (`/dunyalar`, `/assets`) and prevents double-prefixing.
    
-   **EventBus (`EventBus.js`)**:
    -   Provides communication between the Editors (Tools) and the Runtime.
    -   Uses WebSockets to sync state changes (like file updates) across different windows.
    
-   **SharedProjectState (`SharedProjectState.js`)**:
    -   Manages the global state of the active project.
    -   Handles undo/redo history and activity logging (seen in the Dashboard).

-   **Renderer3D (`Renderer3D.js`)**:
    -   Shared WebGL pipeline for all 3D engines.
    -   Implements Cel-shading, Outline passes, and standardized resize handling (`.resize(w, h)`).

---

## 1. IsoPixel Engine (`engines/iso-pixel`)
**Focus:** Visuals, Atmosphere, Isometric Projection.

### Architecture
-   **Main Entry (`main.js`)**: The `IsoGame` class manages the game loop. It implements a **Fixed Timestep** loop (`fixedUpdate` at 60Hz) for physics consistency and a **Variable Timestep** loop (`draw`) for smooth rendering interpolation.
-   **Rendering Strategy (`IsoStrategy.js`)**: 
    -   Handles the mathematical projection from 3D world coordinates (x,y,z) to 2D screen space (isometric).
    -   **Sprite Rendering**: Replaced legacy occlusion culling with stable sprite-based depth sorting for better visual integrity.
    -   **Depth Sorting**: Uses a "Painter's Algorithm" approach, sorting all tiles and entities by depth before drawing.
-   **Visual Effects (`fxSystem.js`)**:
    -   **Dynamic Lighting**: Supports a full day/night cycle with changing ambient light.
    -   **Particle System**: Robust emitter system for effects like rain, snow, fire, and magic.

---

## 2. 3D Engine Suite (`engines/fps-3d`, `engines/topdown-3d`, `engines/platformer-3d`)
**Focus:** Depth, Voxels, Modern 3D Interactions.

### Shared 3D Layers
-   **Engine3DBase / Engine3DAdapter**: Provides a standard lifecycle for Three.js scene setup, level loading (`loadLevel3D`), and physics initialization.
-   **Physics3DWorld**: Wrapper for `cannon-es` providing fixed-step physics, raycasting, and collision layers.
-   **Camera3DController**: Unified camera system supporting FPS, Top-Down, and Third-Person modes with trauma-based shake.

---

## 3. RPG Top-Down Engine (`engines/rpg-topdown`)
**Focus:** Gameplay Depth, Scripting, Systems.

### Architecture
-   **Logic System (`LogicSystem` in `main.js`)**: 
    -   The core brain of the engine. It dynamically loads and executes JavaScript behavior scripts attached to entities.
-   **Subsystems**:
    -   **QuestSystem**: Manages quest states, objectives, and progression.
    -   **DialogueSystem**: Handles branching dialogue trees.
    
---

## 4. Platformer Engine (`engines/platformer-2d`)
**Focus:** Physics, Precision.

### Architecture
-   **Physics (`physics.js`)**: Custom AABB (Axis-Aligned Bounding Box) physics engine.
-   **Camera**: Side-scrolling camera with boundary constraints.

---

## Directory Structure
```
public/
├── engines/
│   ├── iso-pixel/       # Isometric Engine Source
│   ├── rpg-topdown/     # RPG Engine Source
│   ├── platformer-2d/   # Platformer Engine Source
│   ├── fps-3d/          # FPS 3D Core
│   ├── topdown-3d/      # Top-Down 3D Core
│   ├── platformer-3d/   # Platformer 3D Core
│   └── shared/          # Shared Adapters & Renderer3D
└── shared/              # Tool Integration Scripts
```
