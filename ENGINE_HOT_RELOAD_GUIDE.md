# RedGlitch Engine - Hot-Reload & Data-Driven Architecture Guide

This document explains the architecture behind the RedGlitch Engine's Data-Driven IDE capabilities, specifically detailing how the system achieves live hot-reloading of assets, scripts, and entities across three completely different game engines (Top-Down RPG, IsoPixel, and Unified 3D) without requiring page reloads or dropping frame state.

---

## 1. Core Architecture: The EventBus

The backbone of the entire live-reload system is the `RedGlitchEventBus` (located in `public/shared/EventBus.js`). 

Because the IDE and the game engine run in the same browser context (either directly or via iframes/workers), they communicate exclusively through the EventBus. The IDE never manipulates engine memory directly.

### Key Event Channels
- `system:entity:patch`: Issued when a single entity's properties are modified in the Inspector.
- `system:prefab:update`: Issued when a master prefab is saved, forcing all instances of that prefab to immediately update their sprites and logic.
- `system:script:update`: Issued when a Logic Node or VSL script is saved.
- `system:engine:metrics`: Periodic broadcast from the engine containing FPS, memory heap size, and draw calls, which is intercepted by the IDE's status bar.

---

## 2. Engine Adapters

Because RedGlitch supports three entirely different rendering cores, the IDE cannot speak directly to them. We use the `EngineAdapter` pattern (base class in `public/engines/shared/EngineAdapter.js`).

Every engine has a corresponding adapter:
- `TopDownAdapter.js`
- `IsoPixelAdapter.js`
- `Unified3DAdapter.js`

### The `setupLiveBridge()` Method
When an engine boots, its adapter calls `setupLiveBridge()`. This method attaches listeners to the EventBus. When the IDE fires `system:prefab:update`, the adapter receives the ID, queries the engine's internal array (via `findEntitiesByPrefabId`), and passes those entities to the `CrossEngineSerializer`.

> [!WARNING]
> **Memory Leaks**: Adapters *must* unregister all their EventBus listeners inside their `destroy()` method. Failing to do so causes severe memory leaks because the EventBus will keep references to destroyed engines forever. (Fixed in Phase 19).

---

## 3. SharedProjectState

The `SharedProjectState` (located in `public/shared/SharedProjectState.js`) acts as the single source of truth for the project. 

When the user saves a prefab in the IDE:
1. `Studio.js` triggers a save request.
2. The server writes the JSON to disk.
3. The server broadcasts a WebSocket `file:modified` event back to the client.
4. `SharedProjectState` intercepts this, updates its internal memory cache, and fires `system:prefab:update` on the EventBus.
5. The `EngineAdapter` hears the update and patches the live engine memory.

---

## 4. CrossEngineSerializer

To convert IDE JSON data into engine-specific memory structures, we use `CrossEngineSerializer.js`.

When a hot-reload occurs, the adapter passes the raw JSON components and the active engine entity to `CrossEngineSerializer.deserializeEntityComponents(entity, components, engineType)`.

This class looks at the `engineType` (e.g., `iso-pixel`) and translates generic data (like `position: {x, y}`) into engine-specific memory (like `entity.isoX`, `entity.isoY`, or Three.js Vector3 coordinates).

---

## 5. AssetManager & Garbage Collection

Hot-reloading assets can rapidly consume memory. 
- `AssetManager.js` caches all requested textures to prevent stuttering.
- When the IDE switches from one engine/level to another, `EngineAdapter.destroy()` explicitly calls `AssetManager.purgeCache()` to flush out old WebGL texture buffers and Image objects.

---

## Conclusion
The RedGlitch Data-Driven pipeline ensures that level designers and programmers never have to stop the game to see their changes. The pipeline flows linearly: **IDE Save -> Disk -> WebSocket -> SharedProjectState -> EventBus -> EngineAdapter -> CrossEngineSerializer -> Live Memory.**
