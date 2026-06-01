# Shared Infrastructure (The Kernel)

The "Kernel" of redglitch ENGINE consists of three singleton classes that manage the application's lifecycle, data, and communication. These reside in `public/shared/`.

## 1. AssetManager (`AssetManager.js`)
**Role:** The single source of truth for all game assets.

### Key Features
*   **Virtual Path Resolution**: It abstracts the file system. When a tool requests `assets/sprites/hero.png`, the AssetManager (in conjunction with the server) determines whether to load it from the project folder or the core engine folder.
*   **Dependency Tracking**: Maintains a graph of asset dependencies.
    *   *Example*: A `Map` JSON file depends on a `Tileset` image. If the tileset is modified, the AssetManager knows which maps might need invalidation.
*   **Caching**: Implements a browser-side memory cache with TTL (Time To Live).
*   **Thumbnail Generation**: Automatically generates 64x64 thumbnails for image assets for use in the UI grid.

### API Snapshot
```javascript
// Load an asset (handles caching and async fetching)
const sprite = await window.RedGlitchAssetManager.loadAsset('my_sprite_id');

// Register a new file dropped onto the browser
window.RedGlitchAssetManager.importAsset(fileObject, 'assets/new_image.png');
```

---

## 2. EventBus (`EventBus.js`)
**Role:** The nervous system. It connects independent browser windows (Tools) and the Node.js backend.

### Architecture
It is a **hybrid Pub/Sub system**:
1.  **Local Bus**: events emitted in one window are handled by listeners in the same window.
2.  **Network Bus**: events are serialized to JSON and sent via WebSocket to the Server, which then broadcasts them to all other connected clients.

### Key Events
*   `asset:modified`: Fired when a file changes on disk (detected by server `chokidar`).
*   `project:saved`: Fired when the user saves their work.
*   `state:changed`: Fired when a tool modifies the shared project state.

```ascii
[Tool A] -> emit('update') -> [Server] -> broadcast -> [Tool B]
                                       -> broadcast -> [Game Runtime]
```

---

## 3. SharedProjectState (`SharedProjectState.js`)
**Role:** The brain. It manages the current session's state.

### Capabilities
*   **Centralized State Tree**: A JSON object representing the entire project configuration.
*   **Undo/Redo History**: Maintains a stack of state snapshots (up to 50 steps).
*   **Activity Logging**: Tracks user actions ("Opened Map Editor", "Edited Script") which are displayed on the Dashboard's "Recent Activity" feed.
*   **Auto-Save**: Periodically pushes dirty state to the server.

### Usage
```javascript
// Set a value (automatically triggers 'state:changed' event and adds to Undo stack)
window.RedGlitchProjectState.set('settings.gravity', 9.8);

// Watch for changes
window.RedGlitchProjectState.watch('settings.gravity', (newValue) => {
    console.log("Gravity changed to:", newValue);
});
```
