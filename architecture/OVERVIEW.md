# RedGlitch Engine Architecture Overview

## High-Level System Architecture

REDGLITCH ENGINE is a **hybrid web-desktop game development environment**. It uses a local Node.js server to provide filesystem access and project management, while the entire IDE and Game Runtime operate as a Single Page Application (SPA) suite within the browser (or Electron container).

```ascii
+-------------------------------------------------------+
|                   USER WORKSTATION                    |
+-------------------------------------------------------+
|                                                       |
|  +-------------------+      +----------------------+  |
|  |   Node.js Server  |<---->|   Browser / Electron |  |
|  |   (server.js)     |      |       (Client)       |  |
|  +-------------------+      +----------------------+  |
|           ^                            ^              |
|           | (File I/O)                 | (UI/Game)    |
|           v                            v              |
|  +-------------------+      +----------------------+  |
|  |   File System     |      |  1. Dashboard (IDE)  |  |
|  | - /projects       |      |  2. Game Runtime     |  |
|  | - /public (Core)  |      |  3. Editors (Tools)  |  |
|  +-------------------+      +----------------------+  |
|                                                       |
+-------------------------------------------------------+
```

## Core Components

### 1. The Server (`server.js`)
The backbone of the local development environment. It does not run the game logic but facilitates the development process.
*   **Static File Serving**: Serves the core engine files from `public/` and project-specific assets from `projects/<active_project>/`. It implements a "shadow" file system where project files override core defaults.
*   **API Layer**: Provides REST endpoints (`/api/...`) for:
    *   **Project Management**: Creating, listing, deleting, and switching projects.
    *   **IDE Operations**: Reading/Writing code files, listing directory contents.
    *   **Asset Management**: Uploading assets, managing templates.
*   **WebSocket Server**: Facilitates real-time communication (Hot Reloading, Event Broadcasting) between the IDE windows and the Runtime.

### 2. The Client (Frontend)
Located in `public/`, this is where the engine actually lives. It is split into three layers:

#### A. Shared Infrastructure (The "Kernel")
These components are loaded by both the IDE and the Game Runtime to ensure consistency.
*   **AssetManager (`AssetManager.js`)**: The single source of truth for loading images, audio, and JSON data. Handles path resolution (Core vs. Project).
*   **EventBus (`EventBus.js`)**: A pub/sub system wrapping the WebSocket client. Allows tools (e.g., `npc_editor`) to send "Update" events that the running game listens to for live updates.
*   **State Management**: Handles global project configuration.

#### B. The Engines (The "Runtime")
RedGlitch supports multiple engine paradigms, residing in `public/engines/`.
1.  **IsoPixel**: Isometric rendering, dynamic lighting, 2.5D depth sorting.
2.  **RPG Top-Down**: Classic 2D tile-based rendering, turn-based or real-time logic.
3.  **Platformer 2D**: Side-scrolling physics and camera systems.

#### C. The Tools (The "IDE")
A suite of specialized HTML/JS applications for content creation.
*   **Dashboard (`dashboard.html`)**: The main hub for launching projects and tools.
*   **Code Forge (`script_editor.html`)**: A Monaco-based code editor for editing game scripts.
*   **Iso Studio (`iso_editor.html`)**: Level designer for the IsoPixel engine.
*   **Specialized Editors**: `npc_editor`, `dialogue_editor`, `quest_editor`, etc.

## Data Flow Diagram

```ascii
[ Disk Storage ]
      |
      | (JSON / PNG / JS)
      v
[ Node.js Server ]
      |
      | (HTTP GET / API)
      v
[ AssetManager ] <----(Request)----+
      |                            |
      | (Blobs / Objects)          |
      v                            |
[ Game Runtime ] <== (WebSocket) ==> [ IDE / Tools ]
(Rendering Loop)      (EventBus)     (User Input)
```

## Directory Structure Strategy

The engine uses a **Project Overlay** strategy.
*   **Root (`/`)**: The engine's source code.
*   **`public/`**: The "Immutable" Core. Contains the default engine code, editors, and default assets.
*   **`projects/MyGame/`**: The "Mutable" Project. Contains *only* what the user has created or modified.

When the browser requests `GET /sprites.js`:
1.  Server checks `projects/MyGame/sprites.js`.
2.  If found -> Serve it.
3.  If not found -> Serve `public/engines/.../sprites.js`.

This allows projects to be lightweight and upgradeable, as they don't need to copy the entire engine source code.
