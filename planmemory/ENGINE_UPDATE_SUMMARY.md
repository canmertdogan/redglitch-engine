# redglitch ENGINE Update Summary

## Status Report
**Date:** February 7, 2026
**Version:** 0.7.2 (Patched)

### 1. Critical Fixes
- **WebSocket Crash:** Fixed a critical bug where `EventBus.js` would crash upon receiving binary data (Blobs) from file watchers, causing the UI to freeze or disconnect. Added robust Blob-to-Text conversion.
- **Asset Path 404s:** Fixed a persistent issue where project assets (JSON definitions, images) failed to load because the client was requesting raw file system paths (`projects/Default Project/...`) instead of virtual server routes (`dunyalar/...`). Patched `AssetManager.js` to automatically sanitize these paths.

### 2. Feature Enhancements
#### IsoPixel Studio
- **Vegetation Generator:** Added a procedural vegetation system to populate chunks with trees and plants based on density settings.
- **Props System:** Integrated the Props palette with categorized items (Nature, Furniture, Lighting).
- **Collision Types:** Added collision type painting (Solid, Passable, Wall, etc.).

#### Code Forge (Script Editor)
- **UI Overhaul:** Implemented a modern, professional UI with a proper menubar, settings dialog, and improved layout.

#### Dashboard
- **Latest Activities:** Fixed the activity tracking widget to properly sync data between windows using the shared event bus. Now displays tools used and files accessed in real-time.

### 3. User Instructions
- **Reload Required:** Please reload the application (Ctrl+R or View > Reload) to apply the client-side fixes for the Asset Manager and Event Bus.
- **Server:** No manual server restart is required as the critical fixes were applied to the client-side logic.

### 4. Known Issues / Next Steps
- The server-side `server.js` was patched but requires a full application restart to take effect. However, the client-side patch in `AssetManager.js` acts as a polyfill, so everything should work immediately.
