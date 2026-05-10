# Copilot Instructions for Ketebe Engine

## Project Overview

**Ketebe Engine** is a multi-platform game development studio and launcher built with Electron, capable of creating games across RPG, platformer, and isometric pixel art styles. It consists of:

- **Launcher & Studio**: Electron-based IDE with HTML/JS editors for game creation
- **Game Engines**: Three specialized runtime engines (rpg-topdown, platformer-2d, iso-pixel)
- **Multi-Platform Support**: Desktop (Electron/Windows), Web, and Android (Capacitor)

## Build, Test & Run Commands

### Development
- **Start Launcher**: `npm start` - Launches the Electron editor
- **Start Web Server**: `npm run server` - Runs Express server on port 3000 (for web-based editing)

### Building Games
- **Build Game for All Platforms**: `npm run build:game "ProjectName"`
- **Build for Electron Only**: `npm run build:game "ProjectName" electron`
- **Build for Android Only**: `npm run build:game "ProjectName" android`
  - Syncs with Capacitor and prepares Android project

### Building Adapters
- **Build Android Adapter**: `node build-adapter.js` - Bundles `src-android/adapter.js` to `public/js/android-adapter.bundle.js`

### Packaging
- **Package Electron App**: `npm run dist` - Uses electron-builder to create Windows installer

## Architecture Overview

### Key Directory Structure

```
public/                    # Engine & editor UI files
├── engines/               # Runtime engines
│   ├── rpg-topdown/      # Top-down RPG engine (main)
│   ├── platformer-2d/    # 2D platformer physics engine
│   └── iso-pixel/        # Isometric pixel art renderer
├── *_editor.js           # Web-based editors (HTML/JS pairs)
├── index.html            # Launcher dashboard
└── base_game/            # RPG engine assets (sprites, logic)

projects/                  # User projects
├── Default Project/
├── Iso Pixel Demo/
└── Platformer Demo/
```

### Core Runtime System (RPG-Topdown Engine)

The main game engine (`public/engines/rpg-topdown/main.js`) is a hybrid architecture with:

- **Logger Hook**: Sends console logs to DevTools via `window.opener.postMessage()`
- **AtmosphereSystem**: Global environment & visual effects
- **Save/Load System**: Persistent game state via `/api/save` endpoints
- **Quest/Achievement System**: Game progression tracking
- **Dialogue & Cutscene System**: Narrative content
- **Logic Runtime**: Executes game logic from `/api/logic` JSON/JS files
- **UI Renderer**: Canvas-based UI system
- **State Machine**: Game state management
- **Input Handler**: Keyboard/gamepad input

### Web Server Architecture (Express)

The `server.js` (built by `build-game.js` or as root entry) handles:

- **Static Files**: Serves `public/` directory
- **Save Persistence**: `GET/POST /api/save/:username/:slot` → user data storage
- **Profile Management**: `GET/POST /api/profile/:username`
- **Logic Serving**: `GET /api/logic/:name` (JSON) and `/api/logic/js/:name` (JavaScript)
- **Brain System**: `GET /api/brains/list` - AI behavior definitions
- **Electron Integration**: Auto-detects Electron and uses `electronApp.getPath('userData')`
- **Fallback**: Non-Electron mode stores saves in local `saves/` directory

### Multi-Platform Deployment

**Electron (Windows)**:
- Root `electron-main.js` creates splash screen → main window
- Embeds Express server internally (port 3000)
- Custom titlebar with IPC handlers (window-minimize, window-maximize, window-resize, window-close)
- DevTools accessible via menu

**Android (Capacitor)**:
- `capacitor.config.ts` points webDir to `public/`
- Uses Capacitor filesystem & preferences plugins
- Adapter bundle injected via `build-adapter.js`
- Sync process in `build-game.js` temporarily swaps config path

**Web**:
- Standard Express static server
- Same API endpoints work for save/load
- Uses browser localStorage fallback if no server backend

## Key Conventions

### Project Metadata
- Each project has a `ketebe.json` file specifying:
  - `engineType`: "rpg-topdown" | "platformer-2d" | "iso-pixel"
  - `name`, `author`, `version`, `description`

### Asset Organization per Engine Type
Projects follow a standard structure:
- `dunyalar/` - World/map definitions
- `muzikler/` - Audio files
- `data/` - Logic, brains, configs (game-specific logic)
- `sprites.js` - Custom sprite definitions (injected into `base_game/`)

### Editor Pattern
Each editor (*_editor.js) follows a consistent pattern:
- HTML file for UI layout
- Paired .js file for logic
- Communicates with launcher via IPC or shared state
- Exports data to project structure

### Build Output Structure
`build-game.js` creates:
- `dist/game/public/` - Bundled game assets
- `dist/game/server.js` - Embedded Express server
- `dist/game/main.js` - Electron entry point (for electron builds)
- `dist/game/package.json` - Dependency manifest
- `dist/game/release/` - Packaged executable (electron-packager output)

### Whitelist Approach
`build-game.js` uses an allowlist when copying `public/`:
- **Allowed dirs**: `engines`, `base_game`, `fonts`, `js`, `lib`, `muzikler`, `sprite-art`, `dunyalar`, `data`, `oyuncu_profilleri`
- **Allowed files**: `index.html`, `splash.html`, `credits.html`, `favicon.ico`, `pixel_scrollbars.css`
- **Excludes**: Editor tools and launcher-specific files

### Engine Strategy Pattern
Engine selection is determined by `engineType` in ketebe.json:
- Engines expose `Strategy` classes (TopDownStrategy, PlatformerStrategy, IsoStrategy)
- Each strategy defines rendering, physics, and input handling
- Used by the state machine to swap behaviors at runtime

### Save File Format
Saves stored as `{username}_{slot}.json` containing:
- Game state variables
- Player position/inventory
- Quest progress
- Any custom serialized data

Profiles stored as `profile_{username}.json` with character stats (hp, mana, stamina, etc.)

### Console Logging & Debugging
- Game logs post to DevTools via `window.opener` when launched from editor
- DevTools console.html listens for postMessage events
- Full async logging preserved without circular reference issues

## Common Workflows

### Adding a New Editor
1. Create `public/{feature}_editor.html` and `public/{feature}_editor.js`
2. Add a menu item or dashboard link pointing to the editor
3. Use project-relative paths for saving (e.g., `projects/{projectName}/data/`)
4. Follow the existing *_editor.js patterns for consistency

### Creating a New Engine Strategy
1. Add strategy file: `public/engines/{engine-name}/strategies/{NewStrategy}.js`
2. Implement required methods: `initialize()`, `update()`, `render()`, `handleInput()`
3. Export class and integrate with state machine in engine's main.js
4. Test via demo project with matching `engineType`

### Deploying a Game
1. Verify project has valid `ketebe.json` with correct `engineType`
2. Run: `npm run build:game "ProjectName" [electron|android|all]`
3. For Electron: outputs to `dist/game/release/`
4. For Android: opens Android Studio with Capacitor sync complete
5. For Web: serve `dist/game/public/` directory with embedded server

### Debugging Runtime Issues
1. Launch game in editor and open DevTools (View → Toggle DevTools)
2. Check console for logs (auto-captured via window.opener hook)
3. Inspect network tab to verify `/api/logic/` and `/api/save/` calls
4. Check `localStorage` or user data directory for save state if applicable

## MCP Servers

**Playwright** is enabled for this project to support web and Electron testing:
- Automate launcher UI testing
- Test game runtime behavior
- Verify save/load mechanics
- Validate multi-platform game exports
