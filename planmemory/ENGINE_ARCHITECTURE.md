# ONGONLUK ENGINE Architecture Documentation

## Overview
ONGONLUK ENGINE is a multi-paradigm game development environment supporting three distinct game engines. Each engine is specialized for a specific genre but shares a common infrastructure for asset management and tool integration.

### Available Engines
1.  **IsoPixel (iso-pixel)**: An isometric 2.5D engine focused on beautiful pixel art visuals, dynamic lighting, and atmospheric effects.
2.  **RPG Top-Down (rpg-topdown)**: A robust, feature-rich engine for top-down role-playing games, featuring complex systems for quests, dialogue, logic, and inventory.
3.  **Platformer 2D (platformer-2d)**: A lightweight engine for side-scrolling platformers with custom physics and camera handling.

---

## Shared Infrastructure
The engines sit on top of a shared web-based toolchain located in `public/shared/`.

-   **AssetManager (`AssetManager.js`)**:
    -   Centralized registry for all game assets (sprites, sounds, data).
    -   Handles loading, caching, and dependency tracking.
    -   Sanitizes paths to work with the virtual server routes (`/dunyalar`, `/assets`).
    
-   **EventBus (`EventBus.js`)**:
    -   Provides communication between the Editors (Tools) and the Runtime.
    -   Uses WebSockets to sync state changes (like file updates) across different windows.
    
-   **SharedProjectState (`SharedProjectState.js`)**:
    -   Manages the global state of the active project.
    -   Handles undo/redo history and activity logging (seen in the Dashboard).

---

## 1. IsoPixel Engine (`engines/iso-pixel`)
**Focus:** Visuals, Atmosphere, Isometric Projection.

### Architecture
-   **Main Entry (`main.js`)**: The `IsoGame` class manages the game loop. It implements a **Fixed Timestep** loop (`fixedUpdate` at 60Hz) for physics consistency and a **Variable Timestep** loop (`draw`) for smooth rendering interpolation.
-   **Rendering Strategy (`IsoStrategy.js`)**: 
    -   Handles the mathematical projection from 3D world coordinates (x,y,z) to 2D screen space (isometric).
    -   **Tile Caching**: Optimizes performance by pre-rendering complex tile shapes into offscreen canvases.
    -   **Depth Sorting**: Uses a "Painter's Algorithm" approach, sorting all tiles and entities by depth before drawing to handle occlusion correctly.
-   **Visual Effects (`fxSystem.js`)**:
    -   **Dynamic Lighting**: Supports a full day/night cycle with changing ambient light. Includes both "Soft" lighting (smooth gradients) and "Area" lights.
    -   **Particle System**: Robust emitter system for effects like rain, snow, fire, and magic.
    -   **Post-Processing**: Supports simple screen-space effects like screen shake and color grading.

### Key Features
-   **Caterpillar Player**: Unique player movement where body segments follow the head (worm-like).
-   **Layered Map**: Supports multiple layers of tiles with independent Z-heights.

---

## 2. RPG Top-Down Engine (`engines/rpg-topdown`)
**Focus:** Gameplay Depth, Scripting, Systems.

### Architecture
-   **Logic System (`LogicSystem` in `main.js`)**: 
    -   The core brain of the engine. It dynamically loads and executes JavaScript behavior scripts (`.js` files) attached to entities.
    -   Allows for complex, programmable behavior without hardcoding it into the engine core.
-   **Subsystems**:
    -   **QuestSystem**: Manages quest states, objectives, and progression.
    -   **DialogueSystem**: Handles branching dialogue trees and NPC interactions.
    -   **Inventory/ItemSystem**: Manages items, equipment, and loot tables.
    
### Rendering
-   Standard top-down 2D rendering.
-   Supports "Y-Sort" rendering to allow characters to walk behind/in-front of objects naturally.

---

## 3. Platformer Engine (`engines/platformer-2d`)
**Focus:** Physics, Precision.

### Architecture
-   **Physics (`physics.js`)**: Custom AABB (Axis-Aligned Bounding Box) physics engine. Handles gravity, velocity, and collision detection against a tilemap.
-   **Camera**: Implements a side-scrolling camera that smoothly follows the player while respecting map boundaries.
-   **Simplicity**: Designed to be lightweight and easy to extend for arcade-style games.

---

## Directory Structure
```
public/
├── engines/
│   ├── iso-pixel/       # Isometric Engine Source
│   ├── rpg-topdown/     # RPG Engine Source
│   ├── platformer-2d/   # Platformer Engine Source
│   └── shared/          # Common Libraries
├── strategies/          # Shared Rendering Strategies (IsoStrategy)
└── shared/              # Tool Integration Scripts
```
